/**
 * OpenClaw Gateway Integration
 *
 * Initializes and manages the connection between happy-server and OpenClaw Gateway.
 * This module is imported during server startup to enable OpenClaw integration.
 */
import {
    startGatewayClient,
    getGatewayClient,
    OpenClawGatewayClient,
    GatewayEvent,
} from './openclawGatewayClient';
import { log } from '@/utils/log';
import { db } from '@/storage/db';
import { storeEncryptedMessage } from './openclawE2E';

// Check if OpenClaw integration is enabled
const OPENCLAW_ENABLED = process.env.HAPPY_OPENCLAW_ENABLED === 'true';
const OPENCLAW_GATEWAY_URL = process.env.OPENCLAW_GATEWAY_URL || 'ws://127.0.0.1:18789';
const OPENCLAW_GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || '';

let initialized = false;

/**
 * Initialize OpenClaw Gateway connection
 */
export function initOpenClawGateway(): OpenClawGatewayClient | null {
    if (!OPENCLAW_ENABLED) {
        log('info', '[OpenClaw] Integration disabled');
        return null;
    }

    if (initialized) {
        return getGatewayClient();
    }

    log('info', `[OpenClaw] Initializing gateway connection to ${OPENCLAW_GATEWAY_URL}`);

    const client = startGatewayClient({
        url: OPENCLAW_GATEWAY_URL,
        token: OPENCLAW_GATEWAY_TOKEN,

        onConnect: () => {
            log('info', '[OpenClaw] Gateway connected - ready to receive messages');
        },

        onDisconnect: (code, reason) => {
            log('warn', `[OpenClaw] Gateway disconnected: ${code} - ${reason}`);
        },

        onError: (error) => {
            log('error', `[OpenClaw] Gateway error: ${error.message}`);
        },

        onEvent: async (event: GatewayEvent) => {
            await handleGatewayEvent(event);
        },
    });

    initialized = true;
    return client;
}

/**
 * Handle events from OpenClaw Gateway
 */
async function handleGatewayEvent(event: GatewayEvent): Promise<void> {
    log('debug', `[OpenClaw] Received event: ${event.event}`);

    try {
        switch (event.event) {
            case 'chat.message':
                await handleChatMessage(event.payload);
                break;

            case 'chat.stream':
                await handleChatStream(event.payload);
                break;

            case 'session.started':
                log('info', '[OpenClaw] Session started', { sessionId: event.payload?.sessionId });
                break;

            case 'session.ended':
                log('info', '[OpenClaw] Session ended', { sessionId: event.payload?.sessionId });
                break;

            default:
                // Log unhandled events
                log('debug', `[OpenClaw] Unhandled event: ${event.event}`);
        }
    } catch (err) {
        log('error', `[OpenClaw] Error handling event ${event.event}: ${err}`);
    }
}

/**
 * Handle incoming chat message from OpenClaw
 */
async function handleChatMessage(payload: any): Promise<void> {
    if (!payload) return;

    const {
        conversationId,
        messageId,
        text,
        sessionId,
        channel,
    } = payload;

    // Only process messages from happy channel
    if (channel !== 'happy') {
        return;
    }

    log('info', `[OpenClaw] Received message for conversation ${conversationId}`);

    // Find the conversation in our database
    const conversation = await db.openClawConversation.findFirst({
        where: {
            OR: [
                { id: conversationId },
                { openclawSessionId: sessionId },
            ],
            active: true,
        },
    });

    if (!conversation) {
        log('warn', `[OpenClaw] Conversation not found: ${conversationId}`);
        return;
    }

    // Store the message
    try {
        await storeEncryptedMessage(
            conversation.id,
            messageId || `msg_${Date.now()}`,
            'assistant',
            Buffer.from(text || '', 'utf-8')
        );

        log('info', `[OpenClaw] Stored message ${messageId} for conversation ${conversation.id}`);

        // TODO: Notify connected clients via WebSocket/EventSource

    } catch (err) {
        log('error', `[OpenClaw] Failed to store message: ${err}`);
    }
}

/**
 * Handle streaming chat chunk from OpenClaw
 */
async function handleChatStream(payload: any): Promise<void> {
    if (!payload) return;

    const {
        conversationId,
        messageId,
        chunk,
        isComplete,
        sessionId,
    } = payload;

    log('debug', `[OpenClaw] Stream chunk for ${conversationId}: ${chunk?.substring(0, 50)}...`);

    // TODO: Implement streaming message storage
    // For now, just log the chunk
    if (isComplete) {
        log('info', `[OpenClaw] Stream complete for message ${messageId}`);
    }
}

/**
 * Send message to OpenClaw Gateway
 */
export async function sendToOpenClaw(
    conversationId: string,
    text: string,
    options?: {
        accountId?: string;
        replyToId?: string;
    }
): Promise<any> {
    const client = getGatewayClient();

    if (!client.isConnected()) {
        throw new Error('OpenClaw Gateway not connected');
    }

    // Get conversation to find OpenClaw session ID
    const conversation = await db.openClawConversation.findUnique({
        where: { id: conversationId },
        select: { openclawSessionId: true },
    });

    if (!conversation?.openclawSessionId) {
        throw new Error('Conversation has no OpenClaw session');
    }

    // Send to OpenClaw
    return client.sendChat(
        conversation.openclawSessionId,
        text,
        {
            idempotencyKey: options?.idempotencyKey,
        }
    );
}

/**
 * Check if OpenClaw Gateway is connected
 */
export function isOpenClawConnected(): boolean {
    if (!OPENCLAW_ENABLED) {
        return false;
    }

    const client = getGatewayClient();
    return client.isConnected();
}

/**
 * Get OpenClaw Gateway status
 */
export function getOpenClawStatus(): {
    enabled: boolean;
    connected: boolean;
    gatewayUrl: string;
} {
    return {
        enabled: OPENCLAW_ENABLED,
        connected: isOpenClawConnected(),
        gatewayUrl: OPENCLAW_ENABLED ? OPENCLAW_GATEWAY_URL : '',
    };
}
