-- AlterTable
ALTER TABLE "Session" ADD COLUMN "totalMatches" INTEGER NOT NULL DEFAULT 15;
ALTER TABLE "Session" ADD COLUMN "bamHariKid" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Session" ADD COLUMN "arunDeepKid" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Match" (
    "id" SERIAL NOT NULL,
    "sessionId" INTEGER NOT NULL,
    "matchNumber" INTEGER NOT NULL,
    "winner" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchPlayer" (
    "id" SERIAL NOT NULL,
    "matchId" INTEGER NOT NULL,
    "playerId" INTEGER NOT NULL,
    "team" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "MatchPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Match_sessionId_matchNumber_key" ON "Match"("sessionId", "matchNumber");
CREATE INDEX "Match_sessionId_idx" ON "Match"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchPlayer_matchId_playerId_key" ON "MatchPlayer"("matchId", "playerId");
CREATE INDEX "MatchPlayer_playerId_idx" ON "MatchPlayer"("playerId");
CREATE INDEX "MatchPlayer_matchId_idx" ON "MatchPlayer"("matchId");

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MatchPlayer" ADD CONSTRAINT "MatchPlayer_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MatchPlayer" ADD CONSTRAINT "MatchPlayer_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
