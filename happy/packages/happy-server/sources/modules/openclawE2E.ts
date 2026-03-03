/**
 * OpenClaw E2E Encryption Module
 *
 * Handles end-to-end encryption for messages between Plugin and Users
 */
import { db } from '@/storage/db';
import { inTx } from '@/storage/inTx';

// Encryption status for conversations
export type EncryptionStatus = 'pending' | 'ready' | 'failed';

/**
 * Store public key for a conversation (key exchange)
 */
export async function storeConversationPublicKey(
    conversationId: string,
    accountId: string,
    publicKey: string
): Promise<void> {
    await inTx(async (tx) => {
        // Verify conversation belongs to account
        const conversation = await tx.openClawConversation.findFirst({
            where: { id: conversationId, accountId },
        });

        if (!conversation) {
            throw new Error('Conversation not found');
        }

        // Store or update the public key
        await tx.openClawConversation.update({
            where: { id: conversationId },
            data: {
                dataEncryptionKey: Buffer.from(publicKey, 'base64'),
            },
        });
    });
}

/**
 * Get public key for a conversation (for Plugin to encrypt responses)
 */
export async function getConversationPublicKey(
    conversationId: string
): Promise<string | null> {
    const conversation = await db.openClawConversation.findUnique({
        where: { id: conversationId },
        select: { dataEncryptionKey: true },
    });

    if (!conversation?.dataEncryptionKey) {
        return null;
    }

    return Buffer.from(conversation.dataEncryptionKey).toString('base64');
}

/**
 * Check if conversation has encryption keys set up
 */
export async function hasEncryptionKeys(conversationId: string): Promise<boolean> {
    const conversation = await db.openClawConversation.findUnique({
        where: { id: conversationId },
        select: { dataEncryptionKey: true },
    });

    return conversation?.dataEncryptionKey !== null;
}

/**
 * Store encrypted message
 */
export async function storeEncryptedMessage(
    conversationId: string,
    messageId: string,
    role: 'user' | 'assistant',
    encryptedContent: Buffer,
    localId?: string
): Promise<{ id: string; seq: number }> {
    return inTx(async (tx) => {
        // Get current max seq
        const maxSeq = await tx.openClawMessage.aggregate({
            where: { conversationId },
            _max: { seq: true },
        });

        const seq = (maxSeq._max.seq ?? -1) + 1;

        // Create message
        const message = await tx.openClawMessage.create({
            data: {
                id: messageId,
                conversationId,
                localId,
                seq,
                role,
                content: Buffer.from(encryptedContent),
                status: 'complete',
            },
        });

        // Update conversation last active
        await tx.openClawConversation.update({
            where: { id: conversationId },
            data: {
                lastActiveAt: new Date(),
                seq: { increment: 1 },
            },
        });

        return { id: message.id, seq: message.seq };
    });
}

/**
 * Store streaming chunk (partial message)
 */
export async function storeStreamingChunk(
    conversationId: string,
    messageId: string,
    chunk: Buffer,
    seq: number
): Promise<void> {
    await inTx(async (tx) => {
        // Get or create the streaming message
        let message = await tx.openClawMessage.findUnique({
            where: { id: messageId },
        });

        if (!message) {
            // Create new streaming message
            const maxSeq = await tx.openClawMessage.aggregate({
                where: { conversationId },
                _max: { seq: true },
            });

            message = await tx.openClawMessage.create({
                data: {
                    id: messageId,
                    conversationId,
                    seq: (maxSeq._max.seq ?? -1) + 1,
                    role: 'assistant',
                    content: Buffer.from(chunk),
                    status: 'streaming',
                },
            });
        } else {
            // Append chunk to existing content
            const existingContent = Buffer.from(message.content);
            const newContent = Buffer.concat([existingContent, chunk]);

            await tx.openClawMessage.update({
                where: { id: messageId },
                data: { content: newContent },
            });
        }
    });
}

/**
 * Mark streaming message as complete
 */
export async function completeStreamingMessage(messageId: string): Promise<void> {
    await db.openClawMessage.update({
        where: { id: messageId },
        data: { status: 'complete' },
    });
}

/**
 * Get encrypted messages for a conversation
 */
export async function getEncryptedMessages(
    conversationId: string,
    options?: {
        afterSeq?: number;
        limit?: number;
    }
): Promise<Array<{
    id: string;
    seq: number;
    role: string;
    content: Buffer;
    status: string;
    createdAt: Date;
}>> {
    const limit = options?.limit ?? 50;

    const messages = await db.openClawMessage.findMany({
        where: {
            conversationId,
            ...(options?.afterSeq !== undefined
                ? { seq: { gt: options.afterSeq } }
                : {}),
        },
        orderBy: { seq: 'asc' },
        take: limit,
        select: {
            id: true,
            seq: true,
            role: true,
            content: true,
            status: true,
            createdAt: true,
        },
    });

    // Convert Uint8Array to Buffer
    return messages.map(msg => ({
        ...msg,
        content: Buffer.from(msg.content),
    }));
}
