import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { content, author } = await req.json();
  if (!content?.trim() || !author?.trim()) {
    return NextResponse.json({ error: "Content and author required" }, { status: 400 });
  }
  const comment = await prisma.comment.create({
    data: { postId: parseInt(id), content: content.trim(), author: author.trim() },
  });
  return NextResponse.json(comment);
}
