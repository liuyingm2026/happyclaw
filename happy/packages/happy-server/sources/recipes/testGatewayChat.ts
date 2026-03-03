/**
 * Test OpenClaw Gateway Chat
 *
 * This script tests sending a message through the OpenClaw Gateway.
 *
 * Run with: npx tsx --env-file=.env.dev sources/recipes/testGatewayChat.ts
 */

import {
    startGatewayClient,
    getGatewayClient,
} from '@/modules/openclawGatewayClient';

const OPENCLAW_GATEWAY_URL = process.env.OPENCLAW_GATEWAY_URL || 'ws://127.0.0.1:18789';
const OPENCLAW_GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || '';

async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    console.log('='.repeat(60));
    console.log('OpenClaw Gateway Chat Test');
    console.log('='.repeat(60));

    // Start gateway client
    console.log('\n[1] Starting gateway client...');
    const client = startGatewayClient({
        url: OPENCLAW_GATEWAY_URL,
        token: OPENCLAW_GATEWAY_TOKEN,
        onConnect: () => console.log('  ✓ Connected to gateway'),
        onDisconnect: (code, reason) => console.log(`  ✗ Disconnected: ${code} - ${reason}`),
        onError: (err) => console.error(`  ✗ Error: ${err.message}`),
        onEvent: (event) => console.log(`  📨 Event: ${event.event}`),
    });

    // Wait for connection
    console.log('  Waiting for connection...');
    await sleep(3000);

    if (!client.isConnected()) {
        console.log('✗ Failed to connect to gateway');
        process.exit(1);
    }

    console.log('✓ Gateway connected');

    // Get device identity
    const identity = client.getIdentity();
    console.log('\n[2] Device Identity:');
    console.log(`  Device ID: ${identity.deviceId}`);
    console.log(`  Public Key: ${identity.publicKeyPem.substring(0, 50)}...`);

    // Test available methods
    console.log('\n[3] Testing gateway methods...');

    // Try to get available methods
    const testMethods = [
        { method: 'about', params: {} },
        { method: 'session.create', params: { type: 'chat' } },
        { method: 'chat.send', params: {
            sessionKey: 'test-session',
            message: 'Hello from happy-server!',
            idempotencyKey: `idemp_${Date.now()}`
        }},
    ];

    for (const { method, params } of testMethods) {
        console.log(`\n  Testing: ${method}`);
        try {
            const result = await client.request(method, params, 10000);
            console.log(`  ✓ Result:`, JSON.stringify(result, null, 2).substring(0, 200));
        } catch (err: any) {
            console.log(`  ✗ Error: ${err.message}`);
        }
    }

    console.log('\n' + '='.repeat(60));
    console.log('Test Complete!');
    console.log('='.repeat(60));
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('\n✗ Test failed:', err);
        process.exit(1);
    });
