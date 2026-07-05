import type OpenAI from "openai";
import { runTextConversation, type Caller, type RunResult } from "@/lib/agent/text-runner";
import type { Assertion, AssertionResult } from "./assertions";

/* Orchestration: run one eval case (a caller against the shared agent) and
 * score it against its assertions. */

export interface EvalCase {
  id: string;
  title: string;
  kind: "live" | "captured";
  /** Builds the caller. Live cases use an LLM persona; captured cases replay
   * frozen lines. Both receive the client + caller model so either can run. */
  makeCaller: (openai: OpenAI, callerModel: string) => Caller;
  assertions: Assertion[];
  maxCallerTurns?: number;
}

export interface CaseOutcome {
  id: string;
  title: string;
  kind: EvalCase["kind"];
  passed: boolean;
  assertions: AssertionResult[];
  result: RunResult;
  error?: string;
}

export interface HarnessConfig {
  openai: OpenAI;
  agentModel: string;
  callerModel: string;
}

export async function runCase(c: EvalCase, cfg: HarnessConfig): Promise<CaseOutcome> {
  try {
    const result = await runTextConversation({
      caller: c.makeCaller(cfg.openai, cfg.callerModel),
      openai: cfg.openai,
      model: cfg.agentModel,
      maxCallerTurns: c.maxCallerTurns ?? 12,
    });
    const assertions: AssertionResult[] = [];
    for (const a of c.assertions) {
      assertions.push(await a(result));
    }
    return {
      id: c.id,
      title: c.title,
      kind: c.kind,
      passed: assertions.every((a) => a.pass),
      assertions,
      result,
    };
  } catch (err) {
    return {
      id: c.id,
      title: c.title,
      kind: c.kind,
      passed: false,
      assertions: [],
      result: { transcript: [], toolCalls: [], endedBy: "max_turns" },
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
