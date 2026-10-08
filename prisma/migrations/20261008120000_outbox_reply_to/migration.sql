-- Answers to "@baddy …" questions quote the message they answer.
--
-- The WhatsApp id of the question being answered. Nullable: every other kind
-- of bot post (reminders, nudges, confirmations) is a fresh message, not a
-- reply. The bridge only quotes when it still has the original in memory;
-- after a restart it posts the answer unquoted.

-- AlterTable
ALTER TABLE "OutboxMessage" ADD COLUMN "replyToMsgId" TEXT;
