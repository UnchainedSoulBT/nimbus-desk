import type OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import { AGENT_INSTRUCTIONS, AGENT_TOOLS } from "./definition";
import { executeTool } from "./execute";
import { BillingSession } from "@/lib/billing/service";

/* Text-mode agent runner. Consumes the SAME agent definition (instructions +
 * tools) and the SAME tool executor + BillingSession as the voice channel, so
 * agent behavior never forks between channels. Both the eval harness and the
 * text-chat channel drive the agent through this one loop.
 *
 * The voice channel runs on gpt-realtime-2 (speech to speech); this runs the
 * identical prompt and tools on a text model, which is a faithful proxy for
 * everything that is not the audio path: the guardrails are enforced in the
 * billing service (model-independent), and the conversational policy lives in
 * the shared instructions. */

export interface AgentTurn {
  role: "caller" | "agent";
  text: string;
}

export interface ToolInvocation {
  name: string;
  args: Record<string, unknown>;
  ok: boolean;
  result: unknown;
}

export interface RunResult {
  transcript: AgentTurn[];
  toolCalls: ToolInvocation[];
  endedBy: "end_call" | "max_turns" | "caller_done";
  endOutcome?: string;
}

/** Produces the next caller utterance given the transcript so far, or null to hang up. */
export type Caller = (transcript: AgentTurn[]) => Promise<string | null>;

const CHAT_TOOLS: ChatCompletionTool[] = AGENT_TOOLS.map((t) => ({
  type: "function",
  function: { name: t.name, description: t.description, parameters: t.parameters },
}));

export interface RunOptions {
  caller: Caller;
  openai: OpenAI;
  model: string;
  maxCallerTurns?: number;
  maxToolRoundsPerTurn?: number;
  billing?: BillingSession;
  temperature?: number;
}

export async function runTextConversation(opts: RunOptions): Promise<RunResult> {
  const { caller, openai, model } = opts;
  const maxCallerTurns = opts.maxCallerTurns ?? 12;
  const maxToolRounds = opts.maxToolRoundsPerTurn ?? 6;
  const billing = opts.billing ?? new BillingSession();
  const temperature = opts.temperature ?? 0.4;

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: AGENT_INSTRUCTIONS },
  ];
  const transcript: AgentTurn[] = [];
  const toolCalls: ToolInvocation[] = [];
  let ended = false;
  let endOutcome: string | undefined;

  // One agent turn may span several tool round-trips before it speaks.
  const runAgentTurn = async (): Promise<void> => {
    for (let round = 0; round < maxToolRounds; round++) {
      const resp = await openai.chat.completions.create({
        model,
        messages,
        tools: CHAT_TOOLS,
        tool_choice: "auto",
        temperature,
      });
      const msg = resp.choices[0]?.message;
      if (!msg) return;
      messages.push(msg);
      if (msg.content && msg.content.trim()) {
        transcript.push({ role: "agent", text: msg.content.trim() });
      }
      if (!msg.tool_calls || msg.tool_calls.length === 0) return;

      for (const tc of msg.tool_calls) {
        if (tc.type !== "function") continue;
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.function.arguments || "{}");
        } catch {
          /* executor tolerates missing args */
        }
        const result = executeTool(billing, tc.function.name, args);
        toolCalls.push({
          name: tc.function.name,
          args,
          ok: result.ok,
          result: result.ok ? result.data : { error: result.error },
        });
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(result),
        });
        if (tc.function.name === "end_call") {
          ended = true;
          endOutcome = typeof args.outcome === "string" ? args.outcome : undefined;
        }
      }
      if (ended) return;
      // Loop so the model can speak in response to the tool results.
    }
  };

  // The agent greets first (the voice client nudges a response on connect).
  await runAgentTurn();
  if (ended) return { transcript, toolCalls, endedBy: "end_call", endOutcome };

  let endedBy: RunResult["endedBy"] = "max_turns";
  for (let turn = 0; turn < maxCallerTurns; turn++) {
    const userText = await caller(transcript);
    if (userText === null) {
      endedBy = "caller_done";
      break;
    }
    messages.push({ role: "user", content: userText });
    transcript.push({ role: "caller", text: userText });
    await runAgentTurn();
    if (ended) {
      endedBy = "end_call";
      break;
    }
  }

  return { transcript, toolCalls, endedBy, endOutcome };
}

/** A caller that plays a fixed list of lines, then hangs up. Deterministic on
 * the caller side, used by captured regression cases. */
export function scriptedCaller(lines: string[]): Caller {
  let i = 0;
  return async () => (i < lines.length ? lines[i++] : null);
}
