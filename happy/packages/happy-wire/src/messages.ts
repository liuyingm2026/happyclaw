import * as z from 'zod';
import { sessionEnvelopeSchema } from './sessionProtocol';
import { MessageMetaSchema, type MessageMeta } from './messageMeta';
import { AgentMessageSchema, UserMessageSchema } from './legacyProtocol';

export const SessionMessageContentSchema = z.object({
  c: z.string(),
  t: z.literal('encrypted'),
});
export type SessionMessageContent = z.infer<typeof SessionMessageContentSchema>;

export const SessionMessageSchema = z.object({
  id: z.string(),
  seq: z.number(),
  localId: z.string().nullish(),
  content: SessionMessageContentSchema,
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type SessionMessage = z.infer<typeof SessionMessageSchema>;
export { MessageMetaSchema };
export type { MessageMeta };

export const SessionProtocolMessageSchema = z.object({
  role: z.literal('session'),
  content: sessionEnvelopeSchema,
  meta: MessageMetaSchema.optional(),
});
export type SessionProtocolMessage = z.infer<typeof SessionProtocolMessageSchema>;

export const MessageContentSchema = z.discriminatedUnion('role', [
  UserMessageSchema,
  AgentMessageSchema,
  SessionProtocolMessageSchema,
]);
export type MessageContent = z.infer<typeof MessageContentSchema>;

export const VersionedEncryptedValueSchema = z.object({
  version: z.number(),
  value: z.string(),
});
export type VersionedEncryptedValue = z.infer<typeof VersionedEncryptedValueSchema>;

export const VersionedNullableEncryptedValueSchema = z.object({
  version: z.number(),
  value: z.string().nullable(),
});
export type VersionedNullableEncryptedValue = z.infer<typeof VersionedNullableEncryptedValueSchema>;

export const UpdateNewMessageBodySchema = z.object({
  t: z.literal('new-message'),
  sid: z.string(),
  message: SessionMessageSchema,
});
export type UpdateNewMessageBody = z.infer<typeof UpdateNewMessageBodySchema>;

export const UpdateSessionBodySchema = z.object({
  t: z.literal('update-session'),
  id: z.string(),
  metadata: VersionedEncryptedValueSchema.nullish(),
  agentState: VersionedNullableEncryptedValueSchema.nullish(),
});
export type UpdateSessionBody = z.infer<typeof UpdateSessionBodySchema>;

export const VersionedMachineEncryptedValueSchema = z.object({
  version: z.number(),
  value: z.string(),
});
export type VersionedMachineEncryptedValue = z.infer<typeof VersionedMachineEncryptedValueSchema>;

export const UpdateMachineBodySchema = z.object({
  t: z.literal('update-machine'),
  machineId: z.string(),
  metadata: VersionedMachineEncryptedValueSchema.nullish(),
  daemonState: VersionedMachineEncryptedValueSchema.nullish(),
  active: z.boolean().optional(),
  activeAt: z.number().optional(),
});
export type UpdateMachineBody = z.infer<typeof UpdateMachineBodySchema>;

export const CoreUpdateBodySchema = z.discriminatedUnion('t', [
  UpdateNewMessageBodySchema,
  UpdateSessionBodySchema,
  UpdateMachineBodySchema,
]);
export type CoreUpdateBody = z.infer<typeof CoreUpdateBodySchema>;

export const CoreUpdateContainerSchema = z.object({
  id: z.string(),
  seq: z.number(),
  body: CoreUpdateBodySchema,
  createdAt: z.number(),
});
export type CoreUpdateContainer = z.infer<typeof CoreUpdateContainerSchema>;

// Aliases used by existing consumers during migration.
export const ApiMessageSchema = SessionMessageSchema;
export type ApiMessage = SessionMessage;

export const ApiUpdateNewMessageSchema = UpdateNewMessageBodySchema;
export type ApiUpdateNewMessage = UpdateNewMessageBody;

export const ApiUpdateSessionStateSchema = UpdateSessionBodySchema;
export type ApiUpdateSessionState = UpdateSessionBody;

export const ApiUpdateMachineStateSchema = UpdateMachineBodySchema;
export type ApiUpdateMachineState = UpdateMachineBody;

export const UpdateBodySchema = UpdateNewMessageBodySchema;
export type UpdateBody = UpdateNewMessageBody;

export const UpdateSchema = CoreUpdateContainerSchema;
export type Update = CoreUpdateContainer;

// ============================================
// OpenClaw Integration Types
// ============================================

// OpenClaw message content (E2E encrypted)
export const OpenClawMessageContentSchema = z.object({
    c: z.string(),  // Encrypted content
    t: z.literal('openclaw-encrypted'),
});
export type OpenClawMessageContent = z.infer<typeof OpenClawMessageContentSchema>;

// OpenClaw message schema
export const OpenClawMessageSchema = z.object({
    id: z.string(),
    conversationId: z.string(),
    seq: z.number(),
    localId: z.string().nullish(),
    role: z.enum(['user', 'assistant']),
    content: OpenClawMessageContentSchema,
    status: z.enum(['pending', 'streaming', 'complete', 'failed']),
    createdAt: z.number(),
    updatedAt: z.number(),
});
export type OpenClawMessage = z.infer<typeof OpenClawMessageSchema>;

// OpenClaw conversation schema
export const OpenClawConversationSchema = z.object({
    id: z.string(),
    accountId: z.string(),
    title: z.string().nullish(),
    openclawSessionId: z.string().nullish(),
    active: z.boolean(),
    lastActiveAt: z.number(),
    createdAt: z.number(),
    updatedAt: z.number(),
});
export type OpenClawConversation = z.infer<typeof OpenClawConversationSchema>;

// OpenClaw update types
export const UpdateOpenClawNewConversationBodySchema = z.object({
    t: z.literal('openclaw-new-conversation'),
    conversation: OpenClawConversationSchema,
});
export type UpdateOpenClawNewConversationBody = z.infer<typeof UpdateOpenClawNewConversationBodySchema>;

export const UpdateOpenClawMessageBodySchema = z.object({
    t: z.literal('openclaw-message'),
    conversationId: z.string(),
    message: OpenClawMessageSchema,
});
export type UpdateOpenClawMessageBody = z.infer<typeof UpdateOpenClawMessageBodySchema>;

export const UpdateOpenClawChunkBodySchema = z.object({
    t: z.literal('openclaw-chunk'),
    conversationId: z.string(),
    messageId: z.string(),
    chunk: z.string(),  // Encrypted chunk
    seq: z.number(),    // Chunk sequence number
    isComplete: z.boolean(),
});
export type UpdateOpenClawChunkBody = z.infer<typeof UpdateOpenClawChunkBodySchema>;

export const UpdateOpenClawStatusBodySchema = z.object({
    t: z.literal('openclaw-status'),
    connected: z.boolean(),
    gatewayUrl: z.string().nullish(),
    lastConnectedAt: z.number().nullish(),
});
export type UpdateOpenClawStatusBody = z.infer<typeof UpdateOpenClawStatusBodySchema>;

// Extended update body schema including OpenClaw types
export const OpenClawUpdateBodySchema = z.discriminatedUnion('t', [
    UpdateOpenClawNewConversationBodySchema,
    UpdateOpenClawMessageBodySchema,
    UpdateOpenClawChunkBodySchema,
    UpdateOpenClawStatusBodySchema,
]);
export type OpenClawUpdateBody = z.infer<typeof OpenClawUpdateBodySchema>;
