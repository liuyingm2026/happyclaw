/**
 * OpenClaw API Client
 *
 * Handles API calls to Happy Server for OpenClaw functionality.
 * All messages are E2E encrypted using the user's encryption keys.
 */

import { Encryption } from './encryption/encryption';
import { decodeBase64, encodeBase64 } from '@/encryption/base64';
import { getServerUrl } from './serverConfig';
import { OpenClawConversation, OpenClawMessage } from './storageTypes';

export interface OpenClawConversationListResponse {
    conversations: Array<{
        id: string;
        title: string | null;
        lastMessageAt: number | null;
        lastMessagePreview: string | null;
        unreadCount: number;
        active: boolean;
    }>;
    nextCursor: string | null;
    hasMore: boolean;
}

export interface OpenClawMessagesResponse {
    messages: Array<{
        id: string;
        role: 'user' | 'assistant';
        content: string;  // E2E encrypted (base64)
        status: 'pending' | 'streaming' | 'complete' | 'failed';
        createdAt: number;
    }>;
    nextCursor: string | null;
    hasMore: boolean;
}

export interface OpenClawSendMessageResponse {
    messageId: string;
    status: 'pending' | 'sent' | 'failed';
}

/**
 * Fetch OpenClaw conversations from the server
 */
export async function fetchOpenClawConversations(
    token: string,
    cursor?: string,
    limit: number = 20
): Promise<OpenClawConversationListResponse> {
    const serverUrl = getServerUrl();
    const params = new URLSearchParams();
    if (cursor) params.append('cursor', cursor);
    params.append('limit', String(limit));

    const response = await fetch(
        `${serverUrl}/v1/openclaw/conversations?${params.toString()}`,
        {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        }
    );

    if (!response.ok) {
        throw new Error(`Failed to fetch conversations: ${response.status}`);
    }

    return response.json();
}

/**
 * Fetch messages for an OpenClaw conversation
 */
export async function fetchOpenClawMessages(
    token: string,
    conversationId: string,
    cursor?: string,
    limit: number = 50
): Promise<OpenClawMessagesResponse> {
    const serverUrl = getServerUrl();
    const params = new URLSearchParams();
    if (cursor) params.append('cursor', cursor);
    params.append('limit', String(limit));

    const response = await fetch(
        `${serverUrl}/v1/openclaw/conversations/${conversationId}/messages?${params.toString()}`,
        {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        }
    );

    if (!response.ok) {
        throw new Error(`Failed to fetch messages: ${response.status}`);
    }

    return response.json();
}

/**
 * Send a message to an OpenClaw conversation
 */
export async function sendOpenClawMessage(
    token: string,
    conversationId: string,
    content: string,
    encryption: Encryption,
    idempotencyKey: string
): Promise<OpenClawSendMessageResponse> {
    const serverUrl = getServerUrl();

    // E2E encrypt the message content using encryptRaw
    const encryptedContent = await encryption.encryptRaw(content);

    const response = await fetch(
        `${serverUrl}/v1/openclaw/conversations/${conversationId}/messages`,
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                content: encryptedContent,
                idempotencyKey,
            }),
        }
    );

    if (!response.ok) {
        throw new Error(`Failed to send message: ${response.status}`);
    }

    return response.json();
}

/**
 * Fetch OpenClaw gateway status
 */
export async function fetchOpenClawGatewayStatus(token: string): Promise<{
    connected: boolean;
    gatewayUrl: string | null;
    lastConnectedAt: number | null;
    lastError: string | null;
}> {
    const serverUrl = getServerUrl();

    const response = await fetch(
        `${serverUrl}/v1/openclaw/status`,
        {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        }
    );

    if (!response.ok) {
        throw new Error(`Failed to fetch gateway status: ${response.status}`);
    }

    return response.json();
}

/**
 * Decrypt an OpenClaw message
 */
export async function decryptOpenClawMessageApi(
    encryptedContent: string,
    encryption: Encryption
): Promise<string> {
    const decrypted = await encryption.decryptRaw(encryptedContent);
    return typeof decrypted === 'string' ? decrypted : JSON.stringify(decrypted);
}

/**
 * Convert API response to storage format
 */
export function apiMessageToStorage(
    apiMessage: OpenClawMessagesResponse['messages'][0],
    conversationId: string,
    decryptedContent: string
): OpenClawMessage {
    return {
        id: apiMessage.id,
        conversationId,
        seq: 0,  // Will be assigned by storage
        localId: null,
        role: apiMessage.role,
        content: decryptedContent,
        status: apiMessage.status,
        createdAt: apiMessage.createdAt,
        updatedAt: apiMessage.createdAt,
    };
}

/**
 * Convert API conversation to storage format
 */
export function apiConversationToStorage(
    apiConv: OpenClawConversationListResponse['conversations'][0]
): OpenClawConversation {
    return {
        id: apiConv.id,
        accountId: '',  // Will be set by sync
        title: apiConv.title,
        openclawSessionId: null,
        active: apiConv.active,
        lastActiveAt: apiConv.lastMessageAt || Date.now(),
        createdAt: apiConv.lastMessageAt || Date.now(),
        updatedAt: apiConv.lastMessageAt || Date.now(),
        unreadCount: apiConv.unreadCount,
        lastMessagePreview: apiConv.lastMessagePreview,
    };
}
