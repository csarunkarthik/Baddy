import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const posts = await prisma.post.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      comments: {
        orderBy: { createdAt: "asc" },
      },
    },
  });
  return NextResponse.json(posts);
}

export async function POST(req: Request) {
  const { content, author } = await req.json();
  if (!content?.trim() || !author?.trim()) {
    return NextResponse.json({ error: "Content and author required" }, { status: 400 });
  }
  const post = await prisma.post.create({
    data: { content: content.trim(), author: author.trim() },
    include: { comments: true },
  });
  return NextResponse.json(post);
}
