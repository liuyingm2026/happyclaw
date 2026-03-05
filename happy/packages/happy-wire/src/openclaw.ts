import * as z from 'zod';

// ============================================
// OpenClaw API Request/Response Schemas
// ============================================

// HMAC Signature header schema
export const HMACSignatureSchema = z.object({
    signature: z.string(),      // HMAC-SHA256 signature
    timestamp: z.number(),      // Unix timestamp in ms
    nonce: z.string(),          // Random nonce for replay protection
});
export type HMACSignature = z.infer<typeof HMACSignatureSchema>;

// Token vault schema (for encrypted token storage)
export const OpenClawTokenVaultSchema = z.object({
    gatewayUrl: z.string(),
    encryptedToken: z.string(),  // Base64 encoded encrypted token
    tokenVersion: z.number(),
});
export type OpenClawTokenVault = z.infer<typeof OpenClawTokenVaultSchema>;

// ============================================
// Plugin -> Server Request Schemas
// ============================================

// Webhook message from Plugin
export const OpenClawWebhookMessageSchema = z.object({
    conversationId: z.string(),
    messageId: z.string(),
    role: z.enum(['user', 'assistant']),
    content: z.string(),        // Encrypted content (base64)
    openclawSessionId: z.string().optional(),
    timestamp: z.number(),
});
export type OpenClawWebhookMessage = z.infer<typeof OpenClawWebhookMessageSchema>;

// Streaming chunk from Plugin
export const OpenClawStreamChunkSchema = z.object({
    conversationId: z.string(),
    messageId: z.string(),
    chunk: z.string(),          // Encrypted chunk (base64)
    seq: z.number(),            // Chunk sequence number
    isComplete: z.boolean(),
    timestamp: z.number(),
});
export type OpenClawStreamChunk = z.infer<typeof OpenClawStreamChunkSchema>;

// Health check from Plugin
export const OpenClawPluginHealthSchema = z.object({
    gatewayConnected: z.boolean(),
    gatewayUrl: z.string(),
    lastMessageAt: z.number().nullable(),
    activeConversations: z.number(),
});
export type OpenClawPluginHealth = z.infer<typeof OpenClawPluginHealthSchema>;

// ============================================
// Server -> Plugin Request Schemas
// ============================================

// Send message request to Plugin
export const OpenClawSendMessageSchema = z.object({
    conversationId: z.string(),
    content: z.string(),        // E2E encrypted content (base64)
    idempotencyKey: z.string(), // For deduplication
    openclawSessionId: z.string().optional(),
});
export type OpenClawSendMessage = z.infer<typeof OpenClawSendMessageSchema>;

// Token decrypt request from Plugin
export const OpenClawTokenDecryptRequestSchema = z.object({
    gatewayUrl: z.string(),
    accountId: z.string(),
});
export type OpenClawTokenDecryptRequest = z.infer<typeof OpenClawTokenDecryptRequestSchema>;

// Token decrypt response (encrypted for Plugin)
export const OpenClawTokenDecryptResponseSchema = z.object({
    encryptedToken: z.string(),  // Token encrypted with Plugin's key
    expiresAt: z.number(),       // Token expiry timestamp
});
export type OpenClawTokenDecryptResponse = z.infer<typeof OpenClawTokenDecryptResponseSchema>;

// ============================================
// Client API Request/Response Schemas
// ============================================

// List conversations request
export const OpenClawListConversationsRequestSchema = z.object({
    cursor: z.string().optional(),
    limit: z.number().min(1).max(100).default(20),
});
export type OpenClawListConversationsRequest = z.infer<typeof OpenClawListConversationsRequestSchema>;

// List conversations response
export const OpenClawListConversationsResponseSchema = z.object({
    conversations: z.array(z.object({
        id: z.string(),
        title: z.string().nullable(),
        lastMessageAt: z.number().nullable(),
        lastMessagePreview: z.string().nullable(),
        unreadCount: z.number(),
        active: z.boolean(),
    })),
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
});
export type OpenClawListConversationsResponse = z.infer<typeof OpenClawListConversationsResponseSchema>;

// Get messages request
export const OpenClawGetMessagesRequestSchema = z.object({
    conversationId: z.string(),
    cursor: z.string().optional(),
    limit: z.number().min(1).max(100).default(50),
});
export type OpenClawGetMessagesRequest = z.infer<typeof OpenClawGetMessagesRequestSchema>;

// Get messages response
export const OpenClawGetMessagesResponseSchema = z.object({
    messages: z.array(z.object({
        id: z.string(),
        role: z.enum(['user', 'assistant']),
        content: z.string(),      // E2E encrypted (base64)
        status: z.enum(['pending', 'streaming', 'complete', 'failed']),
        createdAt: z.number(),
    })),
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
});
export type OpenClawGetMessagesResponse = z.infer<typeof OpenClawGetMessagesResponseSchema>;

// Send message request (from client)
export const OpenClawClientSendMessageSchema = z.object({
    conversationId: z.string(),
    content: z.string(),        // E2E encrypted (base64)
    idempotencyKey: z.string(),
});
export type OpenClawClientSendMessage = z.infer<typeof OpenClawClientSendMessageSchema>;

// Send message response
export const OpenClawClientSendMessageResponseSchema = z.object({
    messageId: z.string(),
    status: z.enum(['pending', 'sent', 'failed']),
});
export type OpenClawClientSendMessageResponse = z.infer<typeof OpenClawClientSendMessageResponseSchema>;

// Gateway status response
export const OpenClawGatewayStatusSchema = z.object({
    connected: z.boolean(),
    gatewayUrl: z.string().nullable(),
    lastConnectedAt: z.number().nullable(),
    lastError: z.string().nullable(),
});
export type OpenClawGatewayStatus = z.infer<typeof OpenClawGatewayStatusSchema>;
