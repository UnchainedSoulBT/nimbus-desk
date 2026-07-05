"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* The text channel's client. Same layout as the voice panel — transcript on
 * the left, live function-call timeline on the right — because the pitch is
 * identical: one agent definition, visible tool work. All agent logic runs
 * server-side in /api/chat; this component only renders. */

interface Turn {
  role: "caller" | "agent";
  text: string;
}

interface ToolCallEntry {
  name: string;
  args: string;
  result: string;
  ok: boolean;
  ms: number;
}

interface ChatApiResponse {
  chatId: string;
  agentTexts: string[];
  toolCalls: { name: string; args: unknown; result: unknown; ok: boolean; ms: number }[];
  ended: boolean;
}

type Status = "connecting" | "active" | "ended" | "error";

export function ChatSession() {
  const [status, setStatus] = useState<Status>("connecting");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [toolCalls, setToolCalls] = useState<ToolCallEntry[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const chatIdRef = useRef<string | null>(null);
  const startedRef = useRef(false);
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, toolCalls, pending]);

  const absorb = useCallback((data: ChatApiResponse) => {
    if (data.agentTexts.length) {
      setTurns((prev) => [
        ...prev,
        ...data.agentTexts.map((text) => ({ role: "agent" as const, text })),
      ]);
    }
    if (data.toolCalls.length) {
      setToolCalls((prev) => [
        ...prev,
        ...data.toolCalls.map((c) => ({
          name: c.name,
          args: JSON.stringify(c.args),
          result: JSON.stringify(c.result),
          ok: c.ok,
          ms: c.ms,
        })),
      ]);
    }
    if (data.ended) setStatus("ended");
  }, []);

  const start = useCallback(async () => {
    setStatus("connecting");
    setTurns([]);
    setToolCalls([]);
    setNotice(null);
    chatIdRef.current = null;
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!res.ok) {
        setNotice(
          res.status === 429
            ? "The chat is rate limited right now. Give it a minute."
            : "The agent is unavailable. Try again in a moment.",
        );
        setStatus("error");
        return;
      }
      const data = (await res.json()) as ChatApiResponse;
      chatIdRef.current = data.chatId;
      setStatus("active");
      absorb(data);
      inputRef.current?.focus();
    } catch {
      setNotice("The agent is unavailable. Try again in a moment.");
      setStatus("error");
    }
  }, [absorb]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    start();
  }, [start]);

  const send = useCallback(async () => {
    const message = draft.trim();
    if (!message || pending || status !== "active" || !chatIdRef.current) return;
    setDraft("");
    setPending(true);
    setTurns((prev) => [...prev, { role: "caller", text: message }]);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: chatIdRef.current, message }),
      });
      if (res.status === 410) {
        setNotice("This chat expired. Start a new one below.");
        setStatus("ended");
        return;
      }
      if (res.status === 429) {
        setNotice("Sending too fast. Wait a few seconds and try again.");
        return;
      }
      if (!res.ok) {
        setNotice("Something went wrong upstream. Try that message again.");
        return;
      }
      setNotice(null);
      absorb((await res.json()) as ChatApiResponse);
    } catch {
      setNotice("Network hiccup. Try that message again.");
    } finally {
      setPending(false);
      inputRef.current?.focus();
    }
  }, [draft, pending, status, absorb]);

  return (
    <section className="panel overflow-hidden">
      <div className="panel-title-bar">
        <div className="flex items-center gap-3 font-mono text-xs text-ink-dim">
          {status === "active" ? (
            <>
              <span className="pulse-dot" aria-hidden />
              <span>CHAT · SAME AGENT AS THE VOICE LINE</span>
            </>
          ) : (
            <span className="uppercase tracking-widest">
              {status === "connecting" && "Connecting…"}
              {status === "ended" && "Chat ended"}
              {status === "error" && "Unavailable"}
            </span>
          )}
        </div>
        {(status === "ended" || status === "error") && (
          <button onClick={start} className="btn-ghost press-scale px-3 py-1 text-sm">
            New chat
          </button>
        )}
      </div>

      <div className="grid md:grid-cols-[1.4fr_1fr] min-h-[420px]">
        {/* Transcript + composer */}
        <div className="border-b md:border-b-0 md:border-r border-border flex flex-col">
          <div className="px-5 pt-4 pb-3 max-h-[440px] overflow-y-auto flex flex-col gap-3 grow">
            {turns.map((t, i) => (
              <div key={i} className={t.role === "agent" ? "" : "text-right"}>
                <span className="font-mono text-[10px] uppercase tracking-widest text-ink-muted block mb-0.5">
                  {t.role === "agent" ? "Nimbus" : "You"}
                </span>
                <span
                  className={`inline-block rounded-xl px-3.5 py-2 text-sm leading-relaxed max-w-[85%] text-left ${
                    t.role === "agent" ? "bg-bg-inset text-ink" : "bg-[var(--ember-tint)] text-ink"
                  }`}
                >
                  {t.text}
                </span>
              </div>
            ))}
            {pending && (
              <span className="font-mono text-xs text-ink-muted">Nimbus is typing…</span>
            )}
            {notice && <p className="text-xs text-ember">{notice}</p>}
            <div ref={endRef} />
          </div>
          <form
            className="border-t border-border p-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={300}
              placeholder={
                status === "active" ? "Type your message…" : "Chat is not active"
              }
              disabled={status !== "active" || pending}
              className="grow rounded-xl border border-border-strong bg-bg-panel px-3.5 py-2 text-sm disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={status !== "active" || pending || !draft.trim()}
              className="btn-ember press-scale px-4 py-2 text-sm disabled:opacity-50"
            >
              Send
            </button>
          </form>
        </div>

        {/* Tool-call timeline */}
        <div className="bg-bg-inset/50">
          <h3 className="px-5 pt-4 pb-2 font-mono text-[11px] uppercase tracking-widest text-ink-muted">
            Function calls · billing system
          </h3>
          <div className="px-5 pb-5 max-h-[440px] overflow-y-auto flex flex-col gap-2.5 font-mono text-xs">
            {toolCalls.length === 0 && (
              <p className="text-ink-muted italic font-sans text-sm">
                Tool calls appear here as the agent works.
              </p>
            )}
            {toolCalls.map((c, i) => (
              <div key={i} className="rounded-lg border border-border bg-bg-panel p-3">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="font-semibold text-ink">{c.name}()</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] ${
                      c.ok ? "bg-[var(--ok-tint)] text-ok" : "bg-[var(--ember-tint)] text-ember"
                    }`}
                  >
                    {c.ok ? "ok" : "error"} · {c.ms}ms
                  </span>
                </div>
                <div className="text-ink-dim break-all">{c.args}</div>
                <div className="mt-1 text-ink-muted break-all">→ {c.result}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
