// Send fake group messages at the ingest endpoint, to see what the parser does
// with your group's real phrasing — no WhatsApp, no QR, no VM needed.
//
//   npm run simulate                       # run the built-in sample set
//   npm run simulate -- "booked TT 7pm fri"  # try one message
//
// Every simulated message gets a unique msgId, so repeated runs create
// repeated bookings. Anything it creates is yours to delete in the app — or
// pass --cleanup to remove the bookings this script just made.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { looksLikeBooking } from "./gate.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
loadEnvFile();

const BADDY_URL = (process.env.BADDY_URL || "http://localhost:3000").replace(/\/$/, "");
const INGEST_SECRET = process.env.INGEST_SECRET || "";
const CHAT_ID = process.env.GROUP_ID || "simulated@g.us";

if (!INGEST_SECRET) {
  console.error("INGEST_SECRET is required (set it in bridge/.env, matching the Baddy env).");
  process.exit(1);
}

const args = process.argv.slice(2);
const cleanup = args.includes("--cleanup");
const custom = args.filter((a) => !a.startsWith("--"));

// Phrasings chosen to cover the cases that actually matter: bare evening
// hours, ranges, day names, cancellations with no date, and the near-misses
// that must NOT become bookings.
const SAMPLES = [
  "Court booked at TT Sports tomorrow 7pm",
  "booked V Square friday 7-9, 2 courts",
  "Guys booked Meeyazh for sunday 6:30 am",
  "shall we book friday 7?",
  "anyone up for badminton this weekend?",
  "Today's game is cancelled, court flooded",
  "TT sports 8pm today. court 3, bring shuttles",
  "great game yesterday 😂 7-9 was intense",
];

const messages = custom.length > 0 ? custom : SAMPLES;
const created = [];

console.log(`Ingesting ${messages.length} message(s) at ${BADDY_URL}\n`);

for (const text of messages) {
  const gate = looksLikeBooking(text);
  console.log(`"${text}"`);
  console.log(`  gate: ${gate ? "candidate" : "filtered out locally (never forwarded)"}`);

  if (!gate) {
    console.log();
    continue;
  }

  const msgId = `sim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    const res = await fetch(`${BADDY_URL}/api/ingest/whatsapp`, {
      method: "POST",
      headers: { Authorization: `Bearer ${INGEST_SECRET}`, "Content-Type": "application/json" },
      body: JSON.stringify({ msgId, chatId: CHAT_ID, sender: "simulator", text }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.log(`  HTTP ${res.status}: ${body.error ?? "(no body)"}\n`);
      continue;
    }
    if (body.status === "created") {
      const b = body.booking;
      console.log(`  ✓ ${body.action}: #${b.id} ${b.venue} · ${b.date} ${b.startTime} · ${b.durationMins}min · ${b.courts} court(s)`);
      created.push(b.id);
    } else if (body.status === "cancelled") {
      console.log(`  ✓ cancelled: #${body.booking.id} ${body.booking.venue} (${body.booking.cancelReason})`);
    } else {
      console.log(`  – ${body.status}: ${body.reason ?? ""}`);
    }
  } catch (err) {
    console.log(`  ✗ unreachable: ${err.message}`);
  }
  console.log();
}

if (cleanup && created.length > 0) {
  console.log(`Cleaning up ${created.length} booking(s)…`);
  for (const id of created) {
    await fetch(`${BADDY_URL}/api/bookings/${id}`, { method: "DELETE" }).catch(() => {});
  }
  console.log("Done.");
} else if (created.length > 0) {
  console.log(`Created bookings: ${created.join(", ")} — delete them in the app, or re-run with --cleanup.`);
}

function loadEnvFile() {
  try {
    const raw = readFileSync(path.join(here, ".env"), "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    /* fall back to real env */
  }
}
