"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { executeTool } from "@/lib/agent/execute";
import { BillingSession } from "@/lib/billing/service";

/* The voice channel. Connects to the OpenAI Realtime API over WebRTC using an
 * ephemeral secret from /api/realtime/token, streams both transcripts, and
 * executes the agent's function calls against the mock billing system, live. */

type Status = "idle" | "connecting" | "live" | "ended" | "error";

type ErrorKind =
  | "mic_denied"
  | "demo_asleep"
  | "ip_capped"
  | "cooldown"
  | "not_configured"
  | "unavailable";

interface TranscriptEntry {
  key: string;
  role: "caller" | "agent";
  text: string;
  final: boolean;
}

interface ToolCallEntry {
  callId: string;
  name: string;
  args: string;
  result: string;
  ok: boolean;
  ms: number;
}

const ERROR_COPY: Record<ErrorKind, { title: string; body: string }> = {
  mic_denied: {
    title: "Microphone blocked",
    body: "The browser denied mic access. Allow the microphone for this site and try again.",
  },
  demo_asleep: {
    title: "The demo is asleep",
    body: "Today's global call budget is used up. It resets at midnight UTC. Come back tomorrow, or read how it's built below.",
  },
  ip_capped: {
    title: "Daily limit reached",
    body: "This network has used its calls for today. The cap keeps a public demo affordable. Try again tomorrow.",
  },
  cooldown: {
    title: "One moment",
    body: "Calls from one place are spaced out a little. Wait about twenty seconds and try again.",
  },
  not_configured: {
    title: "Demo not configured",
    body: "The server has no API key configured. If you run this locally, set OPENAI_API_KEY in .env.local.",
  },
  unavailable: {
    title: "Could not reach the agent",
    body: "The realtime service did not answer. This happens. Try once more in a minute.",
  },
};

