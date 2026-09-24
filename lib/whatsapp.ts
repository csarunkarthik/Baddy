// WhatsApp Cloud API sender — same Meta app/number already wired up for Vault
// (see vault/app/api/whatsapp/webhook/route.ts). Reusing it here means no new
// Meta setup: copy WHATSAPP_TOKEN + WHATSAPP_PHONE_ID into this project's env
// and sends start working.
//
// THREE HARD LIMITS OF THE CLOUD API, worth knowing before trusting this path:
//
//  1. It cannot post to a WhatsApp *group*. The Cloud API only addresses
//     individual phone numbers. Group announcements stay a human tapping the
//     wa.me share button in the UI; this module handles 1:1 reminders.
//  2. Business-initiated messages outside the 24-hour customer-service window
//     must use a pre-approved *template*. A reminder fired 3h before a game is
//     always business-initiated, so `sendTemplate` is the real path and
//     `sendText` only lands if that person messaged the number recently.
//  3. While the Meta app is in development mode, only numbers added as test
//     recipients receive anything.
//
// Every function no-ops (rather than throwing) when env is missing, so the
// reminder cron degrades to push-only instead of failing.

const GRAPH = "https://graph.facebook.com/v23.0";

export function whatsappConfigured(): boolean {
  return Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID);
}

/** Digits only, country code included. Returns null for anything unusable. */
export function normalizePhone(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return null;
  // Bare 10-digit Indian mobile → prefix 91.
  return digits.length === 10 ? `91${digits}` : digits;
}

export type SendOutcome = { to: string; ok: boolean; error?: string };

/**
 * Free-form text. Only delivered inside the 24h service window — outside it
 * Meta returns error 131047 and nothing reaches the recipient.
 */
export async function sendText(to: string, body: string): Promise<SendOutcome> {
  return post(to, { messaging_product: "whatsapp", to, type: "text", text: { body } });
}

/**
 * A pre-approved template, the only reliable way to reach someone cold.
 * `params` fill the template's {{1}}, {{2}}, … body variables in order.
 */
export async function sendTemplate(
  to: string,
  name: string,
  params: string[],
  language = "en"
): Promise<SendOutcome> {
  return post(to, {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name,
      language: { code: language },
      components:
        params.length > 0
          ? [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }]
          : [],
    },
  });
}

async function post(to: string, payload: unknown): Promise<SendOutcome> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  if (!token || !phoneId) {
    return { to, ok: false, error: "WhatsApp env not configured" };
  }
  try {
    const res = await fetch(`${GRAPH}/${phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error("[whatsapp] send failed", res.status, text.slice(0, 300));
      return { to, ok: false, error: `HTTP ${res.status}` };
    }
    return { to, ok: true };
  } catch (err) {
    console.error("[whatsapp] network error", err);
    return { to, ok: false, error: "Network error" };
  }
}
