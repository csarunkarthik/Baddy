import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const MAX_POST_LENGTH = 4000;

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
  const trimmedContent = typeof content === "string" ? content.trim() : "";
  const trimmedAuthor = typeof author === "string" ? author.trim() : "";
  if (!trimmedContent || !trimmedAuthor) {
    return NextResponse.json({ error: "Content and author required" }, { status: 400 });
  }
  if (trimmedContent.length > MAX_POST_LENGTH) {
    return NextResponse.json(
      { error: `Post must be ${MAX_POST_LENGTH} characters or fewer` },
      { status: 400 }
    );
  }

  const player = await prisma.player.findUnique({ where: { name: trimmedAuthor } });
  if (!player) {
    return NextResponse.json({ error: "Author must be an existing player" }, { status: 400 });
  }

  const post = await prisma.post.create({
    data: { content: trimmedContent, author: trimmedAuthor },
    include: { comments: true },
  });
  return NextResponse.json(post);
}
