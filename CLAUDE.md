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
  bookings/                             Court bookings — book, cancel, rebook, reminders, streak podium
  api/
    players/, players/[id]              CRUD players
    bookings/, bookings/[id]            Court bookings: list/create, edit/cancel/delete
    outbox                              Queue the bridge polls to post group messages (GET/POST)
    cron/reminders                      Reminder tick (3h-before + empty-week nudge)
    ingest/whatsapp                     Group message → booking (bridge calls this)
    bridge/heartbeat                    Bridge liveness (POST from bridge, GET for the UI)
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
    stats/consistency                   Streaks — current, all-time longest (top 3), missed-in-a-row
    stats/reliability                   Last-5/last-10 form vs own baseline, MIA list
    stats/turnout                       Avg turnout + trend, biggest/smallest, venue mix, co-attendance
lib/
  prisma.ts                             Singleton PrismaClient with PrismaPg adapter
  ist.ts                                IST date/time helpers (ymd vs instant, week bounds, formatting)
  attendance-stats.ts                   Streaks / reliability / turnout computed from one session fetch
  bookings.ts                           Booking queries + serialization (BookingDTO)
  booking-types.ts                      BookingDTO type alone, so clients don't pull in Prisma
  messages.ts                           WhatsApp copy — shared by the share buttons AND the cron
  outbox.ts                             Queue of messages the bot owes the group; dedupeKey = at-most-once
  whatsapp.ts                           WhatsApp Cloud API sender (same Meta app as the Vault project)
  parse-booking.ts                      Regex gate + Groq intent extraction for group messages
bridge/                                 SEPARATE always-on service — reads the WhatsApp group.
                                          Not deployed by Vercel; see bridge/README.md
scripts/
  apply-migration.mjs                   Apply a hand-written migration to Neon
  test-day-ref.mjs                      Unit test for the day-reference resolver
  couples.ts                            COUPLES pinned by player ID (not name — survives renames).
                                          resolveCouples + activeForbiddenPairs helpers.
  fixtures.ts                           generateFixtures(): greedy + multi-attempt fairness with forbidden pairs.
                                          Splits each 4-set into 2v2 minimizing partner repeats.
  locking.ts                            isSessionLocked(date) — true once 8+ days past in IST (LOCK_AFTER_DAYS=7).
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
Booking (id, date DATE, sport, venue, startTime "HH:MM" IST, durationMins=120,
         courts=1, status BOOKED|CANCELLED, note, bookedBy,
         cancelledAt, cancelReason, replacesId → Booking SET NULL)
                                        Deliberately NOT unique on (date, sport):
                                        one day can hold a cancelled slot plus its replacement.
Booking.source                          "app" | "whatsapp"; sourceMsgId is UNIQUE (dedupe),
                                        sourceSender + sourceText keep the original message
ProcessedMessage (msgId PK, chatId, sender, text, action, bookingId)
                                        Every forwarded message + what we decided, incl. "none"
BridgeState (id=1, lastSeenAt, connected, chatId, messagesSeen)
                                        Single-row heartbeat; stale ⇒ UI says detection is offline
OutboxMessage (id, chatId, text, dedupeKey UNIQUE, status, attempts, sentMsgId)
                                        status: pending | sent | failed | suppressed.
                                        dedupeKey IS the at-most-once guarantee.
