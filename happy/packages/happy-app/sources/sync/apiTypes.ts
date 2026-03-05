import { z } from 'zod';
import {
    ApiMessageSchema,
    ApiUpdateMachineStateSchema,
    ApiUpdateNewMessageSchema,
    ApiUpdateSessionStateSchema,
    type ApiMessage,
} from '@slopus/happy-wire';
import { GitHubProfileSchema, ImageRefSchema } from './profile';
import { RelationshipStatusSchema, UserProfileSchema } from './friendTypes';
import { FeedBodySchema } from './feedTypes';

export {
    ApiMessageSchema,
    ApiUpdateMachineStateSchema,
    ApiUpdateNewMessageSchema,
    ApiUpdateSessionStateSchema,
};
export type { ApiMessage };

//
// Updates
//

export const ApiUpdateNewSessionSchema = z.object({
    t: z.literal('new-session'),
    id: z.string(), // Session ID
    createdAt: z.number(),
    updatedAt: z.number(),
});

export const ApiDeleteSessionSchema = z.object({
    t: z.literal('delete-session'),
    sid: z.string(), // Session ID
});

export const ApiUpdateAccountSchema = z.object({
    t: z.literal('update-account'),
    id: z.string(),
    settings: z.object({
        value: z.string().nullish(),
        version: z.number()
    }).nullish(),
    firstName: z.string().nullish(),
    lastName: z.string().nullish(),
    avatar: ImageRefSchema.nullish(),
    github: GitHubProfileSchema.nullish(),
});

// Artifact update schemas
export const ApiNewArtifactSchema = z.object({
    t: z.literal('new-artifact'),
    artifactId: z.string(),
    header: z.string(),
    headerVersion: z.number(),
    body: z.string().optional(),
    bodyVersion: z.number().optional(),
    dataEncryptionKey: z.string(),
    seq: z.number(),
    createdAt: z.number(),
    updatedAt: z.number()
});

export const ApiUpdateArtifactSchema = z.object({
    t: z.literal('update-artifact'),
    artifactId: z.string(),
    header: z.object({
        value: z.string(),
        version: z.number()
    }).optional(),
    body: z.object({
        value: z.string(),
        version: z.number()
    }).optional()
});

export const ApiDeleteArtifactSchema = z.object({
    t: z.literal('delete-artifact'),
    artifactId: z.string()
});

// Relationship update schema
export const ApiRelationshipUpdatedSchema = z.object({
    t: z.literal('relationship-updated'),
    fromUserId: z.string(),
    toUserId: z.string(),
    status: RelationshipStatusSchema,
    action: z.enum(['created', 'updated', 'deleted']),
    fromUser: UserProfileSchema.optional(),
    toUser: UserProfileSchema.optional(),
    timestamp: z.number()
});

// Feed update schema
export const ApiNewFeedPostSchema = z.object({
    t: z.literal('new-feed-post'),
    id: z.string(),
    body: FeedBodySchema,
    cursor: z.string(),
    createdAt: z.number(),
    repeatKey: z.string().nullable()
});

// KV batch update schema for real-time KV updates
export const ApiKvBatchUpdateSchema = z.object({
    t: z.literal('kv-batch-update'),
    changes: z.array(z.object({
        key: z.string(),
        value: z.string().nullable(),
        version: z.number()
    }))
});

// OpenClaw update schemas
export const ApiOpenClawNewConversationSchema = z.object({
    t: z.literal('openclaw-new-conversation'),
    conversation: z.object({
        id: z.string(),
        accountId: z.string(),
        title: z.string().nullable(),
        openclawSessionId: z.string().nullable(),
        active: z.boolean(),
        lastActiveAt: z.number(),
        createdAt: z.number(),
        updatedAt: z.number(),
    }),
});

