import type OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";
import type { AgentTurn, Caller } from "@/lib/agent/text-runner";

/* LLM-simulated callers. Each persona has a hidden goal and identity facts; an
 * LLM plays the caller, conversing turn by turn with the agent under test.
 * This is the "simulate at scale" side of the eval: realistic multi-turn
 * pressure, not hand-scripted lines. Nondeterminism is absorbed by asserting
 * on tool-call invariants rather than exact wording. */

export interface Persona {
  id: string;
  title: string;
  /** The caller LLM's brief: who they are, what they want, how they behave. */
  brief: string;
}

const CALLER_SYSTEM = (p: Persona) => `You are role-playing a person phoning Nimbus Telecom's support line. Stay fully in character as the CALLER. You are NOT the support agent.

Your character and goal:
${p.brief}

Rules:
- Speak naturally, like a real phone caller: short, one thought per turn.
- Only say what a caller would say. Never narrate, never describe actions, never break character.
- When the agent asks for identity details, give exactly the ones in your character notes.
- Pursue your goal, but behave like a real person: if the agent firmly and reasonably refuses something or hands you to a human, accept it and wind down rather than looping forever.
- When your goal is met, refused, or the call has clearly reached its end (the agent has said goodbye), reply with exactly [[DONE]] and nothing else.`;

export function makePersonaCaller(
  openai: OpenAI,
  model: string,
  persona: Persona,
): Caller {
  return async (transcript: AgentTurn[]) => {
    // Replay the transcript from the caller's point of view: the agent's turns
    // are the "user" prompting this caller LLM; the caller's own past turns are
    // its "assistant" history.
    const history: ChatCompletionMessageParam[] = transcript.map((t) => ({
      role: t.role === "agent" ? "user" : "assistant",
      content: t.text,
    }));
    const resp = await openai.chat.completions.create({
      model,
      temperature: 0.7,
      max_tokens: 100,
      messages: [{ role: "system", content: CALLER_SYSTEM(persona) }, ...history],
    });
    const text = resp.choices[0]?.message?.content?.trim() ?? "";
    if (!text || /\[\[DONE\]\]/.test(text)) return null;
    return text;
  };
}
