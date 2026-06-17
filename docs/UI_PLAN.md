# Baddy → "Spotify-grade" UI Plan

> Goal: make the UI feel as polished as Spotify — **dark-first, bold, cohesive, fluid, and
> unbreakable** — **without changing any functionality**. Same features, far higher finish.

## What "Spotify-grade" actually means (and the Baddy translation)

| Spotify trait | Baddy translation |
|---|---|
| Dark-first, near-black surfaces, one vibrant accent (green) | Lean into the existing "night match" identity: dark surface scale + **indigo/violet** as the signature accent |
| Bold type hierarchy (huge titles, muted secondary) | Hero stat numbers + bold section titles; muted `text-2` for meta |
| Content-derived gradient headers (album-art color) | Header gradient derived from session/venue/player (hash → hue) |
| Cover art everywhere | **Generated gradient avatars** per player (emoji centered on a per-name gradient) |
| Designed skeletons, never spinners/blank | Skeleton loaders + designed empty/error states on every screen |
| Smooth motion + the persistent **now-playing bar** | Route/press/reorder motion + a persistent **Live Session bar** (the signature flourish) |
| One reusable design system | `app/components/ui/*` primitives; tokens, not hardcoded colors |

## Foundations already in place
- Mobile-first `max-w-lg`, fixed bottom nav, safe-area padding — keep.
- `app/matches/` already componentized (refactor branch) — the model for the rest.
- Tailwind v4 with a `@theme` block + CSS vars in `app/globals.css` — the hook for tokens/dark mode.

---

## Phase 0 — Production hardening (substrate: "never looks broken")
The Spotify feel collapses if a fetch hangs or a throw white-screens. Do this first.
- **Error boundaries**: add `app/error.tsx` + `app/global-error.tsx` (+ per-segment where useful) with a branded "something went wrong / retry" card.
- **Fetch hardening**: one shared helper (e.g. `lib/api.ts` `apiGet`/`apiSend`) that checks `res.ok`, parses JSON safely, and returns `{data|error}`. Replace the raw `Promise.all().then()` chains on Home, Players, Stats, Feed, Awards (all currently missing `.catch()`/`.ok` → infinite spinner or crash on bad JSON).
- **Mutation feedback + rollback**: `toggleAttendance`, `setWinner`, `saveScores` optimistically update then fire with no failure surface → add toast + rollback.
- Files: new `app/error.tsx`, `app/global-error.tsx`, `lib/api.ts`; touch every `app/*/page.tsx` loader + `app/components/HistoryList.tsx`.

## Phase 1 — Design system & tokens (the look foundation)
- **Token layer** in `app/globals.css` via CSS vars + Tailwind v4 `@theme` / `@custom-variant dark`:
  - Surfaces: `--surface` (#0e0f13-ish), `--surface-raised`, `--surface-hover`; text `--text`, `--text-muted`, `--text-faint`; `--border`; radii + elevation + spacing scale.
  - **Palette** — indigo/violet remains the **primary** accent for interactive, branding, and WIN states. Single cool accent does the heavy lifting:
    - **Accent / interactive / WIN**: indigo → violet ramp (`--accent`). Replaces ALL current emerald/teal/lime usage (winner cards, wins column, "Make Entry", selected players, success toasts).
    - **Success / positive semantic states**: green is permitted via the single `--success` token (`#22c55e`) for genuinely semantic spots (e.g. a "connected" indicator, a positive confirmation state). Do NOT use it as a second general-purpose accent or let it spread into branding. Do NOT re-introduce emerald/teal/lime token sprawl — only `--success`.
    - **MVP / celebration**: amber→gold gradient (keep — it's a distinct trophy context, not "success green").
    - **Warning / locked**: amber (small badges).
    - **Negative / error / loss**: rose/red.
    - **Neutral**: zinc/slate scale.
    - Migration note: grep-and-remap every `emerald-*`, `teal-*`, `lime-*`, `green-*` to the accent/zinc tokens during Phase 2 (except intentional `text-success`/`bg-success` uses).
  - **Dark-only** (decided) — like Spotify; a light theme can be added later via the same token layer with no component rewrites.
- **Typography**: bold display scale for titles + hero numbers; muted secondary. Keep Geist (or add one display weight).
- **Primitives** in `app/components/ui/`: `Card`, `Button` (primary/secondary/ghost/danger), `Chip`, `Skeleton`, `Spinner`, `SectionHeader`, `Sheet`/`Modal`, `Toast`/`ToastProvider`, `Avatar` (gradient-generated), `Stat` (hero number + label), `EmptyState`. These replace the ~20 ad-hoc `bg-white rounded-3xl …` cards and the 6 different spinner colors.

## Phase 2 — Restyle screens onto the system (one PR per screen)
Apply tokens + primitives page by page, in this order (lowest risk first): **awards → stats → players → history → feed → home → matches**.
- Dark surfaces, content-derived gradient headers, bold stat blocks instead of dense tables.
- Horizontal "shelves"/carousels where natural (awards gallery, player chips, venue chips).
- Skeletons replace spinners; designed empty states everywhere (incl. matches-with-0-fixtures, currently blank).
- Each page ships independently and must `next build` clean.

## Phase 3 — Motion & micro-interactions
- Add `motion` (Framer Motion successor). Targets: route/tab crossfade, list-item press (scale), **animated fixture reorder** (already de-stickied — now animate the sink), MVP/stat **count-ups**, **award reveal**, accordion expand, skeleton shimmer.
- Gate everything on `prefers-reduced-motion` (pattern already used for confetti).

## Phase 4 — Polish & accessibility
- `focus-visible` rings, `aria-label`s on icon-only/back buttons, contrast pass (critical in dark), **lucide-react** icon set for chrome (decided) — keep emoji for 🏆🐉🥒 personality — haptic-style press states.

## Deferred (decided to skip for now)
- **Persistent "Live Session" bar** (Spotify now-playing analog): sticky bar during a live session showing X/Y matches, current matchup, MVP-so-far, tap to expand. Net-new UI over existing data; revisit after the system + restyle land.

---

## Sequencing & risk
- **Phase 0 + 1 are the foundation** — do them together; nothing visual lands until tokens + primitives + hardening exist.
- Phases 2–5 are **incremental and independently shippable** (page by page), so the app is never half-broken.
- Touches every page (unlike the contained matches refactor), so it's a multi-PR effort. The matches route is already componentized, making it the easiest to restyle last as the showcase.

## Verification (every phase)
- `npm run build` (= `prisma generate && next build`) + `tsc --noEmit` + `eslint` clean.
- Visual QA each restyled screen in dark; smoke-test the full match flow (generate → score → Live badge → next → finish → MVP → recap → share).
- a11y spot check: keyboard nav, focus rings, `prefers-reduced-motion`, contrast.
- Use a far-future throwaway date for any data the tests create (dev & prod share one Neon DB).

## Decisions (locked)
1. **Theme**: **dark-only** (light theme later via the same tokens, no rewrites).
2. **Signature Live Session bar**: **deferred** (revisit after system + restyle).
3. **Icons**: **lucide-react** for chrome; emoji kept for personality.
