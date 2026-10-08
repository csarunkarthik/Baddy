// Parse a WhatsApp "Export chat → Without media" .txt into messages.
//
// Handles both export formats:
//   iOS      [08/05/26, 7:12:03 PM] Name: text
//   Android  08/05/26, 7:12 pm - Name: text
// Dates are DD/MM/YY in the phone's local time, which for this group is IST.
//
// The export is private (the repo is public) — it lives in /private/ and is
// never committed. This module only reads it.

import fs from "node:fs";

export type ExportMessage = {
  /** Synthetic, stable id: line number of the message's first line. */
  id: string;
  sender: string;
  /** UTC instant, from the IST wall-clock time in the export. */
  sentAt: Date;
  text: string;
};

const IOS = /^\[(\d{1,2})\/(\d{1,2})\/(\d{2,4}), (\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)\] ([^:]+?):\s?([\s\S]*)$/i;
const ANDROID = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4}), (\d{1,2}):(\d{2})\s*([ap]m)? - ([^:]+?):\s?([\s\S]*)$/i;

/** System lines and media placeholders — never a booking. */
const NOISE =
  /^(sticker|image|video|audio|GIF|document|Contact card) omitted$|<Media omitted>|^This message was deleted\.?$|^You deleted this message\.?$|^POLL:|^OPTION:|^<This message was edited>$/i;

/** Directional marks WhatsApp sprinkles through exports. */
const MARKS = /[\u200e\u200f\u202a-\u202e]/g;

function toUtc(d: string, m: string, y: string, h: string, min: string, s: string | undefined, ampm: string | undefined): Date {
  let hour = Number(h);
  if (ampm) {
    const pm = ampm.toLowerCase() === "pm";
    if (hour === 12) hour = pm ? 12 : 0;
    else if (pm) hour += 12;
  }
  const year = y.length === 2 ? 2000 + Number(y) : Number(y);
  // IST is a fixed +05:30, so subtracting 330 minutes is exact.
  return new Date(Date.UTC(year, Number(m) - 1, Number(d), hour, Number(min) - 330, Number(s ?? 0)));
}

export function parseExport(raw: string): ExportMessage[] {
  const out: ExportMessage[] = [];
  let current: ExportMessage | null = null;

  raw.split(/\r?\n/).forEach((rawLine, i) => {
    const line = rawLine.replace(MARKS, "");
    const ios = IOS.exec(line);
    const android = ios ? null : ANDROID.exec(line);

    if (ios || android) {
      if (current) out.push(current);
      const [d, m, y, h, min, s, ampm, sender, text] = ios
        ? [ios[1], ios[2], ios[3], ios[4], ios[5], ios[6], ios[7], ios[8], ios[9]]
        : [android![1], android![2], android![3], android![4], android![5], undefined, android![6], android![7], android![8]];
      current = { id: `L${i + 1}`, sender: sender.replace(/^~\s*/, "").trim(), sentAt: toUtc(d, m, y, h, min, s, ampm), text };
    } else if (current) {
      // Continuation of a multi-line message.
      current.text += `\n${line}`;
    }
  });
  if (current) out.push(current);

  return out
    .map((msg) => ({ ...msg, text: msg.text.trim() }))
    .filter((msg) => msg.text && !NOISE.test(msg.text));
}

export function readExport(path = "private/whatsapp-export.txt"): ExportMessage[] {
  if (!fs.existsSync(path)) {
    throw new Error(`No export at ${path}. Export the group (Without media) and unzip _chat.txt there.`);
  }
  return parseExport(fs.readFileSync(path, "utf8"));
}
