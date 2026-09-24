// Validate the bridge's configuration before you bother with a QR scan.
//
//   npm run doctor
//
// Every check here corresponds to a failure that is otherwise silent or
// confusing: a BADDY_URL pointing at localhost from a VM, a secret that
// doesn't match Vercel, an unset GROUP_ID, an app that isn't deployed. Run it
// on the VM after filling in .env.

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
loadEnvFile();

const BADDY_URL = (process.env.BADDY_URL || "").replace(/\/$/, "");
const INGEST_SECRET = process.env.INGEST_SECRET || "";
const GROUP_ID = process.env.GROUP_ID || "";

const results = [];
function check(name, ok, detail, fatal = false) {
  results.push({ name, ok, detail, fatal });
  const mark = ok ? "✓" : fatal ? "✗" : "!";
  console.log(`${mark} ${name}`);
  if (detail) console.log(`    ${detail}`);
}

console.log(`\nBaddy bridge doctor\n${"─".repeat(40)}`);

// --- 1. env file present and filled ---------------------------------------
check(".env present", existsSync(path.join(here, ".env")), existsSync(path.join(here, ".env")) ? null : "Copy .env.example to .env and fill it in", true);

check("BADDY_URL set", Boolean(BADDY_URL), BADDY_URL || "Required — your deployed app URL", true);

if (BADDY_URL) {
  const isLocal = /localhost|127\.0\.0\.1/.test(BADDY_URL);
  check(
    "BADDY_URL is not localhost",
    !isLocal,
    isLocal
      ? "Points at localhost. Fine when testing from your laptop, but on the VM this means 'the VM itself' — set the deployed https URL."
      : BADDY_URL
  );
  check("BADDY_URL uses https", BADDY_URL.startsWith("https://") || isLocal, BADDY_URL.startsWith("https://") || isLocal ? null : "Expected https:// for a deployed app");
}

check("INGEST_SECRET set", Boolean(INGEST_SECRET), INGEST_SECRET ? `${INGEST_SECRET.length} chars` : "Required — must match the value in Vercel", true);

check(
  "GROUP_ID set",
  Boolean(GROUP_ID),
  GROUP_ID || "Not set yet — run `npm run login` then `npm run list-groups`, and paste it in. Nothing is detected until then."
);

// --- 2. auth state --------------------------------------------------------
const paired = existsSync(path.join(here, "auth", "creds.json"));
check(
  "WhatsApp account paired",
  paired,
  paired ? "auth/ present" : "Not paired yet — run `npm run login` and scan the QR"
);

// --- 3. the app is reachable and the secret matches -----------------------
if (BADDY_URL && INGEST_SECRET) {
  // An unauthenticated POST must be refused. 404 here means not deployed.
  let unauth;
  try {
    unauth = await fetch(`${BADDY_URL}/api/ingest/whatsapp`, { method: "POST" });
  } catch (err) {
    check("app reachable", false, `Could not reach ${BADDY_URL} — ${err.message}`, true);
  }

  if (unauth) {
    check("app reachable", true, `HTTP ${unauth.status} from /api/ingest/whatsapp`);
    check(
      "ingest endpoint deployed",
      unauth.status !== 404,
      unauth.status === 404 ? "404 — this build doesn't have the route. Deploy the branch with the bridge in it." : null,
      true
    );
    check(
      "ingest is guarded",
      unauth.status === 401,
      unauth.status === 401 ? null : `Expected 401 without credentials, got ${unauth.status}`
    );

    // With the right secret and an empty body we should get 400 (validation),
    // NOT 401. That is the only way to prove the secret actually matches.
    const authed = await fetch(`${BADDY_URL}/api/ingest/whatsapp`, {
      method: "POST",
      headers: { Authorization: `Bearer ${INGEST_SECRET}`, "Content-Type": "application/json" },
      body: "{}",
    }).catch(() => null);

    if (authed) {
      check(
        "INGEST_SECRET matches the server",
        authed.status === 400,
        authed.status === 401
          ? "Server rejected the secret. The value in Vercel differs from this .env — and remember env changes need a redeploy."
          : authed.status === 400
            ? null
            : `Expected 400 with a valid secret and empty body, got ${authed.status}`,
        authed.status === 401
      );
    }

    // Outbox: the send half.
    const outbox = await fetch(`${BADDY_URL}/api/outbox`, {
      headers: { Authorization: `Bearer ${INGEST_SECRET}` },
    }).catch(() => null);
    if (outbox) {
      const body = outbox.ok ? await outbox.json().catch(() => null) : null;
      check(
        "outbox readable",
        outbox.ok,
        outbox.ok
          ? `${body?.messages?.length ?? 0} message(s) waiting to post`
          : `HTTP ${outbox.status} — the bot cannot fetch messages to post`
      );
    }
  }
}

// --- verdict --------------------------------------------------------------
const fatals = results.filter((r) => !r.ok && r.fatal);
const warns = results.filter((r) => !r.ok && !r.fatal);
console.log("─".repeat(40));
if (fatals.length > 0) {
  console.log(`✗ ${fatals.length} blocking problem(s): ${fatals.map((f) => f.name).join(", ")}`);
  console.log("  The bridge will not work until these are fixed.\n");
  process.exit(1);
}
if (warns.length > 0) {
  console.log(`! Ready, with ${warns.length} thing(s) still to do: ${warns.map((w) => w.name).join(", ")}\n`);
  process.exit(0);
}
console.log("✓ All checks passed — safe to start the service.\n");

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
