// Prints every group this account is in, with its id, so you can put the right
// one in GROUP_ID. Run after logging in once:  npm run list-groups
//
// Connects, waits for the group metadata to sync, prints, exits. Read-only
// like the main bridge — it sends nothing.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import makeWASocket, { useMultiFileAuthState, fetchLatestBaileysVersion } from "@whiskeysockets/baileys";
import qrcode from "qrcode-terminal";

const here = path.dirname(fileURLToPath(import.meta.url));
loadEnvFile();

const { state, saveCreds } = await useMultiFileAuthState(path.join(here, "auth"));
const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }));

const sock = makeWASocket({
  auth: state,
  version,
  markOnlineOnConnect: false,
  syncFullHistory: false,
  browser: ["Baddy Bridge", "Chrome", "1.0.0"],
});

sock.ev.on("creds.update", saveCreds);

sock.ev.on("connection.update", async ({ connection, qr }) => {
  if (qr) {
    console.log("\nScan with WhatsApp → Settings → Linked devices → Link a device:\n");
    qrcode.generate(qr, { small: true });
  }
  if (connection !== "open") return;

  console.log("✓ Connected. Fetching groups…\n");
  try {
    const groups = await sock.groupFetchAllParticipating();
    const rows = Object.values(groups);
    if (rows.length === 0) {
      console.log("No groups found. If you just linked the device, give it a minute and re-run.");
    }
    for (const g of rows) {
      console.log(`${g.subject}`);
      console.log(`  GROUP_ID=${g.id}`);
      console.log(`  ${g.participants?.length ?? "?"} participants\n`);
    }
  } catch (err) {
    console.error("Could not fetch groups:", err.message);
  }
  process.exit(0);
});

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
