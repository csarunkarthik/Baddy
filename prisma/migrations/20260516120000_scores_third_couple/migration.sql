-- AlterTable
ALTER TABLE "Session" ADD COLUMN "avinashSharmiliKid" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Match" ADD COLUMN "teamAScore" INTEGER;
ALTER TABLE "Match" ADD COLUMN "teamBScore" INTEGER;
