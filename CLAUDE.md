@AGENTS.md

# Database & migrations

- DB: Neon Postgres. URL in `.env` as `DATABASE_URL` (gitignored). Hostname looks like `ep-...c-7.us-east-1.aws.neon.tech`.
- Runtime client: `@prisma/adapter-pg` (TCP via `pg`) — see [lib/prisma.ts](lib/prisma.ts). This works against the c-7 Neon endpoint.
- **`prisma migrate` / `prisma db push` cannot reach this Neon endpoint** — the Rust migration engine fails with `P1001` against the `c-7` hostname even though `pg` connects fine. Don't waste time retrying.
- Workflow to apply schema changes:
  1. Edit `prisma/schema.prisma`.
  2. Hand-write the SQL into a new `prisma/migrations/<UTC-ts>_<name>/migration.sql` (mirror format of existing files).
  3. Apply via a small `pg` script inside a transaction (see commit `add_match_tracking` for template). Insert a row into `_prisma_migrations` (id=`gen_random_uuid()::text`, checksum=sha256 of SQL, started/finished=NOW(), applied_steps_count=1) so `prisma migrate status` stays in sync.
  4. Run `npx prisma generate` to refresh the client types.
- The build script (`prisma generate && next build`) does NOT run migrations. Prod DB is the same Neon instance as dev — apply migrations once via step 3 and prod picks them up immediately.

# Conventions

- Don't touch existing tabs/pages when adding experimental features the user is about to test — keep blast radius to net-new files + minimal nav additions. (Said explicitly for the matches/win-loss feature on 2026-05-14.)