function fmtClock(s: number): string {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export function VoiceSession() {
  const [status, setStatus] = useState<Status>("idle");
  const [errorKind, setErrorKind] = useState<ErrorKind | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [toolCalls, setToolCalls] = useState<ToolCallEntry[]>([]);
  const [secondsLeft, setSecondsLeft] = useState(180);
  const [agentSpeaking, setAgentSpeaking] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const billingRef = useRef<BillingSession | null>(null);
  const hangUpAfterResponseRef = useRef(false);

  /* Operational metadata for the /ops log, mirrored in refs so the endCall
   * closure never reads stale state. Transcript text is never reported. */
  const statsRef = useRef({
    startedAt: 0,
    callerTurns: 0,
    agentTurns: 0,
    toolMeta: [] as { name: string; ok: boolean; ms: number }[],
    escalated: false,
    resolvedSignal: false,
    endOutcome: "" as string,
    reported: false,
  });

  const reportSession = useCallback((viaBeacon = false) => {
    const s = statsRef.current;
    if (s.reported || !s.startedAt) return;
    s.reported = true;
    const outcome = s.escalated
      ? "escalated"
      : s.endOutcome === "resolved" || s.resolvedSignal
        ? "resolved"
        : "abandoned";
    const payload = JSON.stringify({
      durationMs: Date.now() - s.startedAt,
      outcome,
      callerTurns: s.callerTurns,
      agentTurns: s.agentTurns,
      toolCalls: s.toolMeta,
    });
    if (viaBeacon && navigator.sendBeacon) {
      navigator.sendBeacon("/api/sessions", new Blob([payload], { type: "application/json" }));
    } else {
      fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    }
  }, []);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  const teardown = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    dcRef.current?.close();
    dcRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    micRef.current?.getTracks().forEach((t) => t.stop());
    micRef.current = null;
    setAgentSpeaking(false);
  }, []);

  const endCall = useCallback(() => {
    reportSession();
    teardown();
    setStatus("ended");
  }, [teardown, reportSession]);

  useEffect(() => () => teardown(), [teardown]);

  // Tab closed mid-call: report what we have as abandoned via beacon.
  useEffect(() => {
    if (status !== "live") return;
    const onPageHide = () => reportSession(true);
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [status, reportSession]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [transcript, toolCalls]);

  const upsertTranscript = useCallback(
    (key: string, role: "caller" | "agent", update: (prev: string) => string, final: boolean) => {
      setTranscript((prev) => {
        const i = prev.findIndex((e) => e.key === key);
        if (i === -1) return [...prev, { key, role, text: update(""), final }];
        const next = [...prev];
        next[i] = { ...next[i], text: update(next[i].text), final: final || next[i].final };
        return next;
      });
    },
    [],
  );

  const handleServerEvent = useCallback(
    (raw: string) => {
      let ev: Record<string, unknown>;
      try {
        ev = JSON.parse(raw);
      } catch {
        return;
      }
      const type = ev.type as string;

      switch (type) {
        case "conversation.item.input_audio_transcription.delta":
          upsertTranscript(`u-${ev.item_id}`, "caller", (p) => p + (ev.delta as string ?? ""), false);
          break;
        case "conversation.item.input_audio_transcription.completed":
          statsRef.current.callerTurns += 1;
          upsertTranscript(`u-${ev.item_id}`, "caller", () => (ev.transcript as string ?? ""), true);
          break;
        case "response.output_audio_transcript.delta":
          setAgentSpeaking(true);
          upsertTranscript(`a-${ev.item_id}`, "agent", (p) => p + (ev.delta as string ?? ""), false);
          break;
        case "response.output_audio_transcript.done":
          statsRef.current.agentTurns += 1;
          upsertTranscript(`a-${ev.item_id}`, "agent", () => (ev.transcript as string ?? ""), true);
          break;
        case "response.done":
          setAgentSpeaking(false);
          if (hangUpAfterResponseRef.current) {
            // The agent called end_call; give the tail of its goodbye a moment
            // to play out on the audio track before dropping the connection.
            hangUpAfterResponseRef.current = false;
            setTimeout(() => endCall(), 1500);
          }
          break;
        case "response.function_call_arguments.done": {
          const name = ev.name as string;
          const callId = ev.call_id as string;
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(ev.arguments as string);
          } catch {
            /* executor treats missing args as empty strings */
          }
          const t0 = performance.now();
          const result = executeTool(billingRef.current!, name, args);
          const ms = Math.max(1, Math.round(performance.now() - t0));
          setToolCalls((prev) => [
            ...prev,
            {
              callId,
              name,
              args: JSON.stringify(args),
              result: JSON.stringify(result.ok ? result.data : { error: result.error }),
              ok: result.ok,
              ms,
            },
          ]);
          statsRef.current.toolMeta.push({ name, ok: result.ok, ms });
          if (name === "escalate_to_human" && result.ok) statsRef.current.escalated = true;
          if ((name === "apply_credit" || name === "send_summary_email") && result.ok) {
            statsRef.current.resolvedSignal = true;
          }
          if (name === "end_call") {
            hangUpAfterResponseRef.current = true;
            statsRef.current.endOutcome =
              typeof args.outcome === "string" ? args.outcome : "";
          }
          const dc = dcRef.current;
          if (dc?.readyState === "open") {
            dc.send(
              JSON.stringify({
                type: "conversation.item.create",
                item: {
                  type: "function_call_output",
                  call_id: callId,
                  output: JSON.stringify(result),
                },
              }),
            );
            // end_call needs no follow-up turn: the goodbye was already spoken
            // and the connection drops after this response finishes.
            if (name !== "end_call") {
              dc.send(JSON.stringify({ type: "response.create" }));
            }
          }
          break;
        }
        case "error":
          console.error("realtime error event", ev);
          break;
      }
    },
    [upsertTranscript, endCall],
  );

  const start = useCallback(async () => {
    setStatus("connecting");
    setErrorKind(null);
    setTranscript([]);
    setToolCalls([]);
    billingRef.current = new BillingSession();
    statsRef.current = {
      startedAt: 0,
      callerTurns: 0,
      agentTurns: 0,
      toolMeta: [],
      escalated: false,
      resolvedSignal: false,
      endOutcome: "",
      reported: false,
    };

    // 1. Ephemeral secret (server enforces caps and holds the real key).
    let token: { value: string; sessionSeconds: number };
    try {
      const res = await fetch("/api/realtime/token", { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        const kind: ErrorKind =
          body.error === "demo_asleep" || body.error === "ip_capped" || body.error === "cooldown"
            ? body.error
            : body.error === "not_configured"
              ? "not_configured"
              : "unavailable";
        setErrorKind(kind);
        setStatus("error");
        return;
      }
      token = await res.json();
    } catch {
      setErrorKind("unavailable");
      setStatus("error");
      return;
    }

    // 2. Microphone.
    let mic: MediaStream;
    try {
      mic = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setErrorKind("mic_denied");
      setStatus("error");
      return;
    }
    micRef.current = mic;

    // 3. WebRTC to the Realtime API.
    try {
      const pc = new RTCPeerConnection();
      pcRef.current = pc;
      pc.ontrack = (e) => {
        if (audioRef.current) audioRef.current.srcObject = e.streams[0];
      };
      pc.addTrack(mic.getTracks()[0]);

      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;
      dc.onmessage = (e) => handleServerEvent(e.data as string);
      dc.onopen = () => {
        setStatus("live");
        statsRef.current.startedAt = Date.now();
        // The agent greets first; nudge it to open the call.
        dc.send(JSON.stringify({ type: "response.create" }));

        const cap = token.sessionSeconds ?? 180;
        setSecondsLeft(cap);
        timerRef.current = setInterval(() => {
          setSecondsLeft((s) => {
            if (s <= 1) {
              endCall();
              return 0;
            }
            return s - 1;
          });
        }, 1000);
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const sdpRes = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${token.value}`,
          "Content-Type": "application/sdp",
        },
      });
      if (!sdpRes.ok) throw new Error(`sdp ${sdpRes.status}`);
      await pc.setRemoteDescription({ type: "answer", sdp: await sdpRes.text() });
    } catch (err) {
      console.error("webrtc setup failed", err);
      teardown();
      setErrorKind("unavailable");
      setStatus("error");
    }
  }, [endCall, handleServerEvent, teardown]);

  const lowTime = secondsLeft <= 30;

  return (
    <section className="panel overflow-hidden">
      <div className="panel-title-bar">
        <div className="flex items-center gap-3 font-mono text-xs text-ink-dim">
          {status === "live" ? (
            <>
              <span className="pulse-dot" aria-hidden />
              <span>LIVE CALL</span>
              {agentSpeaking && (
                <span className="voice-bars" aria-label="agent speaking">
                  <span /><span /><span />
                </span>
              )}
            </>
          ) : (
            <span className="uppercase tracking-widest">
              {status === "idle" && "Ready"}
              {status === "connecting" && "Connecting…"}
              {status === "ended" && "Call ended"}
              {status === "error" && "Unavailable"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {status === "live" && (
            <>
              <span
                className={`font-mono text-sm tabular-nums ${lowTime ? "text-ember font-bold" : "text-ink-dim"}`}
                title="Demo calls are capped at 3 minutes"
              >
                {fmtClock(secondsLeft)}
              </span>
              <button
                onClick={endCall}
                className="btn-ghost press-scale px-3 py-1 text-sm"
              >
                End call
              </button>
            </>
          )}
        </div>
      </div>

      <audio ref={audioRef} autoPlay className="hidden" />

      {(status === "idle" || status === "connecting") && (
        <div className="flex flex-col items-center justify-center gap-4 py-20 px-6 text-center">
          <button
            onClick={start}
            disabled={status === "connecting"}
            className="btn-ember press-scale px-8 py-4 text-lg disabled:opacity-60"
          >
            {status === "connecting" ? "Connecting…" : "Start a call"}
          </button>
          <p className="text-sm text-ink-muted max-w-sm">
            Uses your microphone. Calls are capped at 3 minutes. You will talk to an
            AI agent about a fictional phone bill.
          </p>
        </div>
      )}

      {status === "error" && errorKind && (
        <div className="flex flex-col items-center justify-center gap-3 py-16 px-6 text-center">
          <h3 className="text-lg font-semibold text-ink">{ERROR_COPY[errorKind].title}</h3>
          <p className="text-sm text-ink-dim max-w-md">{ERROR_COPY[errorKind].body}</p>
          {errorKind !== "demo_asleep" && errorKind !== "ip_capped" && (
            <button onClick={start} className="btn-ghost press-scale px-5 py-2 mt-2 text-sm">
              Try again
            </button>
          )}
        </div>
      )}

      {(status === "live" || status === "ended") && (
        <div className="grid md:grid-cols-[1.4fr_1fr] min-h-[420px]">
          {/* Transcript */}
          <div className="border-b md:border-b-0 md:border-r border-border">
            <h3 className="px-5 pt-4 pb-2 font-mono text-[11px] uppercase tracking-widest text-ink-muted">
              Transcript
            </h3>
            <div className="px-5 pb-5 max-h-[480px] overflow-y-auto flex flex-col gap-3">
              {transcript.length === 0 && (
                <p className="text-sm text-ink-muted italic">Say hello…</p>
              )}
              {transcript.map((e) => (
                <div key={e.key} className={e.role === "agent" ? "" : "text-right"}>
                  <span className="font-mono text-[10px] uppercase tracking-widest text-ink-muted block mb-0.5">
                    {e.role === "agent" ? "Nimbus" : "You"}
                  </span>
                  <span
                    className={`inline-block rounded-xl px-3.5 py-2 text-sm leading-relaxed max-w-[85%] text-left ${
                      e.role === "agent"
                        ? "bg-bg-inset text-ink"
                        : "bg-[var(--ember-tint)] text-ink"
                    } ${e.final ? "" : "opacity-70"}`}
                  >
                    {e.text || "…"}
                  </span>
                </div>
              ))}
              <div ref={transcriptEndRef} />
            </div>
          </div>

          {/* Tool-call timeline */}
          <div className="bg-bg-inset/50">
            <h3 className="px-5 pt-4 pb-2 font-mono text-[11px] uppercase tracking-widest text-ink-muted">
              Function calls · billing system
            </h3>
            <div className="px-5 pb-5 max-h-[480px] overflow-y-auto flex flex-col gap-2.5 font-mono text-xs">
              {toolCalls.length === 0 && (
                <p className="text-ink-muted italic font-sans text-sm">
                  Tool calls appear here as the agent works.
                </p>
              )}
              {toolCalls.map((c, i) => (
                <div
                  key={`${c.callId}-${i}`}
                  className="rounded-lg border border-border bg-bg-panel p-3"
                >
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
      )}

      {status === "ended" && (
        <div className="border-t border-border px-5 py-4 flex items-center justify-between gap-3">
          <p className="text-sm text-ink-dim">
            Call ended. {toolCalls.length} function call{toolCalls.length === 1 ? "" : "s"} against
            the billing system.
          </p>
          <button onClick={start} className="btn-ghost press-scale px-4 py-2 text-sm">
            Call again
          </button>
        </div>
      )}
    </section>
  );
}
