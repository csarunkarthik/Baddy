// Baddy WhatsApp bridge.
//
// Logs into WhatsApp as a normal client (the only way to read a *group* — the
// official Cloud API never receives group messages), watches one group, and
// POSTs candidate booking messages to Baddy.
//
// ── It reads, and it posts reminders ──────────────────────────────────────
// Sending is what WhatsApp's anti-spam actually looks for, so every send is
// deliberately rationed:
//
//   * one destination only — GROUP_ID, never a DM, never another group
//   * MAX_SENDS_PER_DAY hard ceiling, counted in-process
//   * MIN_SEND_GAP_MS between posts, plus random jitter so it doesn't tick
//     like a metronome
//   * no @-mentions (a strong spam signal) and no bulk anything
//   * still never marks messages read, and never claims presence:
//       markOnlineOnConnect: false → the phone keeps owning presence
//       syncFullHistory: false     → don't pull years of chat on login
//
// Expected volume is ~2-3 messages a week.
//
// ── The bot must not read its own output ──────────────────────────────────
// It writes to the same group it reads. Its own reminder ("Game in 3 hours —
// 7pm at TT Sports") contains a venue and a time, so the parser would happily
// turn it into a phantom booking. Every id it posts goes into `selfSent`, and
// the server also returns recently-sent ids on each poll so a restart can't
// lose track.
//
// ── Why the "seen" bookkeeping is paranoid ────────────────────────────────
// Baileys replays recent messages after a reconnect, and a free VM reconnects
// often. Three independent guards stop a replay becoming a duplicate booking:
//   1. STARTED_AT — ignore anything sent before this process came up.
//   2. seen Set    — in-memory, catches replays within one run.
//   3. the server  — ProcessedMessage.msgId + Booking.sourceMsgId are unique.
// Only the third survives a restart, which is why it exists.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";
import qrcode from "qrcode-terminal";
import { looksLikeBooking } from "./gate.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

loadEnvFile();

const BADDY_URL = (process.env.BADDY_URL || "").replace(/\/$/, "");
const INGEST_SECRET = process.env.INGEST_SECRET || "";
const GROUP_ID = process.env.GROUP_ID || "";
const DEBUG_ALL = process.env.DEBUG_ALL_MESSAGES === "true";

/** `npm run login` — pair the device, confirm it worked, and exit. */
const LOGIN_ONLY = process.argv.includes("--login");

const HEARTBEAT_MS = 5 * 60 * 1000;
const OUTBOX_POLL_MS = 60 * 1000;
/** Ceiling on posts per UTC day. Far above real need (~2-3/week). */
const MAX_SENDS_PER_DAY = Number(process.env.MAX_SENDS_PER_DAY ?? 10);
const MIN_SEND_GAP_MS = 30 * 1000;
const STARTED_AT = Math.floor(Date.now() / 1000);
/** Grace window so a message sent seconds before startup isn't lost. */
const STARTUP_GRACE_SEC = 120;

const seen = new Set();
/** WhatsApp ids of messages this bot posted — never parse our own output. */
const selfSent = new Set();
let messagesSeen = 0;
let reconnectDelay = 2000;
let sendsToday = 0;
let sendDay = new Date().toISOString().slice(0, 10);
let lastSendAt = 0;

if (!LOGIN_ONLY && (!BADDY_URL || !INGEST_SECRET)) {
  console.error("Missing BADDY_URL or INGEST_SECRET — copy .env.example to .env and fill it in.");
  process.exit(1);
}
if (!LOGIN_ONLY && !GROUP_ID) {
  console.warn("⚠  GROUP_ID is not set. Run `npm run list-groups` to find it; until then nothing is forwarded.");
}

start();

