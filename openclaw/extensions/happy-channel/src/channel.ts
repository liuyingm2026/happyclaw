/**
 * Happy Channel Plugin Implementation
 *
 * Implements the ChannelPlugin interface for OpenClaw to enable
 * AI conversations through Happy's mobile/web clients.
 */
import type {
    ChannelPlugin,
    ChannelMeta,
    ChannelConfigAdapter,
    ChannelOutboundAdapter,
    ChannelStatusAdapter,
    OpenClawConfig,
    ChannelAccountSnapshot,
    ChannelDirectoryAdapter,
    ChannelDirectoryEntry,
    ChannelOutboundContext,
    ChannelCapabilities,
} from "openclaw/plugin-sdk";
import crypto from "crypto";
import axios from "axios";

// Types
export interface ResolvedHappyAccount {
    accountId: string;
    enabled: boolean;
    serverUrl: string;
    channelSecret: string;
}

export interface HappyProbe {
    connected: boolean;
    serverUrl: string;
    lastChecked: number;
    latency?: number;
}

// Constants
const DEFAULT_ACCOUNT_ID = "default";
const CHANNEL_ID = "happy";

// Meta information for the channel
const meta: ChannelMeta = {
    id: CHANNEL_ID,
    label: "Happy",
    selectionLabel: "Happy Channel",
    docsPath: "/channels/happy",
    blurb: "AI conversations through Happy mobile/web clients",
    order: 100,
};

// Capabilities
const capabilities: ChannelCapabilities = {
    chatTypes: ["direct"],
    polls: false,
    reactions: false,
    edit: false,
    unsend: false,
};

// Helper functions
function listHappyAccountIds(cfg: OpenClawConfig): string[] {
    const channels = cfg.channels as Record<string, any> | undefined;
    if (!channels?.happy) {
        return [];
    }

    const happy = channels.happy;
    if (happy.accounts && typeof happy.accounts === "object") {
        return Object.keys(happy.accounts);
    }

    if (happy.serverUrl) {
        return [DEFAULT_ACCOUNT_ID];
    }

    return [];
}

function resolveHappyAccount(
    cfg: OpenClawConfig,
    accountId?: string | null
): ResolvedHappyAccount {
    const channels = cfg.channels as Record<string, any> | undefined;
    const happy = channels?.happy || {};

    if (happy.accounts && typeof happy.accounts === "object") {
        const account = happy.accounts[accountId || DEFAULT_ACCOUNT_ID];
        if (account) {
            return {
                accountId: accountId || DEFAULT_ACCOUNT_ID,
                enabled: account.enabled !== false,
                serverUrl: account.serverUrl || "http://localhost:3005",
                channelSecret: account.channelSecret || "",
            };
        }
    }

    return {
        accountId: DEFAULT_ACCOUNT_ID,
        enabled: happy.enabled !== false,
        serverUrl: happy.serverUrl || "http://localhost:3005",
        channelSecret: happy.channelSecret || "",
    };
}

function generateHMACSignature(
    secret: string,
    body: string,
    timestamp: number,
    nonce: string
): string {
    const message = `${timestamp}.${nonce}.${body}`;
    return crypto.createHmac("sha256", secret).update(message).digest("hex");
}

// Happy Server Client
class HappyServerClient {
    private account: ResolvedHappyAccount;

    constructor(account: ResolvedHappyAccount) {
        this.account = account;
    }

    async sendMessage(params: {
        conversationId: string;
        messageId: string;
        content: string;
    }): Promise<{ ok: boolean; messageId?: string; error?: string }> {
        const bodyObj = {
            conversationId: params.conversationId,
            messageId: params.messageId,
            role: "assistant",
            content: Buffer.from(params.content).toString("base64"),
            timestamp: Date.now(),
        };
        const body = JSON.stringify(bodyObj);

        const timestamp = Date.now();
        const nonce = crypto.randomBytes(16).toString("hex");
        const signature = generateHMACSignature(
            this.account.channelSecret,
            body,
            timestamp,
            nonce
        );

        try {
            await axios.post(
                `${this.account.serverUrl}/v1/openclaw/webhook`,
                body,
                {
                    headers: {
                        "Content-Type": "application/json",
                        "X-Happy-Signature": signature,
                        "X-Happy-Timestamp": timestamp.toString(),
                        "X-Happy-Nonce": nonce,
                    },
                    timeout: 30000,
                }
            );
            return { ok: true, messageId: params.messageId };
        } catch (error: any) {
            return { ok: false, error: error.message || "Unknown error" };
        }
    }

    async healthCheck(): Promise<{ healthy: boolean; latency?: number }> {
        const start = Date.now();
        try {
            const response = await axios.get(
                `${this.account.serverUrl}/v1/openclaw/gateway-status`,
                { timeout: 5000 }
            );
            return {
                healthy: response.data?.connected === true,
                latency: Date.now() - start,
            };
        } catch {
            return { healthy: false };
        }
    }
}

// Config Adapter
const configAdapter: ChannelConfigAdapter<ResolvedHappyAccount> = {
    listAccountIds: listHappyAccountIds,
    resolveAccount: resolveHappyAccount,
    defaultAccountId: () => DEFAULT_ACCOUNT_ID,
    isEnabled: (account) => account.enabled,
    isConfigured: (account) => !!account.serverUrl && !!account.channelSecret,
};

// Outbound Adapter
const outboundAdapter: ChannelOutboundAdapter = {
    deliveryMode: "direct",
    textChunkLimit: 4000,
    sendText: async (ctx: ChannelOutboundContext) => {
        const account = resolveHappyAccount(ctx.cfg, ctx.accountId);

        if (!account.enabled) {
            return {
                channel: CHANNEL_ID,
                messageId: "",
                error: "Happy channel is disabled",
            };
        }

        if (!account.channelSecret) {
            return {
                channel: CHANNEL_ID,
                messageId: "",
                error: "Channel secret not configured",
            };
        }

        const client = new HappyServerClient(account);
        const messageId = `msg_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;

        const result = await client.sendMessage({
            conversationId: ctx.to,
            messageId,
            content: ctx.text,
        });

        if (result.ok) {
            return {
                channel: CHANNEL_ID,
                messageId: result.messageId || messageId,
            };
        } else {
            return {
                channel: CHANNEL_ID,
                messageId: "",
                error: result.error,
            };
        }
    },
};

// Status Adapter
const statusAdapter: ChannelStatusAdapter<ResolvedHappyAccount, HappyProbe> = {
    probeAccount: async (params): Promise<HappyProbe> => {
        const client = new HappyServerClient(params.account);
        const health = await client.healthCheck();

        return {
            connected: health.healthy,
            serverUrl: params.account.serverUrl,
            lastChecked: Date.now(),
            latency: health.latency,
        };
    },
    buildAccountSnapshot: (params): ChannelAccountSnapshot => {
        return {
            accountId: params.account.accountId,
            name: "Happy Account",
            enabled: params.account.enabled,
        };
    },
};

// Directory Adapter
const directoryAdapter: ChannelDirectoryAdapter = {
    listPeers: async (): Promise<ChannelDirectoryEntry[]> => [],
    listGroups: async (): Promise<ChannelDirectoryEntry[]> => [],
};

// Channel Plugin Implementation
export const happyChannelPlugin: ChannelPlugin<ResolvedHappyAccount, HappyProbe> = {
    id: CHANNEL_ID,
    meta,
    capabilities,
    config: configAdapter,
    outbound: outboundAdapter,
    status: statusAdapter,
    directory: directoryAdapter,
};
