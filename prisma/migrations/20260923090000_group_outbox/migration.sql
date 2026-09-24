-- Reminders move from web push into the WhatsApp group itself.
--
-- The bridge VM has no inbound connectivity, so the server cannot call it.
-- Instead the server queues messages here and the bridge polls. dedupeKey is
-- UNIQUE, which is the entire at-most-once guarantee: a retried cron tick
-- inserts nothing rather than posting a second reminder.
--
-- PushSub and ReminderLog are dropped: push is gone (nobody has to install
-- anything now), and OutboxMessage.dedupeKey replaces the reminder ledger.
-- Both tables were empty.

-- CreateTable
CREATE TABLE "OutboxMessage" (
    "id" SERIAL NOT NULL,
    "chatId" TEXT,
    "text" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "sentMsgId" TEXT,

    CONSTRAINT "OutboxMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OutboxMessage_dedupeKey_key" ON "OutboxMessage"("dedupeKey");

-- CreateIndex
CREATE INDEX "OutboxMessage_status_createdAt_idx" ON "OutboxMessage"("status", "createdAt");

-- DropTable
DROP TABLE IF EXISTS "PushSub";

-- DropTable
DROP TABLE IF EXISTS "ReminderLog";
