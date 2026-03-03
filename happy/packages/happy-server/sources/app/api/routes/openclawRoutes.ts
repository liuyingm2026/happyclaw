/**
 * OpenClaw Integration Routes
 *
 * API endpoints for OpenClaw Channel Plugin and Happy App clients
 */
import { type Fastify } from "../types";
import { z } from "zod";
import { db } from "@/storage/db";
import { log } from "@/utils/log";
import { randomKeyNaked } from "@/utils/randomKeyNaked";
import {
    verifyHMACSignature,
    checkAndStoreNonce,
    getGatewayToken,
} from "@/modules/openclawAuth";
import {
    getOrCreateConversation,
    listConversations,
    touchConversation,
} from "@/modules/openclawMapping";
import {
    storeEncryptedMessage,
    storeStreamingChunk,
    completeStreamingMessage,
    getEncryptedMessages,
    hasEncryptionKeys,
    storeConversationPublicKey,
} from "@/modules/openclawE2E";
import { eventRouter } from "@/app/events/eventRouter";
import { getOpenClawStatus } from "@/modules/openclawGatewayInit";

// Environment configuration
const OPENCLAW_CHANNEL_SECRET = process.env.OPENCLAW_CHANNEL_SECRET || '';
const HAPPY_OPENCLAW_ENABLED = process.env.HAPPY_OPENCLAW_ENABLED === 'true';