/** The live socket, so the outbox loop can post without re-connecting. */
let socket = null;

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState(path.join(here, "auth"));
  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }));

  const sock = makeWASocket({
    auth: state,
    version,
    // See the read-only note at the top of this file.
    markOnlineOnConnect: false,
    syncFullHistory: false,
    browser: ["Baddy Bridge", "Chrome", "1.0.0"],
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("\nScan this with WhatsApp → Settings → Linked devices → Link a device:\n");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "open") {
      reconnectDelay = 2000;

      if (LOGIN_ONLY) {
        // Pairing is the whole job in login mode. Say so plainly and stop,
        // rather than silently becoming a bridge the user then has to Ctrl-C
        // without ever learning whether the pairing took.
        const me = sock.user?.id?.split(":")[0] ?? "unknown number";
        console.log(`\n✓ Paired as ${me}. Credentials saved to bridge/auth/.`);
        console.log("  Next: npm run list-groups\n");
        setTimeout(() => process.exit(0), 1000);
        return;
      }

      socket = sock;
      console.log(`✓ Connected. Watching ${GROUP_ID || "(no group configured)"}`);
      // Confirm membership before claiming health: being connected proves
      // nothing if we've been removed from the group.
      verifyGroup(sock).then((note) => heartbeat(true, note));
    }

    if (connection === "close") {
      const status = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = status === DisconnectReason.loggedOut;
      if (!LOGIN_ONLY) {
        heartbeat(false, loggedOut ? "logged out" : `disconnected (${status ?? "unknown"})`);
      }

      if (loggedOut) {
        // The session was revoked from the phone. A reconnect loop would spin
        // forever; a human has to re-scan the QR.
        console.error("✗ Logged out of WhatsApp. Delete bridge/auth and run `npm run login` to re-pair.");
        process.exit(1);
      }

      // Exponential backoff, capped. Hammering reconnects is exactly the
      // pattern that gets a number flagged.
      const delay = reconnectDelay;
      reconnectDelay = Math.min(reconnectDelay * 2, 5 * 60 * 1000);
      console.warn(`Disconnected (${status ?? "unknown"}). Reconnecting in ${Math.round(delay / 1000)}s…`);
      setTimeout(start, delay);
    }
  });

  sock.ev.on("messages.upsert", async (event) => {
    // "notify" = live messages. "append"/history batches are replays, which we
    // never want to act on.
    if (event.type !== "notify") return;

    for (const msg of event.messages ?? []) {
      try {
        await handleMessage(msg);
      } catch (err) {
        console.error("[bridge] message handler", err);
      }
    }
  });

  if (!LOGIN_ONLY) {
    setInterval(async () => heartbeat(true, await verifyGroup(socket)), HEARTBEAT_MS);
    if (!outboxTimer) outboxTimer = setInterval(drainOutbox, OUTBOX_POLL_MS);
  }
}

/**
 * Check we're still a member of GROUP_ID.
 *
 * Without this the failure is silent and nasty: someone removes the bot from
 * the group, the socket stays happily connected, the heartbeat keeps reporting
 * healthy, and the app shows a green light while detecting nothing at all.
 * The returned note is surfaced in the app.
 */
async function verifyGroup(sock) {
  if (!GROUP_ID) return "no GROUP_ID configured";
  if (!sock) return "not connected";
  try {
    const meta = await sock.groupMetadata(GROUP_ID);
    const me = sock.user?.id?.split(":")[0];
    const member = !me || (meta.participants ?? []).some((p) => (p.id ?? "").startsWith(me));
    if (!member) return `NOT a member of "${meta.subject}"`;
    return `watching "${meta.subject}" (${meta.participants?.length ?? "?"} members)`;
  } catch (err) {
    // A 403/404 here almost always means removed from the group or a bad id.
    return `cannot read group: ${err.message}`;
  }
}

let outboxTimer = null;
let draining = false;

/**
 * Poll the server for messages to post, and post them.
 *
 * Pull rather than push because the VM has no inbound connectivity — and it
 * makes the send durable: if the bridge is offline when a reminder comes due,
 * the row waits and goes out on reconnect instead of being lost.
 */
async function drainOutbox() {
  if (draining || !socket || !GROUP_ID) return;
  draining = true;
  try {
    const res = await fetch(`${BADDY_URL}/api/outbox`, {
      headers: { Authorization: `Bearer ${INGEST_SECRET}` },
    });
    if (!res.ok) {
      console.error(`[outbox] HTTP ${res.status}`);
      return;
    }
    const { messages = [], selfMsgIds = [] } = await res.json();

    // Re-learn our own message ids after a restart, so a reminder posted by a
    // previous run can't be read back in as a booking.
    for (const id of selfMsgIds) selfSent.add(id);

    for (const msg of messages) {
      if (!withinSendBudget()) {
        console.warn(`[outbox] daily send cap (${MAX_SENDS_PER_DAY}) reached — holding ${messages.length} message(s)`);
        break;
      }
      await waitForSendGap();
      await postToGroup(msg);
    }
  } catch (err) {
    console.error("[outbox] poll failed:", err.message);
  } finally {
    draining = false;
  }
}

function withinSendBudget() {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== sendDay) {
    sendDay = today;
    sendsToday = 0;
  }
  return sendsToday < MAX_SENDS_PER_DAY;
}

