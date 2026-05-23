-- CreateTable
CREATE TABLE "chat_session_state" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "state" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_session_state_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chat_session_state_sessionId_idx" ON "chat_session_state"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "chat_session_state_userId_sessionId_key" ON "chat_session_state"("userId", "sessionId");

-- AddForeignKey
ALTER TABLE "chat_session_state" ADD CONSTRAINT "chat_session_state_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
