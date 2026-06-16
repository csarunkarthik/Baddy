"use client";

import { useEffect } from "react";

/**
 * Root-level error boundary — catches errors that escape app/error.tsx (e.g. in
 * the root layout itself). Renders its own <html><body>, so it stays minimal
 * and self-contained rather than depending on the rest of the app shell.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0e0f13",
          color: "#f5f5f7",
          fontFamily: "Arial, Helvetica, sans-serif",
          padding: "1rem",
        }}
      >
        <div
          style={{
            maxWidth: "24rem",
            width: "100%",
            textAlign: "center",
            background: "#16171d",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "1.5rem",
            padding: "2rem",
            boxShadow: "0 1px 2px rgba(0,0,0,0.4)",
          }}
        >
          <div
            style={{
              width: "3rem",
              height: "3rem",
              borderRadius: "1rem",
              background: "rgba(244,63,94,0.15)",
              color: "#f43f5e",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 1rem",
              fontSize: "1.5rem",
              fontWeight: 700,
            }}
          >
            !
          </div>
          <h1 style={{ fontSize: "1.125rem", fontWeight: 700, margin: 0 }}>Something went wrong</h1>
          <p style={{ fontSize: "0.875rem", color: "#a1a1aa", marginTop: "0.375rem" }}>
            A critical error occurred. You can try again.
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: "1.25rem",
              width: "100%",
              padding: "0.75rem 1.25rem",
              borderRadius: "1rem",
              border: "none",
              background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
              color: "white",
              fontWeight: 700,
              fontSize: "0.875rem",
              cursor: "pointer",
            }}
          >
            Retry
          </button>
        </div>
      </body>
    </html>
  );
}
