-- CreateEnum
CREATE TYPE "Sport" AS ENUM ('BADMINTON', 'PICKLEBALL');

-- AlterTable: add sport column with default, replace date-unique with composite
ALTER TABLE "Session" ADD COLUMN "sport" "Sport" NOT NULL DEFAULT 'BADMINTON';
DROP INDEX "Session_date_key";
CREATE UNIQUE INDEX "Session_date_sport_key" ON "Session"("date", "sport");
