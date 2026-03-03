# OpenClaw Integration Documentation

This document describes the integration between happy-server and OpenClaw Gateway for AI chat functionality.

## Architecture Overview

```
┌─────────────────┐     WebSocket      ┌─────────────────┐
│  happy-server   │◄──────────────────►│  OpenClaw       │
│  (Port 3005)    │    Gateway (18789) │  Gateway        │
└────────┬────────┘                    └────────┬────────┘
         │                                      │
         │ PostgreSQL                           │
         ▼                                      ▼
┌─────────────────┐                    ┌─────────────────┐
│  Database       │                    │  OpenClaw       │
│  (Prisma)       │                    │  Core           │
└─────────────────┘                    └─────────────────┘
```

## Components

### 1. OpenClawGatewayClient (`sources/modules/openclawGatewayClient.ts`)

WebSocket client that connects to OpenClaw Gateway with device authentication.

**Features:**
- Ed25519 key pair generation for device identity
- Token-based or device signature authentication
- Automatic reconnection
- Request/response protocol with correlation IDs
- Event subscription for real-time updates

**Key Methods:**
```typescript
// Start connection
client.start();

// Send chat message
await client.sendChat(sessionKey, message, { idempotencyKey });

// Check connection status
client.isConnected();

// Stop connection
client.stop();
```

### 2. OpenClawGatewayInit (`sources/modules/openclawGatewayInit.ts`)

Initializes and manages the gateway connection during server startup.

**Features:**
- Event handling for chat messages and sessions
- Message routing to appropriate conversations
- Integration with E2E encryption module

### 3. OpenClawE2E (`sources/modules/openclawE2E.ts`)

Handles end-to-end encryption for messages.

**Features:**
- Public key storage for key exchange
- Encrypted message storage with sequencing
- Streaming message support

### 4. OpenClawMapping (`sources/modules/openclawMapping.ts`)

Maps between happy-server conversations and OpenClaw sessions.

**Features:**
- Conversation creation/lookup by OpenClaw session ID
- Account association with conversations

## Database Schema

### OpenClawConversation
```prisma
model OpenClawConversation {
    id                String   @id @default(cuid())
    accountId         String
    title             String?
    openclawSessionId String?   // OpenClaw session ID for context binding
    metadata          String?   // Encrypted metadata
    dataEncryptionKey Bytes?    // Encryption key for this conversation
    seq               Int       @default(0)
    active            Boolean   @default(true)
    lastActiveAt      DateTime  @default(now())
    messages          OpenClawMessage[]
}
```

### OpenClawMessage
```prisma
model OpenClawMessage {
    id             String   @id @default(cuid())
    conversationId String
    localId        String?  // Client-side ID for deduplication
    seq            Int
    role           String   // "user" | "assistant"
    content        Bytes    // E2E encrypted content
    status         String   // "pending" | "streaming" | "complete" | "failed"
}
```

### OpenClawTokenVault
```prisma
model OpenClawTokenVault {
    id             String   @id @default(cuid())
    accountId      String
    gatewayUrl     String
    encryptedToken Bytes    // E2E encrypted Gateway token
}
```

## Configuration

### Environment Variables

```bash
# Enable OpenClaw integration
HAPPY_OPENCLAW_ENABLED=true

# Gateway connection settings
OPENCLAW_GATEWAY_URL=ws://127.0.0.1:18789
OPENCLAW_GATEWAY_TOKEN=your-gateway-token
```

### OpenClaw Configuration (`~/.openclaw/openclaw.json`)

```json
{
  "gateway": {
    "port": 18789,
    "mode": "local",
    "auth": {
      "token": "your-gateway-token"
    }
  },
  "channels": {
    "happy": {
      "enabled": true
    }
  }
}
```

## Gateway Protocol

### Connection Flow

1. **WebSocket Connect**: Client connects to `ws://127.0.0.1:18789`
2. **Challenge**: Server sends `connect.challenge` event with nonce
3. **Authenticate**: Client sends `connect` request with auth params
4. **Ready**: Connection established, client can send/receive messages

### Message Format

**Request:**
```json
{
  "type": "req",
  "id": "req_1_1234567890",
  "method": "chat.send",
  "params": {
    "sessionKey": "session_xxx",
    "message": "Hello!",
    "idempotencyKey": "idemp_xxx"
  }
}
```

**Response:**
```json
{
  "type": "res",
  "id": "req_1_1234567890",
  "ok": true,
  "payload": {
    "runId": "idemp_xxx",
    "status": "started"
  }
}
```

**Event:**
```json
{
  "type": "event",
  "event": "chat.message",
  "payload": {
    "sessionKey": "session_xxx",
    "text": "Hello! How can I help?",
    "seq": 1
  }
}
```

### Supported Methods

| Method | Description |
|--------|-------------|
| `connect` | Authenticate with gateway |
| `chat.send` | Send a chat message |
| `sessions.list` | List active sessions |
| `sessions.create` | Create a new session |

### Event Types

| Event | Description |
|-------|-------------|
| `connect.challenge` | Authentication challenge |
| `health` | Health check response |
| `tick` | Heartbeat tick |
| `chat` | Chat message/response |
| `chat.message` | Incoming chat message |
| `chat.stream` | Streaming chunk |
| `session.started` | Session started |
| `session.ended` | Session ended |

## Usage Examples

### Starting the Gateway Client

