"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, User } from "lucide-react";

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
    const saved = typeof window !== "undefined" ? window.localStorage.getItem("feedAuthor") : null;
    if (saved) setAuthor(saved);
    Promise.all([fetch("/api/posts"), fetch("/api/players")])
      .then(([p, pl]) => Promise.all([p.json(), pl.json()]))
      .then(([postsData, playersData]) => {
        setPosts(postsData);
        setPlayers(playersData);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (author) window.localStorage.setItem("feedAuthor", author);
  }, [author]);

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
    <div className="app-bg">
      {/* Header */}
      <div className="app-header px-5 pt-10 pb-5 flex items-center justify-between">
        <div>
          <h1 className="font-display text-4xl tracking-widest">Feed</h1>
          <p className="app-header-subtle text-sm mt-0.5">Share your thoughts</p>
        </div>
        <img src="/logo.svg" alt="Baddy" className="h-8 w-auto" />
      </div>

      <div className="px-4 py-5 max-w-lg mx-auto space-y-4">

        {/* New post */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5 space-y-3">
          {/* Author selector */}
          <div className="flex items-center gap-3">
            {author ? <Avatar name={author} size="md" /> : (
              <div className="w-10 h-10 rounded-2xl bg-black/6 flex items-center justify-center shrink-0"><User size={20} className="text-black/30" /></div>
            )}
            <select
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              className="flex-1 bg-gray-50 border-2 border-transparent focus:border-brand rounded-2xl px-4 py-2.5 text-sm font-medium text-gray-900 focus:outline-none transition-colors"
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
            className="w-full bg-gray-50 border-2 border-transparent focus:border-brand rounded-2xl px-4 py-3 text-sm font-medium text-gray-900 placeholder-gray-400 focus:outline-none transition-colors resize-none"
          />
          <button
            onClick={submitPost}
            disabled={posting || !content.trim() || !author.trim()}
            className="w-full bg-brand text-rich-black py-3 rounded-2xl font-bold text-sm shadow-lg shadow-brand/20 disabled:opacity-40 disabled:shadow-none hover:bg-brand-dark active:scale-[0.98] transition-all"
          >
            {posting ? "Posting..." : "Post →"}
          </button>
        </div>

        {/* Feed */}
        {loading ? (
          <div className="flex justify-center py-10">
            <div className="w-10 h-10 rounded-full border-4 border-brand/20 border-t-brand animate-spin" />
          </div>
        ) : posts.length === 0 ? (
          <div className="bg-white/60 rounded-3xl border-2 border-dashed border-gray-200 p-10 text-center text-black/40">
            <div className="flex justify-center mb-2"><MessageCircle size={32} className="text-black/20" /></div>
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
                    className="mt-3 ml-11 text-xs font-semibold text-brand-dark hover:text-brand transition-colors"
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
                          className="flex-1 bg-white border-2 border-transparent focus:border-brand rounded-2xl px-3 py-2 text-xs font-medium text-gray-900 placeholder-gray-400 focus:outline-none transition-colors disabled:opacity-50"
                        />
                        <button
                          onClick={() => submitComment(post.id)}
                          disabled={!author || !commentText[post.id]?.trim() || commenting === post.id}
                          className="bg-brand text-rich-black px-3 py-2 rounded-2xl text-xs font-bold disabled:opacity-40 hover:bg-brand-dark active:scale-95 transition-all"
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
