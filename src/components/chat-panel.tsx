"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Component, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { runChat, type ChatReply } from "@/lib/chat/actions";
import { useActor } from "./role-provider";

type Message = { id: string; from: "user" | "bot"; text: string; tone?: ChatReply["tone"]; href?: string; linkLabel?: string };

const STORAGE_KEY = "tpm-site-audit:chat";
const WELCOME: Message = {
  id: "welcome",
  from: "bot",
  tone: "info",
  text: "Paste the full audit result (English or Spanish) and I’ll apply only the checks it clearly reports. Or type a command — try “help”.",
};

function isMessage(m: unknown): m is Message {
  if (!m || typeof m !== "object") return false;
  const x = m as Record<string, unknown>;
  return typeof x.id === "string" && typeof x.text === "string" && (x.from === "user" || x.from === "bot");
}

function loadSaved(): { open: boolean; messages: Message[] } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as { open?: unknown; messages?: unknown };
    const messages = Array.isArray(saved.messages) ? saved.messages.filter(isMessage) : [];
    return { open: saved.open === true, messages };
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

class ChatBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error("Audit chat crashed", error);
  }
  reset = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
    this.setState({ failed: false });
  };
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <aside className="chat" data-testid="chat-panel" aria-label="Audit chat">
        <div className="chat-head">
          <div className="chat-title">Audit chat</div>
        </div>
        <div className="chat-list" data-testid="chat-list">
          <div className="msg msg-bot tone-error" data-testid="chat-recovered">
            <div className="msg-text">The chat hit an error and stopped. Your audits weren’t affected.</div>
          </div>
        </div>
        <div className="chat-input">
          <button className="btn btn-primary" onClick={this.reset} data-testid="chat-reset">
            Reset chat
          </button>
        </div>
      </aside>
    );
  }
}

export function ChatPanel() {
  return (
    <ChatBoundary>
      <ChatPanelInner />
    </ChatBoundary>
  );
}

function ChatPanelInner() {
  const pathname = usePathname();
  const router = useRouter();
  const actor = useActor();
  const auditId = pathname.match(/^\/audits\/([^/]+)/)?.[1];
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [pending, start] = useTransition();
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = loadSaved();
    if (saved?.messages.length) setMessages(saved.messages);
    if (saved?.open) setOpen(true);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ open, messages: messages.slice(-60) }));
    } catch {}
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  const send = () => {
    const text = input.trim();
    if (!text || pending) return;
    const userMsg: Message = { id: `u${Date.now()}`, from: "user", text };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    start(async () => {
      let replies: ChatReply[];
      try {
        const res = await runChat(text, { auditId }, actor);
        replies = Array.isArray(res?.replies) ? res.replies : [];
      } catch (e) {
        const reason = e instanceof Error && e.message ? e.message : "network error";
        replies = [{ tone: "error", text: `The message didn’t go through (${reason.slice(0, 160)}). Nothing was changed. Reload the page if this keeps happening.` }];
      }
      const stamp = Date.now();
      setMessages((m) => [
        ...m,
        ...replies
          .filter((r) => r && typeof r.text === "string")
          .map((r, i) => ({
            id: `b${stamp}-${i}`,
            from: "bot" as const,
            text: r.text,
            tone: r.tone,
            href: typeof r.href === "string" ? r.href : undefined,
            linkLabel: r.linkLabel,
          })),
      ]);
      try {
        router.refresh();
      } catch {}
    });
  };

  return (
    <>
      {!open && (
        <button className="chat-fab" onClick={() => setOpen(true)} data-testid="chat-open">
          <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden>
            <path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
          </svg>
          Chat
        </button>
      )}
      {open && (
        <aside className="chat" data-testid="chat-panel" aria-label="Audit chat">
          <div className="chat-head">
            <div>
              <div className="chat-title">Audit chat</div>
              <div className="muted small">{auditId ? "Applies to the open audit unless you name a site" : "Name a site, or open an audit"}</div>
            </div>
            <div className="btn-row">
              <button className="link-btn" onClick={() => setMessages([WELCOME])}>
                Clear
              </button>
              <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Close chat">
                ×
              </button>
            </div>
          </div>
          <div className="chat-list" ref={listRef} data-testid="chat-list">
            {messages.map((m) => (
              <div key={m.id} className={`msg msg-${m.from} ${m.tone ? `tone-${m.tone}` : ""}`}>
                <div className="msg-text">{m.text}</div>
                {m.href && (
                  <Link href={m.href} className="msg-link">
                    {m.linkLabel ?? "Open"} →
                  </Link>
                )}
              </div>
            ))}
            {pending && <div className="msg msg-bot tone-info typing">Applying…</div>}
          </div>
          <div className="chat-input">
            <textarea
              className="input"
              rows={3}
              value={input}
              placeholder="Paste the audit result, or: mark 04 fail mobile: dosing in FAQ"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              data-testid="chat-input"
            />
            <div className="chat-input-foot">
              <span className="muted small">Enter to send · Shift+Enter for a new line</span>
              <button className="btn btn-primary" onClick={send} disabled={pending || !input.trim()} data-testid="chat-send">
                Send
              </button>
            </div>
          </div>
        </aside>
      )}
    </>
  );
}
