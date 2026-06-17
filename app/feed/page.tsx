"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, History, Home as HomeIcon, MessageCircle, Swords, Target, Users } from "lucide-react";
import { apiGet, apiSend } from "@/lib/api";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import Skeleton from "../components/ui/Skeleton";
import EmptyState from "../components/ui/EmptyState";
import Avatar from "../components/ui/Avatar";
import { useToast } from "../components/ui/ToastProvider";
import AppHeaderBg from "../components/AppHeaderBg";

type Comment = { id: number; content: string; author: string; createdAt: string };
type Post = { id: number; content: string; author: string; createdAt: string; comments: Comment[] };
type Player = { id: number; name: string };

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(dateStr).toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });
}

const NAV_TILES = [
  { href: "/", label: "Home", icon: HomeIcon },
  { href: "/players", label: "Players", icon: Users },
  { href: "/stats", label: "Stats", icon: Target },
  { href: "/history", label: "History", icon: History },
  { href: "/matches", label: "Matches", icon: Swords },
];

export default function FeedPage() {
  const { showToast } = useToast();
  const [posts, setPosts] = useState<Post[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [author, setAuthor] = useState("");
  const [content, setContent] = useState("");
  const [posting, setPosting] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [commentText, setCommentText] = useState<Record<number, string>>({});
  const [commenting, setCommenting] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem("feedAuthor") : null;
    if (saved) setAuthor(saved);

    (async () => {
      const [p, pl] = await Promise.all([
        apiGet<Post[]>("/api/posts"),
        apiGet<Player[]>("/api/players"),
      ]);
      if (!p.data || !pl.data) {
        setError(true);
        setLoading(false);
        return;
      }
      setPosts(p.data);
      setPlayers(pl.data);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (author) window.localStorage.setItem("feedAuthor", author);
  }, [author]);

  async function submitPost() {
    if (!content.trim() || !author.trim()) return;
    setPosting(true);
    const { data: post, error: err } = await apiSend<Post>("/api/posts", "POST", {
      content: content.trim(),
      author: author.trim(),
    });
    if (!post) {
      showToast(err ?? "Couldn't post", "danger");
      setPosting(false);
      return;
    }
    setPosts((prev) => [post, ...prev]);
    setContent("");
    setPosting(false);
  }

  async function submitComment(postId: number) {
    const text = commentText[postId]?.trim();
    if (!text || !author.trim()) return;
    setCommenting(postId);
    const { data: comment, error: err } = await apiSend<Comment>(`/api/posts/${postId}/comments`, "POST", {
      content: text,
      author: author.trim(),
    });
    if (!comment) {
      showToast(err ?? "Couldn't add comment", "danger");
      setCommenting(null);
      return;
    }
    setPosts((prev) => prev.map((p) =>
      p.id === postId ? { ...p, comments: [...p.comments, comment] } : p
    ));
    setCommentText((prev) => ({ ...prev, [postId]: "" }));
    setCommenting(null);
  }

  return (
    <div className="app-bg">
      {/* Header */}
      <div className="relative overflow-hidden app-header px-5 pt-12 pb-8">
        <AppHeaderBg />
        <div className="relative flex items-start gap-3">
          <Link href="/" aria-label="Back" className="mt-1 w-9 h-9 flex items-center justify-center rounded-2xl bg-white/20 hover:bg-white/30 transition-colors">
            <ArrowLeft size={18} strokeWidth={2.5} />
          </Link>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">Feed</h1>
            <p className="app-header-subtle text-sm mt-0.5">Share your thoughts</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-5 max-w-lg mx-auto space-y-4">

        {/* Nav */}
        <div className="grid grid-cols-5 gap-2">
          {NAV_TILES.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-label={label}
              className="group bg-surface-raised rounded-3xl shadow-sm border border-border p-3 flex flex-col items-center gap-1.5 hover:bg-surface-hover transition-all active:scale-95"
            >
              <div className="w-10 h-10 bg-gradient-to-br from-accent to-accent-2 rounded-2xl flex items-center justify-center shadow-md">
                <Icon size={18} className="text-white" />
              </div>
              <span className="text-[10px] font-bold text-muted">{label}</span>
            </Link>
          ))}
        </div>

        {/* New post */}
        <Card className="space-y-3">
          {/* Author selector */}
          <div className="flex items-center gap-3">
            {author ? <Avatar name={author} size="md" /> : (
              <div className="w-10 h-10 rounded-2xl bg-surface-hover flex items-center justify-center text-faint text-lg shrink-0">👤</div>
            )}
            <select
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              aria-label="Select your name"
              className="flex-1 bg-surface-hover border-2 border-transparent focus:border-accent rounded-2xl px-4 py-2.5 text-sm font-medium text-text focus:outline-none transition-colors"
            >
              <option value="">Who are you?</option>
              {players.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
            </select>
          </div>
          <textarea
            ref={textareaRef}
            placeholder="What's on your mind? Venue thoughts, highlights, complaints…"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
            className="w-full bg-surface-hover border-2 border-transparent focus:border-accent rounded-2xl px-4 py-3 text-sm font-medium text-text placeholder-faint focus:outline-none transition-colors resize-none"
          />
          <Button
            onClick={submitPost}
            disabled={!content.trim() || !author.trim()}
            loading={posting}
            className="w-full"
          >
            {posting ? "Posting..." : "Post →"}
          </Button>
        </Card>

        {/* Feed */}
        {loading ? (
          <div className="space-y-3">
            <Card><Skeleton className="h-20 w-full" /></Card>
            <Card><Skeleton className="h-20 w-full" /></Card>
          </div>
        ) : error ? (
          <Card>
            <EmptyState icon={<MessageCircle size={36} />} title="Couldn't load the feed" subtitle="Something went wrong. Try refreshing." />
          </Card>
        ) : posts.length === 0 ? (
          <Card className="border-2 border-dashed border-border bg-transparent shadow-none">
            <EmptyState icon={<MessageCircle size={36} />} title="No posts yet — be the first!" />
          </Card>
        ) : (
          posts.map((post) => {
            const isOpen = expandedId === post.id;
            return (
              <Card key={post.id} padding="none" className="overflow-hidden">
                {/* Post */}
                <div className="p-5">
                  <div className="flex items-start gap-3">
                    <Avatar name={post.author} size="md" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-text">{post.author}</span>
                        <span className="text-xs text-faint">{timeAgo(post.createdAt)}</span>
                      </div>
                      <p className="text-sm text-muted mt-1 leading-relaxed">{post.content}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setExpandedId(isOpen ? null : post.id)}
                    className="mt-3 ml-11 text-xs font-semibold text-accent hover:text-accent-2 transition-colors"
                  >
                    {post.comments.length > 0
                      ? `${post.comments.length} comment${post.comments.length > 1 ? "s" : ""} ${isOpen ? "▲" : "▼"}`
                      : isOpen ? "Hide" : "Reply"}
                  </button>
                </div>

                {/* Comments */}
                {isOpen && (
                  <div className="border-t border-border bg-surface/50 px-5 pb-4 pt-3 space-y-3">
                    {post.comments.map((c) => (
                      <div key={c.id} className="flex items-start gap-2.5">
                        <Avatar name={c.author} size="sm" />
                        <div className="flex-1 bg-surface-hover rounded-2xl px-3 py-2 border border-border">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-text">{c.author}</span>
                            <span className="text-xs text-faint">{timeAgo(c.createdAt)}</span>
                          </div>
                          <p className="text-xs text-muted mt-0.5 leading-relaxed">{c.content}</p>
                        </div>
                      </div>
                    ))}

                    {/* Comment input */}
                    <div className="flex gap-2 pt-1">
                      {author && <Avatar name={author} size="sm" />}
                      <div className="flex-1 flex gap-2">
                        <input
                          type="text"
                          placeholder={author ? "Write a comment…" : "Select your name above first"}
                          value={commentText[post.id] ?? ""}
                          onChange={(e) => setCommentText((prev) => ({ ...prev, [post.id]: e.target.value }))}
                          onKeyDown={(e) => e.key === "Enter" && submitComment(post.id)}
                          disabled={!author}
                          aria-label="Write a comment"
                          className="flex-1 bg-surface-hover border-2 border-transparent focus:border-accent rounded-2xl px-3 py-2 text-xs font-medium text-text placeholder-faint focus:outline-none transition-colors disabled:opacity-50"
                        />
                        <Button
                          size="sm"
                          onClick={() => submitComment(post.id)}
                          disabled={!author || !commentText[post.id]?.trim() || commenting === post.id}
                          loading={commenting === post.id}
                          aria-label="Send comment"
                        >
                          {commenting === post.id ? "" : "Send"}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