export function openclawRoutes(app: Fastify) {

    // ============================================
    // Public Endpoints (no auth required)
    // ============================================

    // Gateway connection status (public, for monitoring)
    app.get('/v1/openclaw/gateway-status', async (request, reply) => {
        const status = getOpenClawStatus();
        return reply.send({
            enabled: status.enabled,
            connected: status.connected,
            gatewayUrl: status.connected ? status.gatewayUrl : null,
            timestamp: Date.now(),
        });
    });

    // ============================================
    // Plugin -> Server Endpoints (HMAC authenticated)
    // ============================================

    // Middleware for HMAC authentication
    const hmacAuthMiddleware = async (request: any, reply: any) => {
        if (!HAPPY_OPENCLAW_ENABLED) {
            return reply.status(503).send({ error: 'OpenClaw integration disabled' });
        }

        const signature = request.headers['x-happy-signature'];
        const timestamp = parseInt(request.headers['x-happy-timestamp'] || '0', 10);
        const nonce = request.headers['x-happy-nonce'];

        if (!signature || !timestamp || !nonce) {
            return reply.status(401).send({ error: 'Missing authentication headers' });
        }

        const body = request.body ? JSON.stringify(request.body) : '';
        const result = verifyHMACSignature(
            OPENCLAW_CHANNEL_SECRET,
            body,
            signature as string,
            timestamp,
            nonce as string
        );

        if (!result.valid) {
            log('warn', 'OpenClaw HMAC verification failed', { error: result.error });
            return reply.status(401).send({ error: result.error });
        }

        // Check nonce for replay protection
        const nonceValid = await checkAndStoreNonce(nonce as string);
        if (!nonceValid) {
            return reply.status(409).send({ error: 'Replay attack detected' });
        }
    };

    // Webhook: Receive messages from Plugin
    app.post('/v1/openclaw/webhook', {
        preHandler: hmacAuthMiddleware,
        schema: {
            body: z.object({
                conversationId: z.string(),
                messageId: z.string(),
                role: z.enum(['user', 'assistant']),
                content: z.string(), // Base64 encoded encrypted content
                openclawSessionId: z.string().optional(),
                timestamp: z.number(),
            }),
        },
    }, async (request, reply) => {
        const { conversationId, messageId, role, content, openclawSessionId } = request.body as any;

        // Store encrypted message
        const encryptedContent = Buffer.from(content, 'base64');
        await storeEncryptedMessage(conversationId, messageId, role, encryptedContent);

        // Update conversation activity
        await touchConversation(conversationId);

        // Broadcast to connected clients via event router
        // eventRouter.broadcast(conversationId, 'openclaw-message', { ... });

        return reply.send({ success: true, messageId });
    });

    // Webhook: Receive streaming chunks from Plugin
    app.post('/v1/openclaw/chunk', {
        preHandler: hmacAuthMiddleware,
        schema: {
            body: z.object({
                conversationId: z.string(),
                messageId: z.string(),
                chunk: z.string(), // Base64 encoded encrypted chunk
                seq: z.number(),
                isComplete: z.boolean(),
                timestamp: z.number(),
            }),
        },
    }, async (request, reply) => {
        const { conversationId, messageId, chunk, seq, isComplete } = request.body as any;

        const chunkBuffer = Buffer.from(chunk, 'base64');
        await storeStreamingChunk(conversationId, messageId, chunkBuffer, seq);

        if (isComplete) {
            await completeStreamingMessage(messageId);
        }

        return reply.send({ success: true });
    });

    // Health check from Plugin
    app.get('/v1/openclaw/health', {
        preHandler: hmacAuthMiddleware,
    }, async (request, reply) => {
        return reply.send({
            status: 'ok',
            timestamp: Date.now(),
        });
    });

    // ============================================
    // Client API Endpoints (JWT authenticated)
    // ============================================

    // List OpenClaw conversations
    app.get('/v1/openclaw/conversations', {
        preHandler: app.authenticate,
        schema: {
            querystring: z.object({
                cursor: z.string().optional(),
                limit: z.coerce.number().int().min(1).max(100).default(20),
            }),
        },
    }, async (request, reply) => {
        const userId = request.userId!;
        const { cursor, limit } = request.query as any;

        const result = await listConversations(userId, { cursor, limit });

        return reply.send({
            conversations: result.conversations.map((c) => ({
                id: c.id,
                title: c.title,
                lastActiveAt: c.lastActiveAt.getTime(),
                active: c.active,
                createdAt: c.createdAt.getTime(),
            })),
            nextCursor: result.nextCursor,
            hasMore: result.hasMore,
        });
    });

    // Create new conversation
    app.post('/v1/openclaw/conversations', {
        preHandler: app.authenticate,
        schema: {
            body: z.object({
                title: z.string().optional(),
                publicKey: z.string(), // User's public key for E2E
            }),
        },
    }, async (request, reply) => {
        const userId = request.userId!;
        const { title, publicKey } = request.body as any;

        // Generate new OpenClaw session ID
        const openclawSessionId = `oc_${randomKeyNaked()}`;

        const { id: conversationId, isNew } = await getOrCreateConversation(
            userId,
            openclawSessionId,
            title
        );

        // Store public key for E2E encryption
        await storeConversationPublicKey(conversationId, userId, publicKey);

        return reply.send({
            conversationId,
            openclawSessionId,
            isNew,
        });
    });

    // Get messages for a conversation
    app.get('/v1/openclaw/conversations/:id/messages', {
        preHandler: app.authenticate,
        schema: {
            params: z.object({ id: z.string() }),
            querystring: z.object({
                afterSeq: z.coerce.number().int().optional(),
                limit: z.coerce.number().int().min(1).max(100).default(50),
            }),
        },
    }, async (request, reply) => {
        const userId = request.userId!;
        const { id: conversationId } = request.params as any;
        const { afterSeq, limit } = request.query as any;

        // Verify conversation belongs to user
        const conversation = await db.openClawConversation.findFirst({
            where: { id: conversationId, accountId: userId },
        });

        if (!conversation) {
            return reply.status(404).send({ error: 'Conversation not found' });
        }

        const messages = await getEncryptedMessages(conversationId, { afterSeq, limit });

        return reply.send({
            messages: messages.map((m) => ({
                id: m.id,
                seq: m.seq,
                role: m.role,
                content: m.content.toString('base64'),
                status: m.status,
                createdAt: m.createdAt.getTime(),
            })),
            hasMore: messages.length === limit,
        });
    });

    // Send message to OpenClaw
    app.post('/v1/openclaw/conversations/:id/messages', {
        preHandler: app.authenticate,
        schema: {
            params: z.object({ id: z.string() }),
            body: z.object({
                content: z.string(), // Base64 encoded encrypted content
                idempotencyKey: z.string(),
            }),
        },
    }, async (request, reply) => {
        const userId = request.userId!;
        const { id: conversationId } = request.params as any;
        const { content, idempotencyKey } = request.body as any;

        // Verify conversation belongs to user
        const conversation = await db.openClawConversation.findFirst({
            where: { id: conversationId, accountId: userId },
        });

        if (!conversation) {
            return reply.status(404).send({ error: 'Conversation not found' });
        }

        // Store user message
        const messageId = `msg_${randomKeyNaked()}`;
        const encryptedContent = Buffer.from(content, 'base64');
        await storeEncryptedMessage(conversationId, messageId, 'user', encryptedContent, idempotencyKey);

        // TODO: Forward message to Plugin via internal queue/notify

        return reply.send({
            messageId,
            status: 'pending',
        });
    });

    // Get Gateway status
    app.get('/v1/openclaw/status', {
        preHandler: app.authenticate,
    }, async (request, reply) => {
        const userId = request.userId!;

        // Check if user has configured Gateway
        const vault = await db.openClawTokenVault.findFirst({
            where: { accountId: userId },
        });

        return reply.send({
            connected: vault !== null,
            gatewayUrl: vault?.gatewayUrl ?? null,
            lastConnectedAt: vault?.updatedAt.getTime() ?? null,
        });
    });

    // ============================================
    // Token Management Endpoints
    // ============================================

    // Store/Update Gateway token
    app.post('/v1/openclaw/token', {
        preHandler: app.authenticate,
        schema: {
            body: z.object({
                gatewayUrl: z.string().url(),
                token: z.string(),
            }),
        },
    }, async (request, reply) => {
        const userId = request.userId!;
        const { gatewayUrl, token } = request.body as any;

        const { storeGatewayToken } = await import('@/modules/openclawAuth');
        await storeGatewayToken(userId, gatewayUrl, token);

        return reply.send({ success: true });
    });
}
