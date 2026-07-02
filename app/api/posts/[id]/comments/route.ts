import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseIntParam } from "@/lib/params";

const MAX_COMMENT_LENGTH = 2000;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const postId = parseIntParam(id);
  if (postId === null) {
    return NextResponse.json({ error: "Invalid post id" }, { status: 400 });
  }
  const { content, author } = await req.json();
  const trimmedContent = typeof content === "string" ? content.trim() : "";
  const trimmedAuthor = typeof author === "string" ? author.trim() : "";
  if (!trimmedContent || !trimmedAuthor) {
    return NextResponse.json({ error: "Content and author required" }, { status: 400 });
  }
  if (trimmedContent.length > MAX_COMMENT_LENGTH) {
    return NextResponse.json(
      { error: `Comment must be ${MAX_COMMENT_LENGTH} characters or fewer` },
      { status: 400 }
    );
  }

  const player = await prisma.player.findUnique({ where: { name: trimmedAuthor } });
  if (!player) {
    return NextResponse.json({ error: "Author must be an existing player" }, { status: 400 });
  }

  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  const comment = await prisma.comment.create({
    data: { postId, content: trimmedContent, author: trimmedAuthor },
  });
  return NextResponse.json(comment);
}