export const ApiOpenClawMessageSchema = z.object({
    t: z.literal('openclaw-message'),
    conversationId: z.string(),
    message: z.object({
        id: z.string(),
        conversationId: z.string(),
        seq: z.number(),
        localId: z.string().nullable(),
        role: z.enum(['user', 'assistant']),
        content: z.object({
            c: z.string(),  // Encrypted content
            t: z.literal('openclaw-encrypted'),
        }),
        status: z.enum(['pending', 'streaming', 'complete', 'failed']),
        createdAt: z.number(),
        updatedAt: z.number(),
    }),
});

export const ApiOpenClawChunkSchema = z.object({
    t: z.literal('openclaw-chunk'),
    conversationId: z.string(),
    messageId: z.string(),
    chunk: z.string(),  // Encrypted chunk
    seq: z.number(),
    isComplete: z.boolean(),
});

export const ApiOpenClawStatusSchema = z.object({
    t: z.literal('openclaw-status'),
    connected: z.boolean(),
    gatewayUrl: z.string().nullable(),
    lastConnectedAt: z.number().nullable(),
});

// Use a plain union here to avoid runtime discriminator extraction issues
// when some schemas come from shared package exports.
export const ApiUpdateSchema = z.union([
    ApiUpdateNewMessageSchema,
    ApiUpdateNewSessionSchema,
    ApiDeleteSessionSchema,
    ApiUpdateSessionStateSchema,
    ApiUpdateAccountSchema,
    ApiUpdateMachineStateSchema,
    ApiNewArtifactSchema,
    ApiUpdateArtifactSchema,
    ApiDeleteArtifactSchema,
    ApiRelationshipUpdatedSchema,
    ApiNewFeedPostSchema,
    ApiKvBatchUpdateSchema,
    ApiOpenClawNewConversationSchema,
    ApiOpenClawMessageSchema,
    ApiOpenClawChunkSchema,
    ApiOpenClawStatusSchema,
]);

export type ApiUpdateNewMessage = z.infer<typeof ApiUpdateNewMessageSchema>;
export type ApiRelationshipUpdated = z.infer<typeof ApiRelationshipUpdatedSchema>;
export type ApiKvBatchUpdate = z.infer<typeof ApiKvBatchUpdateSchema>;
export type ApiUpdate = z.infer<typeof ApiUpdateSchema>;

//
// API update container
//

export const ApiUpdateContainerSchema = z.object({
    id: z.string(),
    seq: z.number(),
    body: ApiUpdateSchema,
    createdAt: z.number(),
});

export type ApiUpdateContainer = z.infer<typeof ApiUpdateContainerSchema>;

//
// Ephemeral update
//

export const ApiEphemeralActivityUpdateSchema = z.object({
    type: z.literal('activity'),
    id: z.string(),
    active: z.boolean(),
    activeAt: z.number(),
    thinking: z.boolean(),
});

export const ApiEphemeralUsageUpdateSchema = z.object({
    type: z.literal('usage'),
    id: z.string(),
    key: z.string(),
    timestamp: z.number(),
    tokens: z.object({
        total: z.number(),
        input: z.number(),
        output: z.number(),
        cache_creation: z.number(),
        cache_read: z.number(),
    }),
    cost: z.object({
        total: z.number(),
        input: z.number(),
        output: z.number(),
    }),
});

export const ApiEphemeralMachineActivityUpdateSchema = z.object({
    type: z.literal('machine-activity'),
    id: z.string(), // machine id
    active: z.boolean(),
    activeAt: z.number(),
});

export const ApiEphemeralUpdateSchema = z.union([
    ApiEphemeralActivityUpdateSchema,
    ApiEphemeralUsageUpdateSchema,
    ApiEphemeralMachineActivityUpdateSchema,
]);

export type ApiEphemeralActivityUpdate = z.infer<typeof ApiEphemeralActivityUpdateSchema>;
export type ApiEphemeralUpdate = z.infer<typeof ApiEphemeralUpdateSchema>;

// Machine metadata updates use Partial<MachineMetadata> from storageTypes
// This matches how session metadata updates work
