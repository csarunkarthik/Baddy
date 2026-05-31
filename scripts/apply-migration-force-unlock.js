#!/usr/bin/env node
// Run: node scripts/apply-migration-force-unlock.js
// Applies the forceUnlocked column to the Session table.
const { Client } = require("pg");
const crypto = require("crypto");
require("dotenv").config();

const MIGRATION_NAME = "20260531120000_session_force_unlock";
const SQL = `ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "forceUnlocked" BOOLEAN NOT NULL DEFAULT false;`;

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  await client.query("BEGIN");
  await client.query(SQL);

  const checksum = crypto.createHash("sha256").update(SQL).digest("hex");
  await client.query(
    `INSERT INTO _prisma_migrations
       (id, checksum, finished_at, migration_name, started_at, applied_steps_count)
     VALUES (gen_random_uuid()::text, $1, NOW(), $2, NOW(), 1)
     ON CONFLICT (migration_name) DO NOTHING`,
    [checksum, MIGRATION_NAME]
  );

  await client.query("COMMIT");
  await client.end();
  console.log("Migration applied:", MIGRATION_NAME);
}

main().catch((e) => { console.error(e); process.exit(1); });
