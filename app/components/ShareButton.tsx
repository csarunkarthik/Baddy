"use client";

import { useState } from "react";
import { Check, Copy, Share2 } from "lucide-react";
import { whatsappShareUrl } from "@/lib/messages";
import { useToast } from "./ui/ToastProvider";

type Props = {
  /** Built lazily — card text is derived from loaded data, so don't compute it on every render. */
  text: () => string;
  label?: string;
  /** "icon" for the compact control that sits in a card header. */
  size?: "icon" | "button";
  className?: string;
};

function WhatsAppGlyph({ className = "" }: { className?: string }) {
  // WhatsApp's own mark, drawn as a filled path so it stays legible at 14px
  // (the stroke-based lucide icons blur out at that size).
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.14-.14.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.68-1.6-.93-2.19-.24-.58-.49-.5-.67-.5h-.57c-.2 0-.52.07-.79.37-.27.3-1.03 1-1.03 2.45s1.06 2.84 1.2 3.04c.15.2 2.08 3.18 5.04 4.34 2.96 1.16 2.96.77 3.5.72.53-.05 1.72-.7 1.96-1.38.25-.67.25-1.25.17-1.37-.07-.12-.27-.2-.57-.35z" />
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.87 9.87 0 0 0 4.79 1.22h.01c5.46 0 9.9-4.44 9.9-9.9C21.95 6.45 17.5 2 12.04 2zm0 18.1h-.01a8.2 8.2 0 0 1-4.18-1.14l-.3-.18-3.1.81.83-3.03-.2-.31a8.17 8.17 0 0 1-1.25-4.34c0-4.53 3.7-8.22 8.23-8.22 2.2 0 4.26.86 5.81 2.41a8.16 8.16 0 0 1 2.41 5.82c0 4.53-3.7 8.22-8.24 8.22z" />
    </svg>
  );
}

/**
 * Share a block of text to WhatsApp, with copy-to-clipboard as the fallback.
 *
 * `wa.me` can only *open* WhatsApp with the message pre-filled — the person
 * picks the chat or group and taps send. Posting to a group without a human in
 * the loop isn't something WhatsApp allows any API to do, so this is the path
 * for group announcements; automatic reminders go out over push instead.
 */
export default function ShareButton({ text, label = "Share", size = "icon", className = "" }: Props) {
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);

  function shareToWhatsApp() {
    const body = text();
    if (!body.trim()) {
      showToast("Nothing to share yet", "danger");
      return;
    }
    window.open(whatsappShareUrl(body), "_blank");
  }

  async function copy() {
    const body = text();
    if (!body.trim()) return;
    try {
      await navigator.clipboard.writeText(body);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      showToast("Couldn't copy to clipboard", "danger");
    }
  }

  if (size === "button") {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <button
          onClick={shareToWhatsApp}
          className="inline-flex items-center justify-center gap-2 font-bold text-sm px-5 py-3 rounded-2xl bg-[#25D366] text-[#052e16] shadow-md transition-all active:scale-95 hover:brightness-110"
        >
          <WhatsAppGlyph className="w-[18px] h-[18px]" /> {label}
        </button>
        <button
          onClick={copy}
          aria-label="Copy to clipboard"
          title="Copy to clipboard"
          className="inline-flex items-center justify-center w-11 h-11 rounded-2xl bg-surface-raised border border-border text-muted transition-colors hover:text-text hover:bg-surface-hover"
        >
          {copied ? <Check size={16} className="text-accent-2" /> : <Copy size={16} />}
        </button>
      </div>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <button
        onClick={shareToWhatsApp}
        aria-label={`${label} on WhatsApp`}
        title={`${label} on WhatsApp`}
        className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-[#25D366]/80 transition-colors hover:text-[#25D366] hover:bg-white/5"
      >
        <WhatsAppGlyph className="w-4 h-4" />
      </button>
      <button
        onClick={copy}
        aria-label="Copy to clipboard"
        title="Copy to clipboard"
        className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-faint transition-colors hover:text-text hover:bg-white/5"
      >
        {copied ? <Check size={14} className="text-accent-2" /> : <Share2 size={14} />}
      </button>
    </span>
  );
}
