-- CreateTable
CREATE TABLE "OpenClawConversation" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "title" TEXT,
    "openclawSessionId" TEXT,
    "metadata" TEXT,
    "metadataVersion" INTEGER NOT NULL DEFAULT 0,
    "dataEncryptionKey" BYTEA,
    "seq" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpenClawConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpenClawMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "localId" TEXT,
    "seq" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "content" BYTEA NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpenClawMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpenClawTokenVault" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "gatewayUrl" TEXT NOT NULL,
    "encryptedToken" BYTEA NOT NULL,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpenClawTokenVault_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OpenClawConversation_accountId_idx" ON "OpenClawConversation"("accountId");

-- CreateIndex
CREATE INDEX "OpenClawConversation_accountId_updatedAt_idx" ON "OpenClawConversation"("accountId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "OpenClawConversation_openclawSessionId_idx" ON "OpenClawConversation"("openclawSessionId");

-- CreateIndex
CREATE INDEX "OpenClawMessage_conversationId_seq_idx" ON "OpenClawMessage"("conversationId", "seq");

-- CreateIndex
CREATE INDEX "OpenClawMessage_conversationId_createdAt_idx" ON "OpenClawMessage"("conversationId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "OpenClawMessage_conversationId_localId_key" ON "OpenClawMessage"("conversationId", "localId");

-- CreateIndex
CREATE INDEX "OpenClawTokenVault_accountId_idx" ON "OpenClawTokenVault"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "OpenClawTokenVault_accountId_gatewayUrl_key" ON "OpenClawTokenVault"("accountId", "gatewayUrl");

-- AddForeignKey
ALTER TABLE "OpenClawConversation" ADD CONSTRAINT "OpenClawConversation_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpenClawMessage" ADD CONSTRAINT "OpenClawMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "OpenClawConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpenClawTokenVault" ADD CONSTRAINT "OpenClawTokenVault_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
