-- WhatsApp auto-detection: provenance on Booking, a processed-message ledger
-- and a liveness row for the bridge.
--
-- Booking.sourceMsgId is UNIQUE on purpose: it is the last line of defence
-- against duplicate bookings if the bridge replays history after a reconnect.

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'app',
ADD COLUMN     "sourceMsgId" TEXT,
ADD COLUMN     "sourceSender" TEXT,
ADD COLUMN     "sourceText" TEXT;

-- CreateTable
CREATE TABLE "ProcessedMessage" (
    "msgId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "sender" TEXT,
    "text" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "bookingId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedMessage_pkey" PRIMARY KEY ("msgId")
);

-- CreateTable
CREATE TABLE "BridgeState" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "connected" BOOLEAN NOT NULL DEFAULT false,
    "chatId" TEXT,
    "note" TEXT,
    "messagesSeen" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BridgeState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Booking_sourceMsgId_key" ON "Booking"("sourceMsgId");

-- CreateIndex
CREATE INDEX "ProcessedMessage_createdAt_idx" ON "ProcessedMessage"("createdAt");
