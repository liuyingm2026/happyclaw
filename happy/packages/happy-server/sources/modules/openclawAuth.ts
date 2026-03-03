/**
 * OpenClaw Authentication Module
 *
 * Handles encrypted token storage, HMAC signature verification,
 * and E2E encryption for OpenClaw integration.
 */
import crypto from 'crypto';
import { db } from '@/storage/db';
import { encryptBytes, decryptBytes, encryptString, decryptString } from './encrypt';

// HMAC signature configuration
const HMAC_ALGORITHM = 'sha256';
const SIGNATURE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Encrypted token storage for OpenClaw Gateway
 */
export async function storeGatewayToken(
    accountId: string,
    gatewayUrl: string,
    token: string
): Promise<void> {
    const encryptedToken = encryptString(['openclaw', accountId, 'gateway-token'], token);

    await db.openClawTokenVault.upsert({
        where: {
            accountId_gatewayUrl: { accountId, gatewayUrl }
        },
        create: {
            accountId,
            gatewayUrl,
            encryptedToken: Buffer.from(encryptedToken),
            tokenVersion: 1,
        },
        update: {
            encryptedToken: Buffer.from(encryptedToken),
            tokenVersion: { increment: 1 },
        }
    });
}

/**
 * Retrieve and decrypt Gateway token
 */
export async function getGatewayToken(
    accountId: string,
    gatewayUrl: string
): Promise<string | null> {
    const vault = await db.openClawTokenVault.findUnique({
        where: {
            accountId_gatewayUrl: { accountId, gatewayUrl }
        }
    });

    if (!vault) {
        return null;
    }

    return decryptString(['openclaw', accountId, 'gateway-token'], vault.encryptedToken);
}

/**
 * Generate HMAC signature for Plugin -> Server requests
 */
export function generateHMACSignature(
    secret: string,
    body: string,
    timestamp: number,
    nonce: string
): string {
    const message = `${timestamp}.${nonce}.${body}`;
    return crypto.createHmac(HMAC_ALGORITHM, secret).update(message).digest('hex');
}

/**
 * Verify HMAC signature from Plugin
 */
export function verifyHMACSignature(
    secret: string,
    body: string,
    signature: string,
    timestamp: number,
    nonce: string
): { valid: boolean; error?: string } {
    // Check timestamp to prevent replay attacks
    const now = Date.now();
    if (Math.abs(now - timestamp) > SIGNATURE_TTL_MS) {
        return { valid: false, error: 'Signature expired' };
    }

    // Verify signature
    const expectedSignature = generateHMACSignature(secret, body, timestamp, nonce);
    const valid = crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expectedSignature, 'hex')
    );

    if (!valid) {
        return { valid: false, error: 'Invalid signature' };
    }

    return { valid: true };
}

/**
 * Check if nonce was recently used (for replay protection)
 * Uses SimpleCache table for short-term nonce storage
 */
export async function checkAndStoreNonce(
    nonce: string,
    ttlMs: number = SIGNATURE_TTL_MS * 2
): Promise<boolean> {
    const key = `openclaw-nonce:${nonce}`;

    const existing = await db.simpleCache.findUnique({
        where: { key }
    });

    if (existing) {
        return false; // Nonce already used
    }

    await db.simpleCache.create({
        data: {
            key,
            value: Date.now().toString(),
        }
    });

    return true;
}

/**
 * Clean up expired nonces
 */
export async function cleanupExpiredNonces(): Promise<number> {
    const cutoff = Date.now() - SIGNATURE_TTL_MS * 2;
    const result = await db.simpleCache.deleteMany({
        where: {
            key: { startsWith: 'openclaw-nonce:' },
            value: { lt: cutoff.toString() }
        }
    });
    return result.count;
}
