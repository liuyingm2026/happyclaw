/**
 * OpenClaw Gateway Client
 *
 * WebSocket client for connecting to OpenClaw Gateway with device authentication.
 * This module enables happy-server to communicate with OpenClaw for AI chat functionality.
 */
import crypto from 'crypto';
import WebSocket from 'ws';
import { log } from '@/utils/log';

// Configuration
const GATEWAY_URL = process.env.OPENCLAW_GATEWAY_URL || 'ws://127.0.0.1:18789';
const GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || '';
const RECONNECT_INTERVAL_MS = 5000;
const CHALLENGE_TIMEOUT_MS = 10000;

// Types
export type DeviceIdentity = {
    deviceId: string;
    publicKeyPem: string;
    privateKeyPem: string;
};

export type GatewayClientOptions = {
    url?: string;
    token?: string;
    onConnect?: () => void;
    onDisconnect?: (code: number, reason: string) => void;
    onError?: (error: Error) => void;
    onEvent?: (event: GatewayEvent) => void;
    onMessage?: (message: GatewayMessage) => void;
};

export type GatewayEvent = {
    event: string;
    seq?: number;
    payload?: any;
};

export type GatewayMessage = {
    kind: 'request' | 'response' | 'event';
    id?: string;
    method?: string;
    params?: any;
    payload?: any;
    ok?: boolean;
    error?: { message: string; code?: string };
};

type PendingRequest = {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
};

/**
 * Generate Ed25519 key pair for device identity
 */
export function generateDeviceIdentity(): DeviceIdentity {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

    // Device ID is SHA256 fingerprint of public key
    const rawPublicKey = extractRawPublicKey(publicKeyPem);
    const deviceId = crypto.createHash('sha256').update(rawPublicKey).digest('hex');

    return { deviceId, publicKeyPem, privateKeyPem };
}

/**
 * Extract raw public key bytes from PEM (Ed25519 SPKI format)
 */
function extractRawPublicKey(pem: string): Buffer {
    const key = crypto.createPublicKey(pem);
    const spki = key.export({ type: 'spki', format: 'der' }) as Buffer;

    // Ed25519 SPKI prefix: 302a300506032b6570032100 (12 bytes) + 32 bytes key
    const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
    if (spki.length === ED25519_SPKI_PREFIX.length + 32 &&
        spki.subarray(0, ED25519_SPKI_PREFIX.length).equals(ED25519_SPKI_PREFIX)) {
        return spki.subarray(ED25519_SPKI_PREFIX.length);
    }
    return spki;
}

/**
 * Convert public key to base64url format
 */
