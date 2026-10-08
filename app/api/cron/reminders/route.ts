import { NextResponse } from "next/server";
import { reminderTick } from "@/lib/reminders";

// Vercel's daily cron entry point for the reminder tick. The bridge's outbox
// poll runs the same tick every minute; this is the backstop for when the
// bridge is down. See lib/reminders.ts.

export const dynamic = "force-dynamic";

/**
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET` automatically. A
 * `?secret=` query param is also accepted so a third-party scheduler that
 * can't set headers still works. With no CRON_SECRET set the endpoint is open
 * — fine for local dev; the deploy notes say to set it in production.
 */
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  if (req.headers.get("authorization") === `Bearer ${secret}`) return true;
  return new URL(req.url).searchParams.get("secret") === secret;
}

async function run(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await reminderTick());
}

export async function GET(req: Request) {
  return run(req);
}

export async function POST(req: Request) {
  return run(req);
}