/** Space posts out, with jitter so the timing doesn't look mechanical. */
async function waitForSendGap() {
  const since = Date.now() - lastSendAt;
  const jitter = Math.floor(Math.random() * 5000);
  const wait = Math.max(0, MIN_SEND_GAP_MS - since) + jitter;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

async function postToGroup(msg) {
  const target = msg.chatId || GROUP_ID;
  // Belt and braces: this bot only ever posts to its one configured group.
  if (target !== GROUP_ID) {
    await ackOutbox(msg.id, false, null, `refused: target ${target} is not GROUP_ID`);
    return;
  }

  try {
    const sent = await socket.sendMessage(target, { text: msg.text });
    const sentId = sent?.key?.id ?? null;
    if (sentId) selfSent.add(sentId);
    sendsToday++;
    lastSendAt = Date.now();
    console.log(`← posted ${msg.dedupeKey} (${sendsToday}/${MAX_SENDS_PER_DAY} today)`);
    await ackOutbox(msg.id, true, sentId, null);
  } catch (err) {
    console.error(`[outbox] send failed for ${msg.dedupeKey}:`, err.message);
    await ackOutbox(msg.id, false, null, err.message);
  }
}

async function ackOutbox(id, ok, sentMsgId, error) {
  try {
    await fetch(`${BADDY_URL}/api/outbox`, {
      method: "POST",
      headers: { Authorization: `Bearer ${INGEST_SECRET}`, "Content-Type": "application/json" },
      body: JSON.stringify({ id, ok, sentMsgId, error }),
    });
  } catch (err) {
    // Unacked-but-sent would re-post on the next poll, which is the one
    // duplicate this design can't fully rule out. Log loudly.
    console.error(`[outbox] ACK FAILED for id=${id} ok=${ok} — may repost:`, err.message);
  }
}

async function handleMessage(msg) {
  const chatId = msg.key?.remoteJid;
  const msgId = msg.key?.id;
  if (!chatId || !msgId) return;
  if (GROUP_ID && chatId !== GROUP_ID) return;
  if (seen.has(msgId)) return;
  // Never parse our own posts: a reminder reads exactly like a booking.
  if (selfSent.has(msgId)) return;

  // Ignore anything from before this process started (reconnect replays).
  const ts = Number(msg.messageTimestamp ?? 0);
  if (ts && ts < STARTED_AT - STARTUP_GRACE_SEC) return;

  const text = extractText(msg);
  if (!text) return;

  seen.add(msgId);
  messagesSeen++;

  // Note: fromMe messages are NOT skipped wholesale. The person who books the
  // court may well be using the account this bridge is logged in as, so their
  // own typing is worth reading — only ids in `selfSent` (the bot's own posts,
  // filtered above) are excluded.
  const sender = msg.pushName || msg.key?.participant?.split("@")[0] || null;

  if (!looksLikeBooking(text)) {
    if (DEBUG_ALL) console.log(`· ignored: ${truncate(text)}`);
    return;
  }

  console.log(`→ candidate from ${sender ?? "unknown"}: ${truncate(text)}`);

  const result = await forward({ msgId, chatId, sender, text, sentAt: ts ? new Date(ts * 1000).toISOString() : null });
  if (result) {
    console.log(`  ${result.status}${result.reason ? `: ${result.reason}` : ""}${result.booking ? ` → booking #${result.booking.id} ${result.booking.venue} ${result.booking.startTime}` : ""}`);
  }
}

/** Pull plain text out of the various message shapes that carry it. */
function extractText(msg) {
  const m = msg.message;
  if (!m) return "";
  const raw =
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    m.ephemeralMessage?.message?.conversation ||
    m.ephemeralMessage?.message?.extendedTextMessage?.text ||
    m.viewOnceMessage?.message?.extendedTextMessage?.text ||
    "";
  return typeof raw === "string" ? raw.trim() : "";
}

async function forward(payload) {
  try {
    const res = await fetch(`${BADDY_URL}/api/ingest/whatsapp`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${INGEST_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error(`  ✗ ingest HTTP ${res.status}`, body?.error ?? "");
      // Let a later duplicate retry: the server dedupes, so re-forwarding the
      // same message after a transient failure is safe.
      seen.delete(payload.msgId);
      return null;
    }
    return body;
  } catch (err) {
    console.error("  ✗ ingest unreachable:", err.message);
    seen.delete(payload.msgId);
    return null;
  }
}

async function heartbeat(connected, note) {
  try {
    await fetch(`${BADDY_URL}/api/bridge/heartbeat`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${INGEST_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ connected, chatId: GROUP_ID || null, note, messagesSeen }),
    });
  } catch {
    // A heartbeat that can't be delivered is itself the signal the app needs —
    // the row goes stale and the Book tab reports auto-detection offline.
  }
}

function truncate(s) {
  return s.length > 90 ? `${s.slice(0, 90)}…` : s;
}

/**
 * Minimal .env loader. Node's --env-file exists but isn't in every Node
 * build a free VM ships with, and a dependency for four lines is not worth it.
 */
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
    // No .env — fall back to real environment variables (systemd, docker).
  }
}
