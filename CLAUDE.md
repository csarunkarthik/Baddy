@AGENTS.md

# Stack at a glance

- **Framework**: Next.js 16 with Turbopack (App Router only — no `pages/`). React 19. TypeScript strict.
- **Styling**: Tailwind v4 (`@tailwindcss/postcss`). No component library; everything is hand-rolled with Tailwind utility classes.
- **DB**: Neon Postgres (single instance shared between dev + prod). Prisma 7 client with `@prisma/adapter-pg` (TCP via `pg`).
- **Hosting**: Vercel, watches GitHub `csarunkarthik/Baddy`, deploys `main` automatically.
- **Build**: `prisma generate && next build` — migrations are NOT run on build; apply them manually (see Migrations).

# Repo layout

```
app/                                    Next App Router
  layout.tsx, page.tsx                  Root layout + Home (entry: date + venue + attendance)
  players/                              Roster management
  history/                              List past sessions + edit attendance + delete session
  stats/                                Aggregate stats — leaderboards, attendance%, buddy scores, wins
  feed/                                 Social posts + comments
  matches/                              Win/loss tracker — fixtures, winners, MVP, share
  api/
    players/, players/[id]              CRUD players
    sessions/, sessions/[id]            Sessions: GET by date, POST upsert, DELETE
    sessions/[id]/attendance            Toggle one player's attendance for a session
    sessions/[id]/matches               GET matches+couples for session
    sessions/[id]/matches/config        PATCH totalMatches + kid flags
    sessions/[id]/matches/generate      POST regenerate fixtures (replaces all)
    matches/[id]                        PATCH winner or override players; DELETE
    posts/, posts/[id]/comments         Feed
    history                             Full sessions list
    venues                              Distinct venue suggestions
    stats                               Aggregate stats (attendance%, buddy score, MVP)
    stats/wins                          Win/played/% per player (all-time, only counts matches with a winner)
lib/
  prisma.ts                             Singleton PrismaClient with PrismaPg adapter
  couples.ts                            COUPLES pinned by player ID (not name — survives renames).
                                          resolveCouples + activeForbiddenPairs helpers.
  fixtures.ts                           generateFixtures(): greedy + multi-attempt fairness with forbidden pairs.
                                          Splits each 4-set into 2v2 minimizing partner repeats.
  locking.ts                            isSessionLocked(date) — true once 3+ days past in IST (LOCK_AFTER_DAYS=2).
prisma/
  schema.prisma                         Schema source of truth
  migrations/                           Hand-written migrations (see Migrations)
```

# Data model

```
Player (id, name unique, createdAt)
Session (id, date unique DATE, venue, createdAt,
         totalMatches=15, bamHariKid=false, arunDeepKid=false)
Attendance (playerId, sessionId)        @@unique([playerId, sessionId])
Match (id, sessionId, matchNumber, winner: "A"|"B"|null, createdAt)
                                        @@unique([sessionId, matchNumber])
                                        ON DELETE CASCADE from Session
MatchPlayer (matchId, playerId, team: "A"|"B", position: 0|1)
                                        @@unique([matchId, playerId])
                                        ON DELETE CASCADE from Match
Post (id, content, author, createdAt)
Comment (postId → Post CASCADE, content, author, createdAt)
```

# Conventions

- **Timezone**: All dates display + compute in IST (`Asia/Kolkata`). Use `toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })` for `YYYY-MM-DD` and `'en-GB'` for human format.
- **Date storage**: Session.date is `@db.Date` (no time). Parse `YYYY-MM-DD` strings as `new Date(s + 'T00:00:00Z')` to avoid TZ shifts. Don't append `T00:00:00Z` to full ISO strings (regression fixed in `a95664c`).
- **Couples**: Pinned by player ID in [lib/couples.ts](lib/couples.ts) — update only if a player is deleted + recreated.
- **Locking**: Sessions older than `LOCK_AFTER_DAYS` (= 2) days in IST are locked. Enforce on API mutations + reflect in UI. Posts/comments are NOT session-locked.
- **Net-new for experimental features**: When the user flags a feature as "about to test, don't touch existing tabs," keep blast radius to net-new files + a single nav-tile addition. Drop this restriction once the feature ships.
- **Don't run migrations in build**: Build script is `prisma generate && next build`. See Migrations.

# Migrations (IMPORTANT — Neon endpoint quirk)

- The Neon hostname has a `c-7` segment (`ep-...c-7.us-east-1.aws.neon.tech`). The `pg` driver connects fine; Prisma's Rust migration engine fails with `P1001` against it. Don't waste time retrying `prisma migrate dev` / `prisma db push`.
- Workflow to apply schema changes:
  1. Edit `prisma/schema.prisma`.
  2. Hand-write the SQL into a new `prisma/migrations/<UTC-ts>_<name>/migration.sql` (mirror format of existing files).
  3. Apply via a `pg` script in a transaction. Insert a row into `_prisma_migrations` so `prisma migrate status` stays in sync:
     ```js
     INSERT INTO _prisma_migrations
       (id, checksum, finished_at, migration_name, started_at, applied_steps_count)
     VALUES (gen_random_uuid()::text, $checksum, NOW(), $name, NOW(), 1)
     ```
     (template in commit `add_match_tracking`)
  4. Run `npx prisma generate` to refresh the client types.
- Prod DB is the same Neon instance as dev. One application = both environments updated.

# Deployment

- Push `main` → Vercel auto-deploys. Preview URLs land on the GitHub commit page.
- The dev server picks the next free port (usually 3001 if 3000 is taken).
- `.env` is gitignored. `DATABASE_URL` is set there only.
