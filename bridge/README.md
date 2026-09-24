# Baddy WhatsApp bridge

Reads your badminton group on WhatsApp, turns "booked TT Sports friday 7pm"
into a real booking, and posts the reminders back into the same group. No app
to open, no forms, no extra step for anyone.

## Why this exists as a separate service

The official WhatsApp Cloud API (the one the Vault project uses) **never
receives group messages**. It only delivers direct messages to a business
number. Reading a group requires acting as a real WhatsApp client, which means
holding a websocket open permanently — impossible on Vercel, hence a small
always-on VM.

Two consequences worth understanding before you run this:

1. **It logs in as a real WhatsApp account** via Linked Devices, the same
   mechanism as WhatsApp Web. It uses [Baileys](https://github.com/WhiskeySockets/Baileys),
   which is not endorsed by WhatsApp. Automating an account is against their
   terms and accounts can be banned, which is why this runs on a secondary
   number (step 1) and rations every message it sends (see below).
2. **It only needs to be *in* the group**, not the one posting. Whoever books
   the court posts exactly as they do today; the bridge sees every message in
   that group regardless of sender.

## What it sends, and how it's rationed

The bot posts four kinds of message, all into one group:

| | When |
|---|---|
| Booking confirmation | Right after it detects a booking — also a parse receipt, so a misread date is caught immediately |
| Match reminder | `REMINDER_LEAD_HOURS` (default 3) before start |
| Empty-week nudge | Thursday 9am IST, if nothing is booked for the rest of the week |
| Weekly stats | Monday 9am IST — sessions, streaks, turnout |

That is roughly **2–3 messages a week**. Sending is what WhatsApp's anti-spam
actually looks for (reading is close to invisible by comparison), so every send
is deliberately constrained:

- **one destination only** — `GROUP_ID`, never a DM, never another group; the
  bridge refuses anything else even if the server asks
- **`MAX_SENDS_PER_DAY`** hard ceiling (default 10), counted in-process
- **30s minimum gap** between posts, plus random jitter so the timing doesn't
  tick like a metronome
- **no @-mentions** — a strong spam signal, and unnecessary here
- still **never marks messages read** (your unread badges stay accurate) and
  never claims presence (`markOnlineOnConnect: false`), so the phone keeps
  owning the account's online status
- `syncFullHistory: false`, so linking doesn't pull years of chat
- reconnects with exponential backoff, capped at 5 minutes — reconnect storms
  are a classic automation signal

### How sending works

The VM has no inbound connectivity, so the server can't call the bridge. It
queues messages in an outbox table and the bridge polls every 60 seconds. That
also makes sends durable: if the bridge is offline when a reminder comes due,
the row waits and goes out on reconnect rather than being lost.

### It must not read its own output

The bot writes to the group it reads. Its own reminder — "Game in 3 hours —
7pm at TT Sports" — contains a venue and a time, so the parser would happily
turn it into a phantom booking. Every id it posts is remembered, and the server
returns recently-sent ids on each poll so a restart can't lose track.

## Privacy

A regex gate (`gate.mjs`) runs **on the VM, before anything is sent anywhere**.
Only messages that mention a court/booking keyword *and* a time or day leave the
machine. Ordinary group conversation is never uploaded, never parsed and never
stored. Forwarded messages are kept on the server in `ProcessedMessage` so a
misparse can be diagnosed.

## Setup

### Before you start

You need:

- a WhatsApp account that is already in the badminton group, with a free
  linked-device slot (step 1)
- the Baddy app deployed, with `INGEST_SECRET` set in its Vercel environment
  (step 2)
- a card for Oracle's identity check (not charged)

Allow about 40 minutes end to end.

### 1. Choose and prepare the WhatsApp account

The bridge logs in as a real WhatsApp account via Linked Devices. Two viable
choices, and the trade is not the one people assume:

| | Personal number | Spare SIM |
|---|---|---|
| Likelihood of a ban | **Lower** — an aged account with daily human traffic is the least suspicious profile there is | Higher — new accounts are the most heavily scrutinised |
| Cost if banned | High: that account, all its chats and groups | Low: a throwaway number |
| Setup delay | None | ~1 week of warm-up before linking |
| Ongoing upkeep | None | The SIM's phone must come online every ~14 days or the link drops |
| Messages appear from | You, by name | "Baddy Bot" |

**This deployment uses the personal number.** Nothing to prepare: the account
is already in the group and already has years of history, which is exactly what
makes it unremarkable to WhatsApp's abuse detection.

Two things to check before linking:

- **A free linked-device slot.** WhatsApp allows 4. Check **Settings → Linked
  devices**; if you already run WhatsApp Web and Desktop you may be at the
  limit.
- **Automated posts will carry your name.** The group sees reminders as coming
  from you, not from a bot. Consider prefixing them (see `lib/messages.ts`) so
  nobody replies to you expecting a human.

<details>
<summary>If you'd rather use a spare SIM</summary>

Register WhatsApp on it (the SIM must be in a phone for the SMS code — or
install WhatsApp Business alongside your normal app on the same handset), give
it a profile photo and a name like "Baddy Bot", have an admin add it to the
group, and then **leave it about a week before linking the bridge**. A
brand-new account that starts a linked-device session on day one looks exactly
like automation. Keep the SIM active and the phone online at least fortnightly.

</details>

### 2. Set the ingest secret on the Baddy side

The bridge and the app authenticate to each other with a shared secret. It must
exist **in Vercel**, not just in your local `.env`, or every forwarded message
comes back `401`.

1. Copy `INGEST_SECRET` from the Baddy project's `.env`.
2. Vercel → your Baddy project → **Settings → Environment Variables** → add
   `INGEST_SECRET` with that value, Production scope.
3. Redeploy (env changes don't apply to existing deployments).

Check it took, from your laptop. Two calls, because the first alone can't tell
a correct secret from a missing one — ingest returns `401` in both cases:

```bash
URL=https://<your-baddy-url>/api/ingest/whatsapp

# 1. No credentials → must be rejected.
curl -s -o /dev/null -w 'no auth:   %{http_code}\n' -X POST "$URL"

# 2. With the secret → 400 (the body is empty), which only a MATCHING secret
#    can produce. A second 401 here means Vercel's value is wrong or stale.
curl -s -o /dev/null -w 'with auth: %{http_code}\n' -X POST "$URL" \
  -H "Authorization: Bearer <INGEST_SECRET>" \
  -H 'Content-Type: application/json' -d '{}'
```

Expect `no auth: 401` then `with auth: 400`. A `404` on either means the app
isn't deployed yet.

### 3. Pick somewhere to run it

Anything that can stay online and run Node 22 works. The bridge reads
`LOOKBACK_HOURS` (default 6) of recent messages on startup, so a host that
restarts or sleeps briefly catches up rather than losing bookings — but
anything offline longer than that window misses what was posted meanwhile.

| | Cost | Card needed | Reliability |
|---|---|---|---|
| Oracle Cloud Always Free | Free forever | **Yes** — identity check, ~₹100 auth, reversed | Best: always on, survives reboots |
| An old Android phone (Termux) | Free | No | Very good if left plugged in on wifi |
| Your own Mac / a Pi | Free | No | Good while awake; needs `caffeinate` on a laptop |

Oracle is the most reliable and costs nothing, but it does require a card for
verification (you are not charged unless you upgrade to Pay As You Go). If
you'd rather not, the other two are genuinely fine for a group of friends —
just raise `LOOKBACK_HOURS` if the host is off for long stretches.

<details>
<summary>Oracle Cloud setup</summary>

1. Sign up at <https://signup.cloud.oracle.com>, pick a home region near you
   (Mumbai/Hyderabad for India). **The home region cannot be changed later.**
2. **Compute → Instances → Create instance.**
3. Shape: **VM.Standard.E2.1.Micro** (AMD, 1 GB) — it must say *Always Free
   eligible*. The ARM `A1.Flex` shape has more RAM but is frequently
   capacity-blocked in Indian regions.
4. Image: **Canonical Ubuntu 24.04**.
5. Save the SSH private key it offers — you cannot download it again.
6. Create, then note the public IP.

No inbound ports are needed: the bridge only makes outbound connections, so
leave the default security list alone.

```bash
chmod 600 /path/to/key        # ssh refuses keys with loose permissions
ssh -i /path/to/key ubuntu@<public-ip>
```

> **Heads-up:** Oracle may reclaim Always Free compute instances that sit idle,
> and this bridge is idle by nature. If that happens the Book tab will say
> auto-detection is offline. Upgrading to Pay As You Go (the Always Free
> resources stay free) avoids the reclamation policy.

</details>

<details>
<summary>Running it on a Mac instead</summary>

```bash
cd ~/baddy/bridge && npm install
cp .env.example .env    # BADDY_URL = your deployed https URL
npm run doctor
caffeinate -s npm start  # -s stops the Mac sleeping while this runs
```

For it to survive logout and reboots, wrap it in a LaunchAgent rather than a
terminal tab. Raise `LOOKBACK_HOURS` if the machine is regularly off overnight.

</details>

### 4. Install it

On the host (commands below assume Ubuntu; on a Mac use `brew install node`):

```bash
# Node 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs git
node -v            # expect v22.x

git clone https://github.com/csarunkarthik/Baddy.git
cd Baddy/bridge
npm install

cp .env.example .env
nano .env          # set BADDY_URL and INGEST_SECRET; leave GROUP_ID empty for now
```

`BADDY_URL` is your deployed app (`https://…`), not localhost — the host is a
different machine from the one serving the app.

Then check everything before going further:

```bash
npm run doctor
```

It verifies the app is reachable, the ingest route is deployed, and — the check
that matters most — that `INGEST_SECRET` actually matches the server. A plain
`401` can't distinguish a wrong secret from a missing one, so `doctor` sends an
authenticated empty body and expects a `400`.

A 1 GB box has no swap by default and `npm install` is the most
memory-hungry moment of the whole setup. Cheap insurance:

```bash
sudo fallocate -l 1G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

The VM's timezone doesn't matter. Every date and time decision happens
server-side in IST; the bridge only passes text along.

### 5. Link the WhatsApp account

```bash
npm run login
```

A QR code prints in the terminal. On your phone: **WhatsApp → Settings →
Linked devices → Link a device**, and scan it. (If you chose a spare SIM
instead, scan from *that* account, not your personal one.)

It confirms the number it paired as and exits. Credentials are saved to
`bridge/auth/` — a one-time step. Keep that directory, and never commit it:
it is effectively a login token.

### 6. Find the group id

```bash
npm run list-groups
```

Copy the `GROUP_ID=...` line for your badminton group into `.env`. If you
change it later, restart the service for it to take effect.

### 7. Run it as a service

```bash
sudo cp baddy-bridge.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now baddy-bridge
systemctl status baddy-bridge          # should say "active (running)"
journalctl -u baddy-bridge -f          # live logs
```

`Restart=always` brings it back after a crash, `enable` after a reboot.

### 8. Confirm it actually works

Don't assume — check all three ends:

1. **The app knows the bridge is alive.** Open the Book tab. It should show
   "Auto-detect on". If it warns that detection is offline, the heartbeat isn't
   arriving — check `journalctl` and `BADDY_URL`.
2. **A real message is picked up.** Post a genuine-looking booking in the
   group, e.g. *"Booked TT Sports tomorrow 7pm"*. Within a second or two the
   logs should show `→ candidate from …` followed by `created`.
3. **The bot confirms in the group.** Within a minute it posts "Got it —
   TT Sports…". That round trip proves both directions work.
4. **The booking appears in the app.** The Book tab lists the session with an
   **auto** chip and the original message quoted underneath. It's a read-only
   view — bookings are managed entirely from WhatsApp.

If step 2 logs nothing at all, `GROUP_ID` is wrong. If it logs a candidate but
nothing is created, the response text says why — usually a partial parse
(missing venue, date or time), which is the intended conservative behaviour.

## Updating the bridge

After any change to this directory on `main`:

```bash
cd ~/Baddy && git pull
cd bridge && npm install          # only if package.json changed
sudo systemctl restart baddy-bridge
journalctl -u baddy-bridge -n 30
```

`auth/` and `.env` are gitignored, so a pull never disturbs the session or your
settings — no re-pairing, no re-scanning.

## Testing without WhatsApp

`simulate.mjs` posts fake group messages straight at the ingest endpoint, so you
can see how your group's real phrasing parses before trusting any of it. This is
worth doing **before** the VM exists — copy a dozen genuine messages out of the
group and check what each becomes:

```bash
npm run simulate                              # built-in sample set
npm run simulate -- "booked TT 7pm fri"       # one message
npm run simulate -- --cleanup                 # delete what it created
```

It reads `BADDY_URL` from `.env`: point it at `http://localhost:3000` to test a
local dev server from your laptop, or at the deployed URL to test production.

The parser's own unit tests (day references, the message gate) run from the repo
root with `npm test`.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Anything at all, before you debug further | Run `npm run doctor` — it catches most misconfiguration in one go. |
| A booking posted while the host was down was never picked up | It was older than `LOOKBACK_HOURS` on restart. Raise it, or use a host that stays online. |
| "Logged out of WhatsApp" then exit | Session revoked from the phone. `rm -rf auth && npm run login`. |
| Nothing detected, logs quiet | `GROUP_ID` wrong or unset. Re-run `npm run list-groups`. |
| "ingest HTTP 401" | `INGEST_SECRET` doesn't match the Baddy env. |
| Book tab says auto-detection offline | The bridge isn't reaching the heartbeat endpoint — check `journalctl` and `BADDY_URL`. |
| Reminders detected but never posted | Check the logs for `[outbox]`. A `401` means `INGEST_SECRET` mismatch; "daily send cap reached" means `MAX_SENDS_PER_DAY` is too low. |
| A message was posted twice | Only possible if an ACK failed after a successful send — the log says `ACK FAILED ... may repost`. Everything else is guarded by the unique `dedupeKey`. |
| Bot replied to a cancelled session | Shouldn't happen: cancelling suppresses the queued reminder even if it was already waiting. Report the `OutboxMessage` rows. |
| Bookings detected twice | Shouldn't be possible: `msgId` is deduped in memory and uniquely indexed server-side. Report the `ProcessedMessage` rows if you see it. |
| Messages that should be bookings are ignored | Run `npm run simulate -- "<the message>"` to see the verdict, then loosen `gate.mjs` / tune the prompt in `lib/parse-booking.ts`. Keep both gate copies in sync. |
| `ingest HTTP 404` | `INGEST_SECRET` isn't set in Vercel, or the app isn't deployed. See step 2. |
| Candidate logged, but no booking created | The parse was incomplete (venue, date or time missing) or below the confidence floor. The logged response says which — this is deliberate: a half-parsed booking is worse than none. |
| `npm install` killed on the VM | Out of memory. Add the swap file from step 4 and retry. |
| Service won't start after a reboot | `sudo systemctl enable baddy-bridge` was skipped, or the repo path differs from the one in `baddy-bridge.service`. |
| VM unreachable / bridge gone entirely | Oracle may have reclaimed an idle Always Free instance (step 3). |

## If the number gets banned

Because this deployment links a **personal** account, a ban costs that account:
every chat and group on it. Your message history stays on the phone, but the
account is unusable until restored.

What to do, in order:

1. **Stop the bridge immediately** — `sudo systemctl stop baddy-bridge`.
   Continuing activity makes a temporary block more likely to become permanent.
2. WhatsApp usually issues a **temporary block first** (hours to days) rather
   than a permanent ban. Wait it out; don't keep retrying.
3. **Appeal in-app**: Settings → Help → Contact us. First offences are commonly
   reversed.
4. Don't re-link the bridge until you've decided whether to continue — and if
   you do, move it to a spare SIM (see the collapsed section in step 1).
   Nothing else in the setup changes: `rm -rf auth`, `npm run login`, done.

The odds are in your favour — one small group, a handful of messages a week, an
aged account, and the send rationing described above — but this is the outcome
you accepted when you chose the personal number, so it's worth knowing the
recovery path before you need it.
