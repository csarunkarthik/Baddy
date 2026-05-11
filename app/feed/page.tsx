"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type Comment = { id: number; content: string; author: string; createdAt: string };
type Post = { id: number; content: string; author: string; createdAt: string; comments: Comment[] };

const COLORS = ["bg-emerald-500","bg-blue-500","bg-purple-500","bg-orange-500","bg-pink-500","bg-teal-500","bg-indigo-500","bg-rose-500"];
function avatarColor(name: string) {
  let hash = 0;
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) % COLORS.length;
  return COLORS[hash];
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(dateStr).toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });
}

function Avatar({ name, size = "sm" }: { name: string; size?: "sm" | "md" }) {
  const sz = size === "md" ? "w-10 h-10 text-base" : "w-8 h-8 text-sm";
  return (
    <div className={`${sz} ${avatarColor(name)} rounded-2xl flex items-center justify-center font-bold text-white shrink-0`}>
      {name[0].toUpperCase()}
    </div>
  );
}

export default function FeedPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [players, setPlayers] = useState<{ id: number; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [author, setAuthor] = useState("");
  const [content, setContent] = useState("");
  const [posting, setPosting] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [commentText, setCommentText] = useState<Record<number, string>>({});
  const [commenting, setCommenting] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    Promise.all([fetch("/api/posts"), fetch("/api/players")])
      .then(([p, pl]) => Promise.all([p.json(), pl.json()]))
      .then(([postsData, playersData]) => {
        setPosts(postsData);
        setPlayers(playersData);
        setLoading(false);
      });
  }, []);

  async function submitPost() {
    if (!content.trim() || !author.trim()) return;
    setPosting(true);
    const res = await fetch("/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: content.trim(), author: author.trim() }),
    });
    const post = await res.json();
    setPosts((prev) => [post, ...prev]);
    setContent("");
    setPosting(false);
  }

  async function submitComment(postId: number) {
    const text = commentText[postId]?.trim();
    if (!text || !author.trim()) return;
    setCommenting(postId);
    const res = await fetch(`/api/posts/${postId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: text, author: author.trim() }),
    });
    const comment = await res.json();
    setPosts((prev) => prev.map((p) =>
      p.id === postId ? { ...p, comments: [...p.comments, comment] } : p
    ));
    setCommentText((prev) => ({ ...prev, [postId]: "" }));
    setCommenting(null);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-violet-50 to-purple-50">
      {/* Header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-violet-500 via-purple-500 to-fuchsia-600 text-white px-5 pt-12 pb-8">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-4 right-8 text-8xl">💬</div>
          <div className="absolute -bottom-4 -left-4 w-32 h-32 rounded-full bg-white" />
        </div>
        <div className="relative flex items-start gap-3">
          <Link href="/" className="mt-1 w-9 h-9 flex items-center justify-center rounded-2xl bg-white/20 hover:bg-white/30 transition-colors font-bold">←</Link>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">Feed</h1>
            <p className="text-violet-100 text-sm mt-0.5">Share your thoughts</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-5 max-w-lg mx-auto space-y-4">

        {/* Nav */}
        <div className="grid grid-cols-4 gap-3">
          <Link href="/" className="group bg-white rounded-3xl shadow-sm border border-gray-100 p-4 flex flex-col items-center gap-2 hover:shadow-md transition-all active:scale-95">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center text-lg shadow-md shadow-emerald-200">🏸</div>
            <span className="text-xs font-bold text-gray-700">Home</span>
          </Link>
          <Link href="/players" className="group bg-white rounded-3xl shadow-sm border border-gray-100 p-4 flex flex-col items-center gap-2 hover:shadow-md transition-all active:scale-95">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-2xl flex items-center justify-center text-lg shadow-md shadow-emerald-200">👥</div>
            <span className="text-xs font-bold text-gray-700">Players</span>
          </Link>
          <Link href="/stats" className="group bg-white rounded-3xl shadow-sm border border-gray-100 p-4 flex flex-col items-center gap-2 hover:shadow-md transition-all active:scale-95">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-2xl flex items-center justify-center text-lg shadow-md shadow-blue-200">📊</div>
            <span className="text-xs font-bold text-gray-700">Stats</span>
          </Link>
          <Link href="/history" className="group bg-white rounded-3xl shadow-sm border border-gray-100 p-4 flex flex-col items-center gap-2 hover:shadow-md transition-all active:scale-95">
            <div className="w-10 h-10 bg-gradient-to-br from-orange-400 to-pink-500 rounded-2xl flex items-center justify-center text-lg shadow-md shadow-orange-200">📅</div>
            <span className="text-xs font-bold text-gray-700">History</span>
          </Link>
        </div>

        {/* New post */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5 space-y-3">
          {/* Author selector */}
          <div className="flex items-center gap-3">
            {author ? <Avatar name={author} size="md" /> : (
              <div className="w-10 h-10 rounded-2xl bg-gray-100 flex items-center justify-center text-gray-400 text-lg shrink-0">👤</div>
            )}
            <select
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              className="flex-1 bg-gray-50 border-2 border-transparent focus:border-violet-300 rounded-2xl px-4 py-2.5 text-sm font-medium text-gray-900 focus:outline-none transition-colors"
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
            className="w-full bg-gray-50 border-2 border-transparent focus:border-violet-300 rounded-2xl px-4 py-3 text-sm font-medium text-gray-900 placeholder-gray-400 focus:outline-none transition-colors resize-none"
          />
          <button
            onClick={submitPost}
            disabled={posting || !content.trim() || !author.trim()}
            className="w-full bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white py-3 rounded-2xl font-bold text-sm shadow-lg shadow-violet-200 disabled:opacity-40 disabled:shadow-none hover:from-violet-600 hover:to-fuchsia-600 active:scale-[0.98] transition-all"
          >
            {posting ? "Posting..." : "Post →"}
          </button>
        </div>

        {/* Feed */}
        {loading ? (
          <div className="flex justify-center py-10">
            <div className="w-10 h-10 rounded-full border-4 border-violet-200 border-t-violet-500 animate-spin" />
          </div>
        ) : posts.length === 0 ? (
          <div className="bg-white/60 rounded-3xl border-2 border-dashed border-gray-200 p-10 text-center text-gray-400">
            <div className="text-3xl mb-2">💬</div>
            <p className="text-sm font-medium">No posts yet — be the first!</p>
          </div>
        ) : (
          posts.map((post) => {
            const isOpen = expandedId === post.id;
            return (
              <div key={post.id} className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                {/* Post */}
                <div className="p-5">
                  <div className="flex items-start gap-3">
                    <Avatar name={post.author} size="md" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-gray-900">{post.author}</span>
                        <span className="text-xs text-gray-400">{timeAgo(post.createdAt)}</span>
                      </div>
                      <p className="text-sm text-gray-700 mt-1 leading-relaxed">{post.content}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setExpandedId(isOpen ? null : post.id)}
                    className="mt-3 ml-11 text-xs font-semibold text-violet-500 hover:text-violet-700 transition-colors"
                  >
                    {post.comments.length > 0
                      ? `${post.comments.length} comment${post.comments.length > 1 ? "s" : ""} ${isOpen ? "▲" : "▼"}`
                      : isOpen ? "Hide" : "Reply"}
                  </button>
                </div>

                {/* Comments */}
                {isOpen && (
                  <div className="border-t border-gray-50 bg-gray-50/50 px-5 pb-4 pt-3 space-y-3">
                    {post.comments.map((c) => (
                      <div key={c.id} className="flex items-start gap-2.5">
                        <Avatar name={c.author} />
                        <div className="flex-1 bg-white rounded-2xl px-3 py-2 border border-gray-100">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-gray-800">{c.author}</span>
                            <span className="text-xs text-gray-400">{timeAgo(c.createdAt)}</span>
                          </div>
                          <p className="text-xs text-gray-700 mt-0.5 leading-relaxed">{c.content}</p>
                        </div>
                      </div>
                    ))}

                    {/* Comment input */}
                    <div className="flex gap-2 pt-1">
                      {author && <Avatar name={author} />}
                      <div className="flex-1 flex gap-2">
                        <input
                          type="text"
                          placeholder={author ? "Write a comment…" : "Select your name above first"}
                          value={commentText[post.id] ?? ""}
                          onChange={(e) => setCommentText((prev) => ({ ...prev, [post.id]: e.target.value }))}
                          onKeyDown={(e) => e.key === "Enter" && submitComment(post.id)}
                          disabled={!author}
                          className="flex-1 bg-white border-2 border-transparent focus:border-violet-300 rounded-2xl px-3 py-2 text-xs font-medium text-gray-900 placeholder-gray-400 focus:outline-none transition-colors disabled:opacity-50"
                        />
                        <button
                          onClick={() => submitComment(post.id)}
                          disabled={!author || !commentText[post.id]?.trim() || commenting === post.id}
                          className="bg-violet-500 text-white px-3 py-2 rounded-2xl text-xs font-bold disabled:opacity-40 hover:bg-violet-600 active:scale-95 transition-all"
                        >
                          {commenting === post.id ? "…" : "Send"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
