# Labelling guide — booking eval dataset

How to label a row in `booking-dataset.json`. When two labels conflict, a rule
here decides it; if no rule does, write the new rule here **before** relabelling.
Most rules also belong in the parser prompt — keep them in step.

## Row format

```json
{
  "msgId": "seed-01",                  // unique; real rows keep the WhatsApp id
  "text": "Booked TT Sports for friday 7-9",
  "sentAt": "2026-09-22T06:00:00Z",    // the clock relative days resolve against
  "expected": { "action": "book", "date": "2026-09-25", "startTime": "19:00", "venue": "TT Sports" },
  "acceptable": ["none"],              // optional — only for genuinely ambiguous rows
  "reviewed": true                     // false = draft label from the exporter
}
```

Hand-written rows use a fixed `sentAt` of Tue 22 Sep 2026 (same as
`scripts/test-day-ref.mjs`) so expected dates never drift.

## Rules

| Message | Label |
|---|---|
| States a court booking that exists, with date, time and venue | `book` (all three fields filled) |
| Booking missing any of date / time / venue ("Booked a court") | `none` — a half-parsed booking is worse than none |
| A booking-app game post — "Join X's badminton game" + TurfTown/Playo/Hudle link, "Badminton activity confirmed on …" | `book`: hosting a game on a booking app means the court is booked. Venue is the court name without the area. Strip real link ids from rows (the repo is public). |
| Only *considering* a booking-app game ("should I create a turftown game for sat?") | `none` |
| A bare "cancelled" with no subject, day or venue | `cancel`, with `none` acceptable — on its own it may not even be about the court, and missing a cancel is safer than a false one |
| The original slot fell through **and** a replacement is named | `rebook` with the replacement's fields |
| The whole group's session or court is off | `cancel`, with `date` if the message says which day |
| A cancel with no day ("cancelled") | `cancel`, no `date` — ingest takes it to mean the next booking |
| **One person** dropping out ("can't make it", "count me out", "skip me") | `none` |
| A question, a plan, an intention ("shall we book", "I'll try booking") | `none` |
| The bot's own reminder ("Game in 3 hours — 7pm at TT Sports") | `none` |
| Chat, scores, banter | `none` |

## Ambiguity

When a message can't be labelled confidently from its text alone:

1. **If one reading is clearly more likely**, label that and add the other to
   `acceptable`. Prefix the id `amb-` so the group can be run with `--grep=amb`.
2. **If the answer depends on context the parser doesn't see** (which message it
   replies to, who sent it), that's a product gap, not a labelling problem —
   note it below and leave the row out until the parser gets that input.
3. **When unsure, lean `none`.** A wrong cancel silences the reminder for a game
   that's on; a missed cancel posts a reminder for one that's off. We'd rather
   the second.

## Known context gaps

- A bare "cancelled" / "done" replying to a specific message — the parser sees
  only the reply text, not the quoted message.

## Checks

`npm test` runs `check-dataset.mjs`: unique ids, valid fields, the
"book needs all three fields" rule, and no two rows with the same text and
incompatible labels.