Post (id, content, author, createdAt)
Comment (postId → Post CASCADE, content, author, createdAt)
```

# Conventions

- **Timezone**: All dates display + compute in IST (`Asia/Kolkata`). Use `toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })` for `YYYY-MM-DD` and `'en-GB'` for human format.
- **Date storage**: Session.date is `@db.Date` (no time). Parse `YYYY-MM-DD` strings as `new Date(s + 'T00:00:00Z')` to avoid TZ shifts. Don't append `T00:00:00Z` to full ISO strings (regression fixed in `a95664c`).
- **Couples**: Pinned by player ID in [lib/couples.ts](lib/couples.ts) — update only if a player is deleted + recreated.
- **Locking**: Sessions older than `LOCK_AFTER_DAYS` (= 7) days in IST are locked. Enforce on API mutations + reflect in UI. Posts/comments are NOT session-locked.
- **Net-new for experimental features**: When the user flags a feature as "about to test, don't touch existing tabs," keep blast radius to net-new files + a single nav-tile addition. Drop this restriction once the feature ships.
- **Don't run migrations in build**: Build script is `prisma generate && next build`. See Migrations.

# Bookings & reminders

Everything is driven from the WhatsApp group. Nobody opens the app to book,
cancel or get reminded; the Book tab is a **read-only** view of what the bot
has understood.

- **Booking ≠ Session.** `Session` stays the who-turned-up record (one per
  date+sport, attendance hangs off it). `Booking` is the court reservation and
  its lifecycle. They are linked only by date+sport when needed — no FK — which
  is what lets a day hold a cancelled booking *and* the court it was moved to.
- **Cancel, don't delete.** Cancelling flips `status` to `CANCELLED` and keeps
  the venue/time/reason. `DELETE` is only for a booking created by mistake.
  Rebooking creates a *new* row with `replacesId` pointing at the cancelled one.
- **Times are IST wall-clock strings** (`startTime` = "HH:MM"), not timestamps.
  `istInstant(ymd, hhmm)` in [lib/ist.ts](lib/ist.ts) turns a booking into a real
  instant. IST is a fixed +05:30 with no DST, which is what makes that string
  arithmetic safe.
- **`ymd` vs `instant`** is the main footgun here. A `@db.Date` column comes
  back from Prisma as UTC midnight, so `ymdOf()` reads it **in UTC** — reading
  it in IST would roll the day forward. (Raw `pg`, unlike Prisma, applies the
  local timezone to DATE columns; that's why the two disagree in scripts.)
- **The cron never sends anything.** `/api/cron/reminders` only *enqueues* text
  into `OutboxMessage`; the bridge is the only thing holding a WhatsApp session.
  It is safe to call as often as you like — `dedupeKey` decides whether a
  message has already been queued, so duplicates are impossible and a *missed*
  run fires late rather than never.
- **Cancelling must suppress a queued reminder,** not merely avoid queuing one.
  By the time a cancellation arrives the cron may already have queued the
  reminder, and claiming the dedupeKey would then collide harmlessly while the
  pending row sails on to be posted. `suppress()` upserts it out of `pending`.
  This was a real bug, caught by the end-to-end test.
- **Scheduling:** `vercel.json` declares a `*/15` cron, but **Vercel's Hobby
  plan only runs crons about once a day**, which is useless for a 3-hour lead.
  `.github/workflows/reminders.yml` pokes the same endpoint every 15 minutes as
  the actual scheduler. Both running at once is harmless.
- **No web push.** It was built and then removed: with reminders landing in the
  group, nobody has to install the app or grant notification permission. If it
  ever comes back, the history is in git.

# WhatsApp auto-detection and posting (the `bridge/` service)

Read [bridge/README.md](bridge/README.md) before touching any of this.

- **Why a separate always-on service.** The Cloud API (what the Vault project
  uses) can neither read nor post to a *group* — it only handles DMs to a
  business number. Both directions require acting as a real WhatsApp client
  (Baileys), which holds a permanent websocket, so it cannot run on Vercel. It
  runs on a free Oracle Always Free VM under systemd, logged in as the owner's
  **personal** number — a deliberate call: an aged account with daily human
  traffic is far less likely to be flagged than a fresh SIM, at the cost of a
  worse outcome if it ever is. Reminders therefore post under a real person's
  name, not a bot's.
- **Sending is rationed on purpose.** Reading is near-invisible to WhatsApp;
  sending is what anti-spam targets. One destination only (`GROUP_ID`, enforced
  bridge-side), `MAX_SENDS_PER_DAY` ceiling, a 30s minimum gap plus jitter, no
  @-mentions, no read receipts, no presence. Don't loosen these casually.
- **Outbox, not push.** The VM has no inbound connectivity, so the server
  queues and the bridge polls every 60s. This also makes sends durable across a
  bridge outage.
- **The bot must never parse its own posts.** It writes to the group it reads,
  and a reminder ("Game in 3 hours — 7pm at TT Sports") reads exactly like a
  booking. Sent ids are remembered in-process *and* returned by `/api/outbox`
  on each poll, so a restart can't lose track and invent a phantom booking.
- **Baileys is pinned to an exact version.** `^6.7.24` would resolve to
  `6.17.16`, which is *older* code despite the higher semver (published Mar
  2025 vs Jul 2026). Never loosen that pin to a range.
- **Two-stage parse, cheap before expensive.** `looksLikeBooking()` lives in
  [lib/booking-gate.ts](lib/booking-gate.ts) and is mirrored in
  `bridge/gate.mjs` (which runs on the VM, so group chatter never leaves the
  machine). **Keep the two copies in sync** — `scripts/test-gate.mjs` asserts
  they agree. Only candidates reach Groq.
- **The LLM does NOT do date arithmetic.** It returns the day *words* it saw
  (`day_ref`: "friday", "tomorrow", "25 sep") and `resolveDayRef()` in
  [lib/ist.ts](lib/ist.ts) resolves them. Handed a correct lookup table of the
  next 10 days, the model still resolved "friday" to a Saturday. Cover any
  change with `npm test`.
- **Ingest is idempotent three ways** — the bridge ignores pre-startup messages
  and keeps an in-memory seen-set, `ProcessedMessage.msgId` is a primary key,
  and `Booking.sourceMsgId` is uniquely indexed. Only the last two survive a
  bridge restart, which is why they exist.
- **A booking is only created when venue, date AND time all parse**, with
  confidence ≥ 0.6. A half-parsed booking is worse than none.
- **Test without WhatsApp:** `cd bridge && npm run simulate`, and `npm test`
  from the repo root for the pure-function suites.

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
- **`Cannot read properties of undefined (reading 'findUnique')`** means the
  generated client is stale — the delegate for a newly added model is missing.
  Prisma can silently regenerate from a default schema (e.g. after a bare
  `require("@prisma/client")` outside the app), which wipes every model added
  since. Fix with `npx prisma generate`, then confirm:
  ```
  node --env-file=.env -e "const {PrismaClient}=require('@prisma/client');
    const {PrismaPg}=require('@prisma/adapter-pg');
    const p=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL})});
    console.log(Object.keys(p).filter(k=>!k.startsWith('_')&&!k.startsWith('$')).join(', '))"
  ```
  Production is unaffected — the Vercel build runs `prisma generate` itself.
- Prod DB is the same Neon instance as dev. One application = both environments updated.

# Deployment

- Push `main` → Vercel auto-deploys. Preview URLs land on the GitHub commit page.
- The dev server picks the next free port (usually 3001 if 3000 is taken).
- `.env` is gitignored. `DATABASE_URL` is set there only.