function publicKeyToBase64Url(pem: string): string {
    const raw = extractRawPublicKey(pem);
    return raw.toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

/**
 * Convert buffer to base64url format
 */
function bufferToBase64Url(buf: Buffer): string {
    return buf.toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

/**
 * Build device authentication payload (v3 format)
 */
function buildAuthPayload(params: {
    deviceId: string;
    clientId: string;
    clientMode: string;
    role: string;
    scopes: string[];
    signedAtMs: number;
    token: string | null;
    nonce: string;
    platform: string;
    deviceFamily: string;
}): string {
    const parts = [
        'v3',
        params.deviceId,
        params.clientId,
        params.clientMode,
        params.role,
        params.scopes.join(','),
        String(params.signedAtMs),
        params.token ?? '',
        params.nonce,
        params.platform.toLowerCase(),
        params.deviceFamily.toLowerCase(),
    ];
    return parts.join('|');
}

/**
 * Sign device payload with Ed25519 private key
 */
function signPayload(privateKeyPem: string, payload: string): string {
    const key = crypto.createPrivateKey(privateKeyPem);
    const signature = crypto.sign(null, Buffer.from(payload, 'utf-8'), key);
    return bufferToBase64Url(signature);
}

/**
 * OpenClaw Gateway Client
 */
export class OpenClawGatewayClient {
    private ws: WebSocket | null = null;
    private opts: GatewayClientOptions;
    private identity: DeviceIdentity;
    private pendingRequests = new Map<string, PendingRequest>();
    private connectNonce: string | null = null;
    private connectTimer: NodeJS.Timeout | null = null;
    private reconnectTimer: NodeJS.Timeout | null = null;
    private closed = false;
    private requestId = 0;

    constructor(opts: GatewayClientOptions = {}) {
        this.opts = opts;
        this.identity = generateDeviceIdentity();
        log('info', `[OpenClaw] Gateway client created with device ID: ${this.identity.deviceId}`);
    }

    /**
     * Start connection to OpenClaw Gateway
     */
    start(): void {
        if (this.closed) {
            return;
        }

        const url = this.opts.url || GATEWAY_URL;
        log('info', `[OpenClaw] Connecting to gateway: ${url}`);

        this.ws = new WebSocket(url);

        this.ws.on('open', () => {
            log('info', '[OpenClaw] WebSocket connected, waiting for challenge...');
            this.queueChallengeTimeout();
        });

        this.ws.on('message', (data) => {
            this.handleMessage(data.toString());
        });

        this.ws.on('close', (code, reason) => {
            const reasonText = reason.toString() || 'unknown';
            log('warn', `[OpenClaw] Connection closed: ${code} - ${reasonText}`);
            this.cleanup();
            this.opts.onDisconnect?.(code, reasonText);
            this.scheduleReconnect();
        });

        this.ws.on('error', (err) => {
            log('error', `[OpenClaw] WebSocket error: ${err.message}`);
            this.opts.onError?.(err);
        });
    }

    /**
     * Stop connection
     */
    stop(): void {
        this.closed = true;
        this.cleanup();
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        log('info', '[OpenClaw] Gateway client stopped');
    }

    /**
     * Send a request to OpenClaw Gateway
     */
    async request<T = any>(method: string, params?: any, timeoutMs = 30000): Promise<T> {
        return new Promise((resolve, reject) => {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                reject(new Error('Not connected to gateway'));
                return;
            }

            const id = `req_${++this.requestId}_${Date.now()}`;
            const message = {
                type: 'req',  // OpenClaw uses "req" not "request"
                id,
                method,
                params,
            };

            const timer = setTimeout(() => {
                this.pendingRequests.delete(id);
                reject(new Error(`Request timeout: ${method}`));
            }, timeoutMs);

            this.pendingRequests.set(id, { resolve, reject, timer });

            log('debug', `[OpenClaw] Sending request: ${method}`, { id });
            this.ws.send(JSON.stringify(message));
        });
    }

    /**
     * Send chat message through OpenClaw
     */
    async sendChat(sessionKey: string, message: string, options?: {
        idempotencyKey?: string;
        attachments?: any[];
    }): Promise<any> {
        const idempotencyKey = options?.idempotencyKey || `idemp_${Date.now()}_${++this.requestId}`;
        return this.request('chat.send', {
            sessionKey,
            message,
            idempotencyKey,
            ...options,
        });
    }

    /**
     * Check if connected
     */
    isConnected(): boolean {
        return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
    }

    /**
     * Get device identity
     */
    getIdentity(): DeviceIdentity {
        return this.identity;
    }

    private handleMessage(raw: string): void {
        try {
            const msg = JSON.parse(raw);

            // Handle event frame
            if (msg.type === 'event' && msg.event) {
                this.handleEvent(msg);
                return;
            }

            // Handle response frame
            if (msg.type === 'res' && msg.id) {
                this.handleResponse(msg);
                return;
            }

            // Handle other message types
            this.opts.onMessage?.(msg);

        } catch (err) {
            log('warn', `[OpenClaw] Failed to parse message: ${err}`);
        }
    }

    private handleEvent(event: GatewayEvent): void {
        // Handle connect challenge
        if (event.event === 'connect.challenge') {
            const nonce = event.payload?.nonce;
            if (nonce && typeof nonce === 'string') {
                this.connectNonce = nonce.trim();
                log('debug', '[OpenClaw] Received challenge, sending connect...');
                this.sendConnect();
            } else {
                log('error', '[OpenClaw] Challenge missing nonce');
                this.ws?.close(1008, 'challenge missing nonce');
            }
            return;
        }

        // Handle other events
        log('debug', `[OpenClaw] Event: ${event.event}`);
        this.opts.onEvent?.(event);
    }

    private handleResponse(msg: any): void {
        const pending = this.pendingRequests.get(msg.id);
        if (!pending) return;

        clearTimeout(pending.timer);
        this.pendingRequests.delete(msg.id);

        if (msg.ok) {
            pending.resolve(msg.payload);
        } else {
            pending.reject(new Error(msg.error?.message || 'Request failed'));
        }
    }

    private sendConnect(): void {
        if (!this.connectNonce || !this.ws) return;

        if (this.connectTimer) {
            clearTimeout(this.connectTimer);
            this.connectTimer = null;
        }

        const token = this.opts.token || GATEWAY_TOKEN;
        const signedAtMs = Date.now();
        const nonce = this.connectNonce;
        const role = 'operator';
        const scopes = ['operator.admin'];
        const platform = process.platform;
        const deviceFamily = 'happy-server';

        // Build device auth payload
        const payload = buildAuthPayload({
            deviceId: this.identity.deviceId,
            clientId: 'happy-server',
            clientMode: 'backend',
            role,
            scopes,
            signedAtMs,
            token: token || null,
            nonce,
            platform,
            deviceFamily,
        });

        // Sign payload
        const signature = signPayload(this.identity.privateKeyPem, payload);

        // Build connect params - use token auth for local gateway
        const connectParams: any = {
            minProtocol: 3,
            maxProtocol: 3,
            client: {
                id: 'gateway-client',  // Must be one of the predefined client IDs
                displayName: 'Happy Server',
                version: '1.0.0',
                platform,
                deviceFamily,
                mode: 'backend',
            },
            caps: ['chat', 'events', 'sessions'],
            role,
            scopes,
        };

        // Use token auth if available
        if (token) {
            connectParams.auth = { token };
        } else {
            // Use device auth as fallback
            connectParams.device = {
                id: this.identity.deviceId,
                publicKey: publicKeyToBase64Url(this.identity.publicKeyPem),
                signature,
                signedAt: signedAtMs,
                nonce,
            };
        }

        log('debug', '[OpenClaw] Sending connect request...');

        this.request('connect', connectParams, 10000)
            .then((result) => {
                log('info', '[OpenClaw] Connected to gateway successfully');
                this.opts.onConnect?.();
            })
            .catch((err) => {
                log('error', `[OpenClaw] Connect failed: ${err.message}`);
                this.opts.onError?.(err);
                // Truncate reason to 123 bytes max (WebSocket limit)
                const reason = `connect failed: ${err.message}`.substring(0, 100);
                this.ws?.close(1008, reason);
            });
    }

    private queueChallengeTimeout(): void {
        this.connectNonce = null;
        this.connectTimer = setTimeout(() => {
            log('error', '[OpenClaw] Challenge timeout');
            this.ws?.close(1008, 'challenge timeout');
        }, CHALLENGE_TIMEOUT_MS);
    }

    private scheduleReconnect(): void {
        if (this.closed) return;

        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }

        this.reconnectTimer = setTimeout(() => {
            log('info', '[OpenClaw] Attempting reconnect...');
            this.start();
        }, RECONNECT_INTERVAL_MS);
    }

    private cleanup(): void {
        if (this.connectTimer) {
            clearTimeout(this.connectTimer);
            this.connectTimer = null;
        }

        // Reject all pending requests
        for (const [id, pending] of this.pendingRequests) {
            clearTimeout(pending.timer);
            pending.reject(new Error('Connection closed'));
        }
        this.pendingRequests.clear();

        this.ws = null;
    }
}

// Singleton instance
let gatewayClient: OpenClawGatewayClient | null = null;

/**
 * Get or create the gateway client singleton
 */
export function getGatewayClient(opts?: GatewayClientOptions): OpenClawGatewayClient {
    if (!gatewayClient) {
        gatewayClient = new OpenClawGatewayClient(opts);
    }
    return gatewayClient;
}

/**
 * Start the gateway client
 */
export function startGatewayClient(opts?: GatewayClientOptions): OpenClawGatewayClient {
    const client = getGatewayClient(opts);
    client.start();
    return client;
}
