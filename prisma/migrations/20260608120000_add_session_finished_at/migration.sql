-- AlterTable: mark when a session was explicitly finished (MVP crowned).
ALTER TABLE "Session" ADD COLUMN "finishedAt" TIMESTAMP(3);
