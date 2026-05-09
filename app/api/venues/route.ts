import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const rows = await prisma.session.groupBy({
    by: ["venue"],
    where: { venue: { not: "" } },
    _count: { venue: true },
    orderBy: { _count: { venue: "desc" } },
  });
  return NextResponse.json(rows.map((r) => ({ venue: r.venue, count: r._count.venue })));
}
