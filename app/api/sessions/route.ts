import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function parseDate(dateStr: string) {
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  return d;
}

// GET session for a given date (?date=YYYY-MM-DD), defaults to today
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const dateParam = searchParams.get("date");
  const date = dateParam ? parseDate(dateParam) : (() => { const d = new Date(); d.setHours(0,0,0,0); return d; })();

  const session = await prisma.session.findUnique({
    where: { date },
    include: { attendance: { include: { player: true } } },
  });

  return NextResponse.json(session);
}

// POST — create or update a session for a given date
export async function POST(req: Request) {
  const { venue, date: dateParam } = await req.json();
  const date = dateParam ? parseDate(dateParam) : (() => { const d = new Date(); d.setHours(0,0,0,0); return d; })();

  const session = await prisma.session.upsert({
    where: { date },
    update: { venue },
    create: { date, venue },
    include: { attendance: { include: { player: true } } },
  });

  return NextResponse.json(session);
}
