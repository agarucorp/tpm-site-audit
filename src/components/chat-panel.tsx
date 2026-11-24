"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { runChat, type ChatReply } from "@/lib/chat/actions";
import { useActor } from "./role-provider";

type Message = { id: string; from: "user" | "bot"; text: string; tone?: ChatReply["tone"]; href?: string; linkLabel?: string };

const STORAGE_KEY = "tpm-site-audit:chat";
const WELCOME: Message = {
  id: "welcome",
  from: "bot",
  tone: "info",
  text: "Paste a Lovable audit result (01–12 with PASS/FAIL) and I’ll fill the open audit. Or type a command — try “help”.",
};

export function ChatPanel() {
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
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { open?: boolean; messages?: Message[] };
        if (saved.messages?.length) setMessages(saved.messages);
        if (saved.open) setOpen(true);
      }
    } catch {}
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
      try {
        const res = await runChat(text, { auditId }, actor);
        setMessages((m) => [
          ...m,
          ...res.replies.map((r, i) => ({ id: `b${Date.now()}-${i}`, from: "bot" as const, ...r })),
        ]);
        router.refresh();
      } catch (e) {
        setMessages((m) => [...m, { id: `e${Date.now()}`, from: "bot", tone: "error", text: `Something went wrong: ${(e as Error).message}` }]);
      }
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