```typescript
import { startGatewayClient, getGatewayClient } from '@/modules/openclawGatewayClient';

// Start client with callbacks
const client = startGatewayClient({
    url: 'ws://127.0.0.1:18789',
    token: 'your-gateway-token',

    onConnect: () => console.log('Connected!'),
    onDisconnect: (code, reason) => console.log(`Disconnected: ${code}`),
    onError: (err) => console.error(`Error: ${err.message}`),
    onEvent: (event) => console.log(`Event: ${event.event}`),
});
```

### Sending a Chat Message

```typescript
const client = getGatewayClient();

if (client.isConnected()) {
    const result = await client.sendChat(
        'session_xxx',
        'Hello, can you help me?',
        { idempotencyKey: `idemp_${Date.now()}` }
    );
    console.log('Sent:', result);
}
```

### Creating a Conversation

```typescript
import { getOrCreateConversation } from '@/modules/openclawMapping';

const { id: conversationId, isNew } = await getOrCreateConversation(
    accountId,
    'session_xxx',
    'My Conversation Title'
);
```

### Storing a Message

```typescript
import { storeEncryptedMessage } from '@/modules/openclawE2E';

const { id, seq } = await storeEncryptedMessage(
    conversationId,
    'msg_xxx',
    'user',
    Buffer.from('Hello!', 'utf-8')
);
```

## Testing

### Run E2E Test

```bash
cd happy/packages/happy-server
npx tsx --env-file=.env.dev sources/recipes/testOpenClawFullFlow.ts
```

### Expected Output

```
============================================================
OpenClaw Full Flow E2E Test
============================================================

[Step 1] Initializing...
✓ Auth module initialized

[Step 2] Creating test user...
✓ Created test user: test_user_xxx

[Step 3] Starting gateway client...
  ✓ Connected to gateway
✓ Gateway connected

[Step 4] Creating conversation...
✓ Conversation: cmma5w4uu0001xxx
✓ E2E public key stored

[Step 5] Storing user message...
✓ User message stored: msg_user_xxx

[Step 6] Sending message through gateway...
✓ Gateway response: { runId: 'idemp_xxx', status: 'started' }

[Step 7] Waiting for AI response events (10 seconds)...
  Received X events so far...

[Step 8] Analyzing received events...
  Total events received: X

Test Summary:
  ✓ User creation
  ✓ Gateway connection
  ✓ Conversation creation
  ✓ E2E key storage
  ✓ Message storage
  ✓ Gateway message send
```

## Troubleshooting

### Connection Issues

1. **Gateway not running**: Start OpenClaw with `openclaw start`
2. **Wrong URL**: Check `OPENCLAW_GATEWAY_URL` environment variable
3. **Token mismatch**: Ensure tokens match in both configs

### Message Not Received

1. Check gateway connection status with `client.isConnected()`
2. Verify session key matches the OpenClaw session
3. Check OpenClaw logs for errors

### Database Errors

1. Run `yarn generate` to sync Prisma client
2. Check database connection string
3. Verify migrations are applied

## Security Considerations

1. **Token Storage**: Gateway tokens are stored encrypted in `OpenClawTokenVault`
2. **E2E Encryption**: Message content is encrypted before storage
3. **Key Exchange**: Public keys are exchanged per-conversation
4. **Idempotency**: All operations use idempotency keys for retry safety

## Happy-Channel Plugin

The happy-channel plugin enables OpenClaw to send AI responses directly to happy-server users through the webhook API.

### Location

```
openclaw/extensions/happy-channel/
├── openclaw.plugin.json  # Plugin manifest
├── index.ts              # Plugin entry point
├── src/
│   └── channel.ts        # ChannelPlugin implementation
└── dist/                 # Compiled output
```

### Configuration

Add to `~/.openclaw/openclaw.json`:

```json
{
  "channels": {
    "happy": {
      "enabled": true,
      "serverUrl": "http://localhost:3005",
      "channelSecret": "your-hmac-secret"
    }
  }
}
```

### Plugin Adapters

| Adapter | Purpose |
|---------|---------|
| `configAdapter` | Lists and resolves happy accounts from config |
| `outboundAdapter` | Sends AI responses to happy-server webhook |
| `statusAdapter` | Health checks for happy-server connection |
| `directoryAdapter` | Peer/group directory (not implemented) |

### Webhook API

The plugin sends messages to:

```
POST /v1/openclaw/webhook
```

**Headers:**
- `X-Happy-Signature`: HMAC-SHA256 signature
- `X-Happy-Timestamp`: Request timestamp
- `X-Happy-Nonce`: Random nonce for replay protection

**Body:**
```json
{
  "conversationId": "cmma5w4uu0001xxx",
  "messageId": "msg_xxx",
  "role": "assistant",
  "content": "base64-encoded-content",
  "timestamp": 1234567890
}
```

### Building the Plugin

```bash
cd openclaw/extensions/happy-channel
npm run build
```

### Installing in OpenClaw

The plugin must be registered with OpenClaw's plugin system:

1. **Option 1: Publish to npm** - OpenClaw can install published plugins
2. **Option 2: Local path** - Configure OpenClaw to load from local path
3. **Option 3: Bundle with OpenClaw** - Include in OpenClaw's extensions

## Future Enhancements

1. **Streaming Support**: Full streaming message storage and delivery
2. **Multi-device Sync**: Sync conversations across devices
3. **Offline Support**: Queue messages when disconnected
4. **Rate Limiting**: Implement rate limiting for API calls
5. **Directory Support**: Implement peer/group directory for happy-channel
