# Baddy — Multi-Agent Plan

## Standing Constraints (every agent must respect these)

- **Neon migration quirk**: NEVER run `prisma migrate dev` or `prisma db push`. The Neon hostname (`c-7` segment) breaks Prisma's Rust migration engine. Hand-write SQL into `prisma/migrations/<UTC-ts>_<name>/migration.sql` and apply via a `pg` script. Insert a row into `_prisma_migrations` manually. See CLAUDE.md for full workflow.
- **Timezone**: All dates/display in IST (`Asia/Kolkata`). Use `toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })` for `YYYY-MM-DD`.
- **Date parsing**: Parse `YYYY-MM-DD` strings as `new Date(s + 'T00:00:00Z')`. Never append `T00:00:00Z` to full ISO strings.
- **App Router only**: No `pages/` directory. Everything is in `app/`.
- **No component library**: All UI is hand-rolled Tailwind v4 utility classes.
- **Locking**: Sessions older than `LOCK_AFTER_DAYS` (=2) days in IST are locked. Enforce on API mutations and reflect in UI.
- **Deployment**: Push `main` → Vercel auto-deploys. Do NOT push unless explicitly asked.
- **Build**: `prisma generate && next build`. Migrations are NOT run on build.

---

## Agent Ownership

| Agent | Owns | Never touches |
|---|---|---|
| **DB Agent** | `app/api/**`, `prisma/schema.prisma`, `prisma/migrations/`, `lib/prisma.ts`, `lib/locking.ts` | React components, UI styling |
| **UI Agent** | `app/*/page.tsx`, `app/components/`, `app/hooks/`, `app/layout.tsx` | API routes, Prisma schema |
| **AI Agent** | `app/api/ai/`, `lib/baddy-tools.ts`, `lib/elo.ts`, `lib/fixtures.ts`, `lib/couples.ts` | UI components, DB migrations |
| **Review Agent** | Cross-cutting: TypeScript errors, CLAUDE.md, commit messages, PR descriptions | Does not write new features |

---

## Communication Protocol

- When you complete a task, update the **Task Board** below with status + notes.
- When you need another agent to do something, add a task to the board with `Assigned To` set to their agent name.
- When blocked, write a `BLOCKED:` note under your task.
- Check this file at the start of every new task.

---

## Feature Backlog (priority order)

1. **Session Prep Brief** — "🧠 Today's Intel" card before session starts. New `app/api/sessions/[id]/intel/route.ts` calls Groq with player stats + streaks → returns 3–4 bullets. Render as collapsible card in `app/matches/page.tsx`.
2. **Award Milestone Radar** — Extend `app/api/stats/awards/route.ts` to return `nextFor` (closest unearned trophy + gap count per player). Show on stats page.
3. **H2H Rival Card** — New `app/api/stats/h2h/route.ts` for head-to-head matrix. Show "archnemesis" and "favourite victim" cards per player on stats page.

---

## Task Board

### In Progress
_(none)_

### Completed
- [x] **[Feature 1] Intel card UI** (`app/matches/page.tsx`) — **UI Agent**, 2026-06-05
  - Collapsible "🧠 Today's Intel" accordion between Setup card and Fixtures. Spinner while loading, each Groq bullet on its own line. Hidden when no bullets.
- [x] **[Feature 2] Milestone Radar UI** (`app/awards/page.tsx`) — **UI Agent**, 2026-06-05
  - "🎯 Next Milestone" card on awards page. Rows sorted by gap asc: `[emoji] Player → label (N away)`.
  - BLOCKED: awaiting `nextFor` from awards API — UI is wired but will be empty until DB Agent ships the API change.
- [x] **[Feature 3] Rivals UI** (`app/awards/page.tsx`) — **UI Agent**, 2026-06-05
  - "😈 Rivals" card on awards page. Per-player chips: rose for archnemesis, emerald for favourite victim.
  - BLOCKED: awaiting `GET /api/stats/h2h` — UI is wired but will be empty until DB Agent ships the route.
- [x] **[Feature 1] Intel API route** (`app/api/sessions/[id]/intel/route.ts`) — **DB Agent**, 2026-06-05
  - `GET /api/sessions/[id]/intel` — loads attending players, computes ELO + career W/P + last-5-session form via `computeElo()`, calls Groq (`llama-3.3-70b-versatile`) → `{ bullets: string[] }` (3–4 bullets). Returns `{ bullets: [] }` if <4 attending.
- [x] Pre-match odds inline in fixture header (`app/matches/page.tsx`) — 2026-06-04
- [x] AI Session Recap via Groq (`app/api/sessions/[id]/recap/route.ts`) — 2026-06-04
- [x] Win condition requires 21+ score — 2026-06-03
- [x] Tap score to edit manually — 2026-06-03
- [x] Completed visuals (winner/loser/sort) gated on 21+ score condition — 2026-06-03
- [x] Match badge "Next up" → "🔴 Live" — 2026-06-03
