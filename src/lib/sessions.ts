/* Server-side session log. Privacy stance for a public demo: transcripts stay
 * in the caller's browser; only operational metadata lands here — the same
 * split a real deployment makes between media storage and metrics. In-memory
 * with the usual Vercel warm-instance tradeoff (cold start loses history,
 * never blocks traffic), matching the guardrail counters. */

export type SessionOutcome = "resolved" | "escalated" | "abandoned";

export interface ToolCallMeta {
  name: string;
  ok: boolean;
  ms: number;
}

export interface SessionRecord {
  id: string;
  at: number;
  durationMs: number;
  outcome: SessionOutcome;
  callerTurns: number;
  agentTurns: number;
  toolCalls: ToolCallMeta[];
}

const MAX_SESSIONS = 500;
const sessions: SessionRecord[] = [];
let counter = 0;

const OUTCOMES: SessionOutcome[] = ["resolved", "escalated", "abandoned"];

/** Validate an untrusted report from the browser; returns null if malformed. */
export function sanitizeReport(body: unknown): Omit<SessionRecord, "id" | "at"> | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  if (!OUTCOMES.includes(b.outcome as SessionOutcome)) return null;
  const durationMs = Number(b.durationMs);
  const callerTurns = Number(b.callerTurns);
  const agentTurns = Number(b.agentTurns);
  if (!Number.isFinite(durationMs) || durationMs < 0 || durationMs > 15 * 60_000) return null;
  if (!Number.isInteger(callerTurns) || callerTurns < 0 || callerTurns > 500) return null;
  if (!Number.isInteger(agentTurns) || agentTurns < 0 || agentTurns > 500) return null;
  const rawCalls = Array.isArray(b.toolCalls) ? b.toolCalls.slice(0, 60) : [];
  const toolCalls: ToolCallMeta[] = [];
  for (const c of rawCalls) {
    if (typeof c !== "object" || c === null) return null;
    const t = c as Record<string, unknown>;
    if (typeof t.name !== "string" || typeof t.ok !== "boolean") return null;
    const ms = Number(t.ms);
    toolCalls.push({
      name: t.name.slice(0, 40),
      ok: t.ok,
      ms: Number.isFinite(ms) ? Math.min(Math.max(Math.round(ms), 0), 60_000) : 0,
    });
  }
  return {
    durationMs: Math.round(durationMs),
    outcome: b.outcome as SessionOutcome,
    callerTurns,
    agentTurns,
    toolCalls,
  };
}

export function recordSession(report: Omit<SessionRecord, "id" | "at">): SessionRecord {
  const rec: SessionRecord = { id: `S-${++counter}`, at: Date.now(), ...report };
  sessions.push(rec);
  if (sessions.length > MAX_SESSIONS) sessions.splice(0, sessions.length - MAX_SESSIONS);
  return rec;
}

export interface OpsSnapshot {
  totals: {
    sessions: number;
    resolved: number;
    escalated: number;
    abandoned: number;
    toolCalls: number;
  };
  /** Resolved without human handoff, over sessions that reached an outcome. */
  containmentRate: number | null;
  /** Mean duration of resolved/escalated sessions, ms. */
  avgHandlingTimeMs: number | null;
  toolSuccessRate: number | null;
  avgToolLatencyMs: number | null;
  sessionsToday: number;
  recent: SessionRecord[];
}

export function opsSnapshot(): OpsSnapshot {
  const handled = sessions.filter((s) => s.outcome !== "abandoned");
  const resolved = sessions.filter((s) => s.outcome === "resolved").length;
  const escalated = sessions.filter((s) => s.outcome === "escalated").length;
  const allCalls = sessions.flatMap((s) => s.toolCalls);
  const okCalls = allCalls.filter((c) => c.ok).length;
  const dayStart = new Date().setUTCHours(0, 0, 0, 0);
  return {
    totals: {
      sessions: sessions.length,
      resolved,
      escalated,
      abandoned: sessions.length - resolved - escalated,
      toolCalls: allCalls.length,
    },
    containmentRate: handled.length ? resolved / handled.length : null,
    avgHandlingTimeMs: handled.length
      ? handled.reduce((a, s) => a + s.durationMs, 0) / handled.length
      : null,
    toolSuccessRate: allCalls.length ? okCalls / allCalls.length : null,
    avgToolLatencyMs: allCalls.length
      ? allCalls.reduce((a, c) => a + c.ms, 0) / allCalls.length
      : null,
    sessionsToday: sessions.filter((s) => s.at >= dayStart).length,
    recent: sessions.slice(-50).reverse(),
  };
}
