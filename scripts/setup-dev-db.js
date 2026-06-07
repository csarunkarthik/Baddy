// Run once: applies schema + seeds dev DB
// Usage: node scripts/setup-dev-db.js
require("dotenv").config({ path: ".env" });
const { Client } = require("pg");

const DB = process.env.LOCAL_DATABASE_URL;
if (!DB) { console.error("LOCAL_DATABASE_URL not set in .env"); process.exit(1); }

async function run() {
  const client = new Client({ connectionString: DB });
  await client.connect();
  console.log("Connected.");

  // ── Schema ───────────────────────────────────────────────────────────────
  await client.query(`
    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      id TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      finished_at TIMESTAMPTZ,
      migration_name TEXT NOT NULL,
      logs TEXT,
      rolled_back_at TIMESTAMPTZ,
      started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      applied_steps_count INT NOT NULL DEFAULT 0
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS "Player" (
      "id" SERIAL NOT NULL,
      "name" TEXT NOT NULL,
      "avatar" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "Player_name_key" ON "Player"("name");

    CREATE TABLE IF NOT EXISTS "Session" (
      "id" SERIAL NOT NULL,
      "date" DATE NOT NULL,
      "venue" TEXT NOT NULL DEFAULT '',
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "totalMatches" INTEGER NOT NULL DEFAULT 15,
      "bamHariKid" BOOLEAN NOT NULL DEFAULT false,
      "arunDeepKid" BOOLEAN NOT NULL DEFAULT false,
      "avinashSharmiliKid" BOOLEAN NOT NULL DEFAULT false,
      CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
    );

    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Sport') THEN
        CREATE TYPE "Sport" AS ENUM ('BADMINTON', 'PICKLEBALL');
      END IF;
    END $$;

    ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "sport" "Sport" NOT NULL DEFAULT 'BADMINTON';

    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_indexes WHERE indexname = 'Session_date_sport_key'
      ) THEN
        CREATE UNIQUE INDEX "Session_date_sport_key" ON "Session"("date", "sport");
      END IF;
    END $$;

    CREATE TABLE IF NOT EXISTS "Attendance" (
      "id" SERIAL NOT NULL,
      "playerId" INTEGER NOT NULL,
      "sessionId" INTEGER NOT NULL,
      CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "Attendance_playerId_sessionId_key" ON "Attendance"("playerId", "sessionId");

    ALTER TABLE "Attendance"
      DROP CONSTRAINT IF EXISTS "Attendance_playerId_fkey",
      ADD CONSTRAINT "Attendance_playerId_fkey"
        FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    ALTER TABLE "Attendance"
      DROP CONSTRAINT IF EXISTS "Attendance_sessionId_fkey",
      ADD CONSTRAINT "Attendance_sessionId_fkey"
        FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

    CREATE TABLE IF NOT EXISTS "Match" (
      "id" SERIAL NOT NULL,
      "sessionId" INTEGER NOT NULL,
      "matchNumber" INTEGER NOT NULL,
      "winner" TEXT,
      "teamAScore" INTEGER,
      "teamBScore" INTEGER,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "Match_sessionId_matchNumber_key" ON "Match"("sessionId", "matchNumber");
    CREATE INDEX IF NOT EXISTS "Match_sessionId_idx" ON "Match"("sessionId");

    ALTER TABLE "Match"
      DROP CONSTRAINT IF EXISTS "Match_sessionId_fkey",
      ADD CONSTRAINT "Match_sessionId_fkey"
        FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

    CREATE TABLE IF NOT EXISTS "MatchPlayer" (
      "id" SERIAL NOT NULL,
      "matchId" INTEGER NOT NULL,
      "playerId" INTEGER NOT NULL,
      "team" TEXT NOT NULL,
      "position" INTEGER NOT NULL,
      CONSTRAINT "MatchPlayer_pkey" PRIMARY KEY ("id")
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "MatchPlayer_matchId_playerId_key" ON "MatchPlayer"("matchId", "playerId");
    CREATE INDEX IF NOT EXISTS "MatchPlayer_playerId_idx" ON "MatchPlayer"("playerId");
    CREATE INDEX IF NOT EXISTS "MatchPlayer_matchId_idx" ON "MatchPlayer"("matchId");

    ALTER TABLE "MatchPlayer"
      DROP CONSTRAINT IF EXISTS "MatchPlayer_matchId_fkey",
      ADD CONSTRAINT "MatchPlayer_matchId_fkey"
        FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    ALTER TABLE "MatchPlayer"
      DROP CONSTRAINT IF EXISTS "MatchPlayer_playerId_fkey",
      ADD CONSTRAINT "MatchPlayer_playerId_fkey"
        FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

    CREATE TABLE IF NOT EXISTS "Post" (
      "id" SERIAL NOT NULL,
      "content" TEXT NOT NULL,
      "author" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
    );

    CREATE TABLE IF NOT EXISTS "Comment" (
      "id" SERIAL NOT NULL,
      "postId" INTEGER NOT NULL,
      "content" TEXT NOT NULL,
      "author" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
    );

    ALTER TABLE "Comment"
      DROP CONSTRAINT IF EXISTS "Comment_postId_fkey",
      ADD CONSTRAINT "Comment_postId_fkey"
        FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  `);
  console.log("Schema applied.");

  // ── Players (IDs must match lib/couples.ts exactly) ──────────────────────
  // arunDeep: [2,1], bamHari: [8,9], avinashSharmili: [7,14]
  const players = [
    { id: 1,  name: "Deepika" },
    { id: 2,  name: "Arun" },
    { id: 3,  name: "Karthik" },
    { id: 4,  name: "Priya" },
    { id: 5,  name: "Ramesh" },
    { id: 6,  name: "Sneha" },
    { id: 7,  name: "Avinash" },
    { id: 8,  name: "Bamini" },
    { id: 9,  name: "Hari" },
    { id: 10, name: "Divya" },
    { id: 11, name: "Suresh" },
    { id: 12, name: "Meena" },
    { id: 13, name: "Vijay" },
    { id: 14, name: "Sharmili" },
  ];

  for (const p of players) {
    await client.query(
      `INSERT INTO "Player" (id, name) VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
      [p.id, p.name]
    );
  }
  // Keep the serial sequence in sync
  await client.query(`SELECT setval('"Player_id_seq"', 14, true)`);
  console.log("Players seeded.");

  // ── Sessions + Attendance + Matches ──────────────────────────────────────
  const venues = ["Decathlon Sholinganallur", "YMCA Courts", "Nehru Indoor Stadium"];
  const allIds = players.map((p) => p.id);

  // 6 sessions over the last ~5 weeks
  const sessionDates = [
    "2026-05-04", "2026-05-11", "2026-05-18",
    "2026-05-25", "2026-06-01", "2026-06-05",
  ];

  let matchCounter = 0;

  for (let si = 0; si < sessionDates.length; si++) {
    const date = sessionDates[si];
    const venue = venues[si % venues.length];

    const { rows: [session] } = await client.query(
      `INSERT INTO "Session" (date, venue, "totalMatches", sport)
       VALUES ($1, $2, 15, 'BADMINTON')
       ON CONFLICT ("date", "sport") DO UPDATE SET venue = EXCLUDED.venue
       RETURNING id`,
      [date, venue]
    );
    const sessionId = session.id;

    // Pick 10-12 attendees randomly but always include the 3 couples
    const couples = [1, 2, 7, 8, 9, 14];
    const others = allIds.filter((id) => !couples.includes(id));
    const shuffled = others.sort(() => Math.random() - 0.5);
    const attending = [...couples, ...shuffled.slice(0, 4 + (si % 3))];

    for (const pid of attending) {
      await client.query(
        `INSERT INTO "Attendance" ("playerId", "sessionId")
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [pid, sessionId]
      );
    }

    // Generate 15 simple round-robin style matches
    for (let m = 1; m <= 15; m++) {
      matchCounter++;
      const shuffledA = attending.sort(() => Math.random() - 0.5);
      const [a1, a2, b1, b2] = shuffledA;
      const winner = Math.random() > 0.5 ? "A" : "B";
      const scored = Math.random() > 0.4;
      const aScore = scored ? (winner === "A" ? 21 : Math.floor(Math.random() * 18) + 10) : null;
      const bScore = scored ? (winner === "B" ? 21 : Math.floor(Math.random() * 18) + 10) : null;

      const { rows: [match] } = await client.query(
        `INSERT INTO "Match" ("sessionId", "matchNumber", winner, "teamAScore", "teamBScore")
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT ("sessionId", "matchNumber") DO UPDATE
           SET winner = EXCLUDED.winner
         RETURNING id`,
        [sessionId, m, winner, aScore, bScore]
      );
      const matchId = match.id;

      for (const [pid, team, pos] of [[a1,"A",0],[a2,"A",1],[b1,"B",0],[b2,"B",1]]) {
        await client.query(
          `INSERT INTO "MatchPlayer" ("matchId", "playerId", team, position)
           VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
          [matchId, pid, team, pos]
        );
      }
    }

    console.log(`Session ${date} @ ${venue} — ${attending.length} players, 15 matches.`);
  }

  // ── Feed posts ────────────────────────────────────────────────────────────
  const posts = [
    { content: "Great session today! That last match was intense 🏸", author: "Arun" },
    { content: "Can we move next Sunday to 7am instead of 8am?", author: "Hari" },
    { content: "Bamini's smash is literally unreturnable now 😭", author: "Karthik" },
  ];
  for (const post of posts) {
    const { rows: [p] } = await client.query(
      `INSERT INTO "Post" (content, author) VALUES ($1, $2) RETURNING id`,
      [post.content, post.author]
    );
    await client.query(
      `INSERT INTO "Comment" ("postId", content, author) VALUES ($1, $2, $3)`,
      [p.id, "Haha yes agreed!", "Deepika"]
    );
  }
  console.log("Feed posts seeded.");

  await client.end();
  console.log("\nDone! Dev DB is ready.");
}

run().catch((e) => { console.error(e); process.exit(1); });
