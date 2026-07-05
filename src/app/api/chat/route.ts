import OpenAI from "openai";
import { randomUUID } from "node:crypto";
import { TextAgentSession, type StepResult } from "@/lib/agent/text-runner";
import { clientIp } from "@/lib/guardrails";
import { recordSession } from "@/lib/sessions";

/* The text-chat channel. Same agent definition, same tool executor, same
 * billing service as the voice channel — driven one HTTP turn at a time
 * through TextAgentSession. Server-side session store keyed by an opaque id;
 * in-memory with the same warm-instance tradeoff as the rest of the demo
 * (a cold start ends the chat, the client shows a friendly restart). */

const MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-4.1-mini";
const MAX_MESSAGE_CHARS = 300;
const MAX_TURNS_PER_CHAT = 30;
const CHAT_TTL_MS = 15 * 60_000;
const MAX_LIVE_CHATS = 200;

// Chat burns far fewer tokens than voice, so limits are per-message: a token
// bucket per IP plus a global daily message cap. Dev bypasses, prod fails closed.
const BUCKET_CAPACITY = 8;
const REFILL_PER_MS = 10 / 60_000; // 10 messages/min
const DAILY_MESSAGE_CAP = Number(process.env.NIMBUS_DAILY_CHAT_CAP ?? 1500);

interface ChatState {
  agent: TextAgentSession;
  startedAt: number;
  lastActive: number;
  callerTurns: number;
  agentTurns: number;
  toolMeta: { name: string; ok: boolean; ms: number }[];
  escalated: boolean;
  resolvedSignal: boolean;
  reported: boolean;
}

const chats = new Map<string, ChatState>();
const buckets = new Map<string, { tokens: number; at: number }>();
let dailyCount = 0;
let dailyDay = "";

function allowMessage(ip: string): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  const today = new Date().toISOString().slice(0, 10);
  if (today !== dailyDay) {
    dailyDay = today;
    dailyCount = 0;
  }
  if (++dailyCount > DAILY_MESSAGE_CAP) return false;
  const now = Date.now();
  const b = buckets.get(ip) ?? { tokens: BUCKET_CAPACITY, at: now };
  b.tokens = Math.min(BUCKET_CAPACITY, b.tokens + (now - b.at) * REFILL_PER_MS);
  b.at = now;
  if (b.tokens < 1) {
    buckets.set(ip, b);
    return false;
  }
  b.tokens -= 1;
  buckets.set(ip, b);
  if (buckets.size > 5000) buckets.clear();
  return true;
}

function sweep(): void {
  const now = Date.now();
  for (const [id, s] of chats) {
    if (now - s.lastActive > CHAT_TTL_MS) {
      finishChat(id, s);
    }
  }
  // Hard cap: drop oldest if a burst of chats piles up.
  if (chats.size > MAX_LIVE_CHATS) {
    const oldest = [...chats.entries()].sort((a, b) => a[1].lastActive - b[1].lastActive);
    for (const [id, s] of oldest.slice(0, chats.size - MAX_LIVE_CHATS)) {
      finishChat(id, s);
    }
  }
}

/** Log the chat to the ops session store and forget it. */
function finishChat(id: string, s: ChatState): void {
  chats.delete(id);
  if (s.reported) return;
  s.reported = true;
  const outcome = s.escalated
    ? "escalated"
    : s.agent.endOutcome === "resolved" || s.resolvedSignal
      ? "resolved"
      : "abandoned";
  recordSession({
    channel: "chat",
    durationMs: s.lastActive - s.startedAt,
    outcome,
    callerTurns: s.callerTurns,
    agentTurns: s.agentTurns,
    toolCalls: s.toolMeta.slice(0, 60),
  });
}

function absorb(s: ChatState, step: StepResult): void {
  s.agentTurns += step.agentTexts.length;
  for (const c of step.toolCalls) {
    s.toolMeta.push({ name: c.name, ok: c.ok, ms: c.ms });
    if (c.name === "escalate_to_human" && c.ok) s.escalated = true;
    if ((c.name === "apply_credit" || c.name === "send_summary_email") && c.ok) {
      s.resolvedSignal = true;
    }
  }
}

interface ChatResponse {
  chatId: string;
  agentTexts: string[];
  toolCalls: { name: string; args: unknown; result: unknown; ok: boolean; ms: number }[];
  ended: boolean;
}

function toResponse(chatId: string, step: StepResult): ChatResponse {
  return {
    chatId,
    agentTexts: step.agentTexts,
    toolCalls: step.toolCalls.map((c) => ({
      name: c.name,
      args: c.args,
      result: c.result,
      ok: c.ok,
      ms: c.ms,
    })),
    ended: step.ended,
  };
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "not_configured" }, { status: 503 });
  }
  if (!allowMessage(clientIp(request))) {
    return Response.json({ error: "rate_limited" }, { status: 429 });
  }

  let body: { chatId?: unknown; message?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  sweep();

  try {
    // New chat: create the session and let the agent greet.
    if (!body.chatId) {
      const openai = new OpenAI({ apiKey, maxRetries: 4 });
      const agent = new TextAgentSession({ openai, model: MODEL });
      const id = randomUUID();
      const state: ChatState = {
        agent,
        startedAt: Date.now(),
        lastActive: Date.now(),
        callerTurns: 0,
        agentTurns: 0,
        toolMeta: [],
        escalated: false,
        resolvedSignal: false,
        reported: false,
      };
      const step = await agent.greet();
      absorb(state, step);
      state.lastActive = Date.now();
      if (step.ended) {
        finishChat(id, state);
      } else {
        chats.set(id, state);
      }
      return Response.json(toResponse(id, step), { headers: { "Cache-Control": "no-store" } });
    }

    // Existing chat: one caller turn.
    if (typeof body.chatId !== "string" || typeof body.message !== "string") {
      return Response.json({ error: "bad_request" }, { status: 400 });
    }
    const message = body.message.trim().slice(0, MAX_MESSAGE_CHARS);
    if (!message) {
      return Response.json({ error: "bad_request" }, { status: 400 });
    }
    const state = chats.get(body.chatId);
    if (!state || state.agent.ended) {
      return Response.json({ error: "chat_expired" }, { status: 410 });
    }
    if (state.callerTurns >= MAX_TURNS_PER_CHAT) {
      finishChat(body.chatId, state);
      return Response.json({ error: "chat_expired" }, { status: 410 });
    }

    state.callerTurns += 1;
    const step = await state.agent.send(message);
    absorb(state, step);
    state.lastActive = Date.now();
    if (step.ended) {
      finishChat(body.chatId, state);
    }
    return Response.json(toResponse(body.chatId, step), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("chat route failed", err);
    return Response.json({ error: "upstream_error" }, { status: 502 });
  }
}
