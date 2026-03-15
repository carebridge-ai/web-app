-- CreateTable
CREATE TABLE "user_memories" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "keyDecisions" JSONB NOT NULL,
    "followUps" JSONB NOT NULL,
    "emotionalState" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_memories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_memories_userId_createdAt_idx" ON "user_memories"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "user_memories_conversationId_idx" ON "user_memories"("conversationId");

-- AddForeignKey
ALTER TABLE "user_memories" ADD CONSTRAINT "user_memories_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
