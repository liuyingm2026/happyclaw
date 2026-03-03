/**
 * OpenClaw Session-Conversation Mapping Service
 *
 * Manages the mapping between Happy Conversations and OpenClaw Sessions
 */
import { db } from '@/storage/db';
import { inTx } from '@/storage/inTx';

/**
 * Get or create a conversation for a given OpenClaw session
 */
export async function getOrCreateConversation(
    accountId: string,
    openclawSessionId: string,
    title?: string
): Promise<{ id: string; isNew: boolean }> {
    return inTx(async (tx) => {
        // Try to find existing conversation
        const existing = await tx.openClawConversation.findFirst({
            where: {
                accountId,
                openclawSessionId,
                active: true,
            },
        });

        if (existing) {
            return { id: existing.id, isNew: false };
        }

        // Create new conversation
        const conversation = await tx.openClawConversation.create({
            data: {
                accountId,
                openclawSessionId,
                title: title ?? null,
                active: true,
            },
        });

        return { id: conversation.id, isNew: true };
    });
}

/**
 * Get OpenClaw session ID for a conversation
 */
export async function getOpenClawSessionId(
    conversationId: string
): Promise<string | null> {
    const conversation = await db.openClawConversation.findUnique({
        where: { id: conversationId },
        select: { openclawSessionId: true },
    });

    return conversation?.openclawSessionId ?? null;
}

/**
 * Update conversation's last active time
 */
export async function touchConversation(conversationId: string): Promise<void> {
    await db.openClawConversation.update({
        where: { id: conversationId },
        data: {
            lastActiveAt: new Date(),
            seq: { increment: 1 },
        },
    });
}

/**
 * List conversations for an account
 */
export async function listConversations(
    accountId: string,
    options?: {
        cursor?: string;
        limit?: number;
    }
): Promise<{
    conversations: Array<{
        id: string;
        title: string | null;
        openclawSessionId: string | null;
        active: boolean;
        lastActiveAt: Date;
        createdAt: Date;
    }>;
    nextCursor: string | null;
    hasMore: boolean;
}> {
    const limit = options?.limit ?? 20;

    const conversations = await db.openClawConversation.findMany({
        where: {
            accountId,
            active: true,
        },
        orderBy: {
            lastActiveAt: 'desc',
        },
        take: limit + 1,
        ...(options?.cursor
            ? {
                  cursor: { id: options.cursor },
                  skip: 1,
              }
            : {}),
        select: {
            id: true,
            title: true,
            openclawSessionId: true,
            active: true,
            lastActiveAt: true,
            createdAt: true,
        },
    });

    const hasMore = conversations.length > limit;
    if (hasMore) {
        conversations.pop();
    }

    return {
        conversations,
        nextCursor: hasMore ? conversations[conversations.length - 1]?.id ?? null : null,
        hasMore,
    };
}

/**
 * Deactivate a conversation
 */
export async function deactivateConversation(conversationId: string): Promise<void> {
    await db.openClawConversation.update({
        where: { id: conversationId },
        data: { active: false },
    });
}
