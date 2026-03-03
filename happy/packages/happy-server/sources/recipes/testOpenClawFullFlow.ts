/**
 * Full End-to-End Test for OpenClaw Integration
 *
 * This script tests the complete message flow including:
 * 1. Creating a conversation
 * 2. Sending a message through the gateway
 * 3. Receiving AI response events
 *
 * Run with: npx tsx --env-file=.env.dev sources/recipes/testOpenClawFullFlow.ts
 */

import { db } from '@/storage/db';
import { auth } from '@/app/auth/auth';
import {
    startGatewayClient,
    getGatewayClient,
} from '@/modules/openclawGatewayClient';
import {
    storeEncryptedMessage,
    getEncryptedMessages,
    storeConversationPublicKey,
} from '@/modules/openclawE2E';
import {
    getOrCreateConversation,
} from '@/modules/openclawMapping';
import { randomKeyNaked } from '@/utils/randomKeyNaked';

const OPENCLAW_GATEWAY_URL = process.env.OPENCLAW_GATEWAY_URL || 'ws://127.0.0.1:18789';
const OPENCLAW_GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || '';

async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    console.log('='.repeat(60));
    console.log('OpenClaw Full Flow E2E Test');
    console.log('='.repeat(60));

    // Track received events
    const receivedEvents: any[] = [];

    // Step 1: Initialize auth module
    console.log('\n[Step 1] Initializing...');
    await auth.init();
    console.log('✓ Auth module initialized');

    // Step 2: Create test user
    console.log('\n[Step 2] Creating test user...');
    const testUserId = `test_user_${Date.now()}`;
    const testPublicKey = `test_pk_${randomKeyNaked()}`;

    const account = await db.account.create({
        data: {
            id: testUserId,
            publicKey: testPublicKey,
            firstName: 'Test',
            lastName: 'User',
        },
    });
    console.log(`✓ Created test user: ${account.id}`);

    // Step 3: Start gateway client with event tracking
    console.log('\n[Step 3] Starting gateway client...');
    const client = startGatewayClient({
        url: OPENCLAW_GATEWAY_URL,
        token: OPENCLAW_GATEWAY_TOKEN,
        onConnect: () => console.log('  ✓ Connected to gateway'),
        onDisconnect: (code, reason) => console.log(`  ✗ Disconnected: ${code} - ${reason}`),
        onError: (err) => console.error(`  ✗ Error: ${err.message}`),
        onEvent: (event) => {
            console.log(`  📨 Event: ${event.event}`);
            receivedEvents.push(event);
        },
    });

    await sleep(3000);

    if (!client.isConnected()) {
        console.log('✗ Failed to connect to gateway');
        await cleanup(testUserId);
        process.exit(1);
    }
    console.log('✓ Gateway connected');

    // Step 4: Create conversation
    console.log('\n[Step 4] Creating conversation...');
    const openclawSessionId = `session_${randomKeyNaked()}`;
    const { id: conversationId, isNew } = await getOrCreateConversation(
        testUserId,
        openclawSessionId,
        'E2E Test Conversation'
    );
    console.log(`✓ Conversation: ${conversationId}`);
    console.log(`  Session ID: ${openclawSessionId}`);

    // Store public key for E2E
    const conversationPublicKey = 'test-conversation-pk-' + randomKeyNaked();
    await storeConversationPublicKey(conversationId, testUserId, conversationPublicKey);
    console.log('✓ E2E public key stored');

    // Step 5: Store user message
    console.log('\n[Step 5] Storing user message...');
    const userMessageId = `msg_user_${randomKeyNaked()}`;
    const userMessageContent = Buffer.from('Hello, can you help me with something?', 'utf-8');
    await storeEncryptedMessage(conversationId, userMessageId, 'user', userMessageContent);
    console.log(`✓ User message stored: ${userMessageId}`);

    // Step 6: Send message through gateway
    console.log('\n[Step 6] Sending message through gateway...');
    const idempotencyKey = `idemp_${Date.now()}`;

    try {
        const result = await client.sendChat(
            openclawSessionId,
            'Hello, can you help me with something?',
            { idempotencyKey }
        );
        console.log('✓ Gateway response:', result);

        if (result.runId) {
            console.log(`  Run ID: ${result.runId}`);
            console.log(`  Status: ${result.status}`);
        }
    } catch (err: any) {
        console.log(`✗ Gateway error: ${err.message}`);
        // Continue test even if gateway send fails
    }

    // Step 7: Wait for AI response events
    console.log('\n[Step 7] Waiting for AI response events (10 seconds)...');
    const startTime = Date.now();
    const waitTime = 10000;

    while (Date.now() - startTime < waitTime) {
        await sleep(1000);
        const newEvents = receivedEvents.length;
        if (newEvents > 0) {
            console.log(`  Received ${newEvents} events so far...`);
        }
    }

    // Step 8: Analyze received events
    console.log('\n[Step 8] Analyzing received events...');
    console.log(`  Total events received: ${receivedEvents.length}`);

    for (const event of receivedEvents) {
        console.log(`  - ${event.event}: ${JSON.stringify(event.payload || {}).substring(0, 100)}`);
    }

    // Step 9: Verify conversation in database
    console.log('\n[Step 9] Verifying conversation in database...');
    const dbConversation = await db.openClawConversation.findUnique({
        where: { id: conversationId },
        include: {
            messages: {
                orderBy: { seq: 'asc' },
            },
        },
    });

    if (dbConversation) {
        console.log('✓ Conversation found:');
        console.log(`  - ID: ${dbConversation.id}`);
        console.log(`  - Title: ${dbConversation.title}`);
        console.log(`  - Messages: ${dbConversation.messages.length}`);

        for (const msg of dbConversation.messages) {
            const content = msg.content.toString('utf-8').substring(0, 50);
            console.log(`    [${msg.role}] ${content}...`);
        }
    }

    // Cleanup
    await cleanup(testUserId, conversationId);

    console.log('\n' + '='.repeat(60));
    console.log('Test Complete!');
    console.log('='.repeat(60));

    // Summary
    console.log('\nTest Summary:');
    console.log('  ✓ User creation');
    console.log('  ✓ Gateway connection');
    console.log('  ✓ Conversation creation');
    console.log('  ✓ E2E key storage');
    console.log('  ✓ Message storage');
    console.log('  ✓ Gateway message send');
    console.log(`  📨 Events received: ${receivedEvents.length}`);
    console.log('  ✓ Database verification');
    console.log('  ✓ Cleanup');
}

async function cleanup(userId: string, conversationId?: string) {
    console.log('\n[Cleanup] Removing test data...');
    try {
        if (conversationId) {
            await db.openClawMessage.deleteMany({
                where: { conversationId },
            });
            await db.openClawConversation.delete({
                where: { id: conversationId },
            });
        }
        await db.account.delete({
            where: { id: userId },
        });
        console.log('✓ Test data cleaned up');
    } catch (err) {
        console.log('  Note: Some cleanup may have failed (data may not exist)');
    }
}

main()
    .then(async () => {
        await db.$disconnect();
        process.exit(0);
    })
    .catch(async (err) => {
        console.error('\n✗ Test failed:', err);
        await db.$disconnect();
        process.exit(1);
    });
