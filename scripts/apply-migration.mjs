#!/usr/bin/env node
// Apply a hand-written migration to Neon and record it in _prisma_migrations.
//
//   node --env-file=.env scripts/apply-migration.mjs <migration_dir_name>
//
// Prisma's Rust migration engine can't reach this Neon endpoint (the `c-7`
// hostname segment → P1001), so `prisma migrate deploy` is not an option here;
// see CLAUDE.md → Migrations. This runs the SQL over the `pg` driver inside one
// transaction and appends the bookkeeping row so `prisma migrate status`
// stays clean.
//
// Note: _prisma_migrations has a PK on `id` only — there is NO unique index on
// `migration_name` — so dedupe with an explicit existence check rather than
// ON CONFLICT, which would raise "no unique constraint matching".
import { Client } from "pg";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const name = process.argv[2];
  if (!name) {
    console.error("Usage: node --env-file=.env scripts/apply-migration.mjs <migration_dir_name>");
    process.exit(1);
  }
  const file = path.join(here, "..", "prisma", "migrations", name, "migration.sql");
  if (!fs.existsSync(file)) {
    console.error(`No migration.sql at ${file}`);
    process.exit(1);
  }
  const sql = fs.readFileSync(file, "utf8");
  const checksum = crypto.createHash("sha256").update(sql).digest("hex");

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query(
      `SELECT 1 FROM _prisma_migrations WHERE migration_name = $1 AND finished_at IS NOT NULL`,
      [name]
    );
    if (rows.length > 0) {
      console.log(`Already applied, skipping: ${name}`);
      return;
    }

    await client.query("BEGIN");
    await client.query(sql);
    await client.query(
      `INSERT INTO _prisma_migrations
         (id, checksum, finished_at, migration_name, started_at, applied_steps_count)
       VALUES (gen_random_uuid()::text, $1, NOW(), $2, NOW(), 1)`,
      [checksum, name]
    );
    await client.query("COMMIT");
    console.log(`Applied: ${name}`);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
