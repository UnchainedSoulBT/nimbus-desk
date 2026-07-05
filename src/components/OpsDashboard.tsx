"use client";

import { useEffect, useState } from "react";
import type { OpsSnapshot, SessionOutcome } from "@/lib/sessions";

/* Datadog-shaped view of the session log: metric tiles up top, recent-session
 * trace table below. Polls so a call made in another tab shows up live. */

const POLL_MS = 10_000;

function pct(v: number | null): string {
  return v === null ? "—" : `${Math.round(v * 100)}%`;
}

function duration(ms: number | null): string {
  if (ms === null) return "—";
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

function timeOfDay(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const OUTCOME_STYLE: Record<SessionOutcome, string> = {
  resolved: "bg-[var(--ok-tint)] text-ok",
  escalated: "bg-[var(--ember-tint)] text-ember",
  abandoned: "bg-bg-raise text-ink-muted",
};

function Tile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="panel p-5">
      <p className="font-mono text-[11px] uppercase tracking-widest text-ink-muted">{label}</p>
      <p className="mt-1 text-3xl font-bold tabular-nums text-ink">{value}</p>
      <p className="mt-1 text-xs text-ink-muted">{hint}</p>
    </div>
  );
}

export function OpsDashboard() {
  const [snap, setSnap] = useState<OpsSnapshot | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/sessions", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as OpsSnapshot;
        if (alive) {
          setSnap(data);
          setFailed(false);
        }
      } catch {
        if (alive) setFailed(true);
      }
    };
    load();
    const t = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  if (failed && !snap) {
    return (
      <div className="panel p-8 text-center text-sm text-ink-dim">
        Could not load metrics. Refresh in a moment.
      </div>
    );
  }
  if (!snap) {
    return <div className="panel p-8 text-center text-sm text-ink-muted">Loading…</div>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label="Containment rate"
          value={pct(snap.containmentRate)}
          hint="Resolved without human handoff"
        />
        <Tile
          label="Avg handling time"
          value={duration(snap.avgHandlingTimeMs)}
          hint="Resolved and escalated calls"
        />
        <Tile
          label="Tool success rate"
          value={pct(snap.toolSuccessRate)}
          hint={`${snap.totals.toolCalls} function calls · avg ${
            snap.avgToolLatencyMs === null ? "—" : `${Math.round(snap.avgToolLatencyMs)}ms`
          }`}
        />
        <Tile
          label="Sessions today"
          value={String(snap.sessionsToday)}
          hint={`${snap.totals.sessions} since last deploy · ${snap.totals.resolved} resolved / ${snap.totals.escalated} escalated / ${snap.totals.abandoned} abandoned`}
        />
      </div>

      <section className="panel overflow-hidden">
        <div className="panel-title-bar">
          <span className="font-mono text-xs uppercase tracking-widest text-ink-dim">
            Recent sessions
          </span>
          <span className="flex items-center gap-2 font-mono text-[11px] text-ink-muted">
            <span className="pulse-dot" aria-hidden /> auto-refresh {POLL_MS / 1000}s
          </span>
        </div>
        {snap.recent.length === 0 ? (
          <p className="p-8 text-center text-sm text-ink-muted">
            No sessions logged yet. Make a call on the demo page and it appears here.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border font-mono text-[11px] uppercase tracking-widest text-ink-muted">
                  <th className="px-4 py-2.5 text-left font-medium">Time</th>
                  <th className="px-4 py-2.5 text-left font-medium">Channel</th>
                  <th className="px-4 py-2.5 text-left font-medium">Outcome</th>
                  <th className="px-4 py-2.5 text-right font-medium">Duration</th>
                  <th className="px-4 py-2.5 text-right font-medium">Turns</th>
                  <th className="px-4 py-2.5 text-left font-medium">Function-call trace</th>
                </tr>
              </thead>
              <tbody>
                {snap.recent.map((s) => (
                  <tr key={s.id} className="border-b border-border last:border-b-0 align-top">
                    <td className="px-4 py-2.5 font-mono text-xs text-ink-dim whitespace-nowrap">
                      {timeOfDay(s.at)}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-ink-dim">
                      {s.channel ?? "voice"}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`rounded-full px-2.5 py-0.5 font-mono text-[11px] ${OUTCOME_STYLE[s.outcome]}`}
                      >
                        {s.outcome}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-ink-dim">
                      {duration(s.durationMs)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-ink-dim">
                      {s.callerTurns + s.agentTurns}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1.5">
                        {s.toolCalls.length === 0 && (
                          <span className="text-xs text-ink-muted italic">none</span>
                        )}
                        {s.toolCalls.map((c, i) => (
                          <span
                            key={i}
                            className={`rounded-md border px-1.5 py-0.5 font-mono text-[11px] ${
                              c.ok
                                ? "border-border text-ink-dim"
                                : "border-[var(--ember)] text-ember"
                            }`}
                            title={`${c.ms}ms`}
                          >
                            {c.name}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
