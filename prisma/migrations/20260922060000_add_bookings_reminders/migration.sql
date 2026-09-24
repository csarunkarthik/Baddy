-- Booking lifecycle + reminder plumbing.
--
-- Bookings are intentionally NOT folded into "Session": a Session is the
-- who-turned-up record (one per date+sport), while a day can hold several
-- bookings — book one court, it gets cancelled, rebook another the same
-- evening. Cancellations are retained so the group can see what was called off.

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('BOOKED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "phone" TEXT;

-- CreateTable
CREATE TABLE "Booking" (
    "id" SERIAL NOT NULL,
    "date" DATE NOT NULL,
    "sport" "Sport" NOT NULL DEFAULT 'BADMINTON',
    "venue" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "durationMins" INTEGER NOT NULL DEFAULT 120,
    "courts" INTEGER NOT NULL DEFAULT 1,
    "status" "BookingStatus" NOT NULL DEFAULT 'BOOKED',
    "note" TEXT,
    "bookedBy" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "replacesId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSub" (
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSuccess" TIMESTAMP(3),
    "failureCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PushSub_pkey" PRIMARY KEY ("endpoint")
);

-- CreateTable
CREATE TABLE "ReminderLog" (
    "id" SERIAL NOT NULL,
    "kind" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReminderLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Booking_date_idx" ON "Booking"("date");

-- CreateIndex
CREATE INDEX "Booking_status_date_idx" ON "Booking"("status", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ReminderLog_kind_key_key" ON "ReminderLog"("kind", "key");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_replacesId_fkey" FOREIGN KEY ("replacesId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;
