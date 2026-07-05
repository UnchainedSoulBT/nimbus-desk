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
 * agent behavior never forks between channels. TextAgentSession is the core:
 * the chat channel drives it one HTTP turn at a time, and the eval harness
 * drives it in a loop against simulated callers.
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
  ms: number;
}

/** What the agent did in response to one caller input. */
export interface StepResult {
  agentTexts: string[];
  toolCalls: ToolInvocation[];
  ended: boolean;
  endOutcome?: string;
}

const CHAT_TOOLS: ChatCompletionTool[] = AGENT_TOOLS.map((t) => ({
  type: "function",
  function: { name: t.name, description: t.description, parameters: t.parameters },
}));

export interface TextAgentOptions {
  openai: OpenAI;
  model: string;
  maxToolRoundsPerTurn?: number;
  temperature?: number;
  billing?: BillingSession;
}

export class TextAgentSession {
  private readonly openai: OpenAI;
  private readonly model: string;
  private readonly maxToolRounds: number;
  private readonly temperature: number;
  private readonly messages: ChatCompletionMessageParam[];
  readonly billing: BillingSession;
  ended = false;
  endOutcome?: string;

  constructor(opts: TextAgentOptions) {
    this.openai = opts.openai;
    this.model = opts.model;
    this.maxToolRounds = opts.maxToolRoundsPerTurn ?? 6;
    this.temperature = opts.temperature ?? 0.4;
    this.billing = opts.billing ?? new BillingSession();
    this.messages = [{ role: "system", content: AGENT_INSTRUCTIONS }];
  }

  /** The agent opens the conversation (mirrors the voice client's nudge). */
  greet(): Promise<StepResult> {
    return this.runAgentTurn();
  }

  async send(userText: string): Promise<StepResult> {
    this.messages.push({ role: "user", content: userText });
    return this.runAgentTurn();
  }

  /** One agent turn, possibly spanning several tool round-trips. */
  private async runAgentTurn(): Promise<StepResult> {
    const step: StepResult = { agentTexts: [], toolCalls: [], ended: false };
    for (let round = 0; round < this.maxToolRounds; round++) {
      const resp = await this.openai.chat.completions.create({
        model: this.model,
        messages: this.messages,
        tools: CHAT_TOOLS,
        tool_choice: "auto",
        temperature: this.temperature,
      });
      const msg = resp.choices[0]?.message;
      if (!msg) break;
      this.messages.push(msg);
      if (msg.content && msg.content.trim()) {
        step.agentTexts.push(msg.content.trim());
      }
      if (!msg.tool_calls || msg.tool_calls.length === 0) break;

      for (const tc of msg.tool_calls) {
        if (tc.type !== "function") continue;
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.function.arguments || "{}");
        } catch {
          /* executor tolerates missing args */
        }
        const t0 = performance.now();
        const result = executeTool(this.billing, tc.function.name, args);
        const ms = Math.max(1, Math.round(performance.now() - t0));
        step.toolCalls.push({
          name: tc.function.name,
          args,
          ok: result.ok,
          result: result.ok ? result.data : { error: result.error },
          ms,
        });
        this.messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(result),
        });
        if (tc.function.name === "end_call") {
          this.ended = true;
          this.endOutcome = typeof args.outcome === "string" ? args.outcome : undefined;
        }
      }
      if (this.ended) break;
      // Loop so the model can speak in response to the tool results.
    }
    step.ended = this.ended;
    step.endOutcome = this.endOutcome;
    return step;
  }
}

/* ---------- conversation loop used by the eval harness ---------- */

export interface RunResult {
  transcript: AgentTurn[];
  toolCalls: ToolInvocation[];
  endedBy: "end_call" | "max_turns" | "caller_done";
  endOutcome?: string;
}

/** Produces the next caller utterance given the transcript so far, or null to hang up. */
export type Caller = (transcript: AgentTurn[]) => Promise<string | null>;

export interface RunOptions extends TextAgentOptions {
  caller: Caller;
  maxCallerTurns?: number;
}

export async function runTextConversation(opts: RunOptions): Promise<RunResult> {
  const session = new TextAgentSession(opts);
  const maxCallerTurns = opts.maxCallerTurns ?? 12;
  const transcript: AgentTurn[] = [];
  const toolCalls: ToolInvocation[] = [];

  const absorb = (step: StepResult) => {
    for (const t of step.agentTexts) transcript.push({ role: "agent", text: t });
    toolCalls.push(...step.toolCalls);
  };

  absorb(await session.greet());
  if (session.ended) {
    return { transcript, toolCalls, endedBy: "end_call", endOutcome: session.endOutcome };
  }

  let endedBy: RunResult["endedBy"] = "max_turns";
  for (let turn = 0; turn < maxCallerTurns; turn++) {
    const userText = await opts.caller(transcript);
    if (userText === null) {
      endedBy = "caller_done";
      break;
    }
    transcript.push({ role: "caller", text: userText });
    absorb(await session.send(userText));
    if (session.ended) {
      endedBy = "end_call";
      break;
    }
  }

  return { transcript, toolCalls, endedBy, endOutcome: session.endOutcome };
}

/** A caller that plays a fixed list of lines, then hangs up. Deterministic on
 * the caller side, used by captured regression cases. */
export function scriptedCaller(lines: string[]): Caller {
  let i = 0;
  return async () => (i < lines.length ? lines[i++] : null);
}
