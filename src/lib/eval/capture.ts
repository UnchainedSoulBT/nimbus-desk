import type { RunResult } from "@/lib/agent/text-runner";

/* The flywheel step: turn a failure into a permanent regression case. Given a
 * finished conversation that broke an assertion, freeze the caller's lines and
 * emit a captured-case definition. In production the trigger is a logged bad
 * session; here it converts any RunResult (a failing eval, or a replayed
 * incident) into a deterministic replay case you drop into cases.ts. */

export interface CapturedCaseSpec {
  id: string;
  title: string;
  kind: "captured";
  callerLines: string[];
  assertions: string[];
}

export function captureFailureAsCase(
  result: RunResult,
  opts: { id: string; title: string; failedAssertions: string[] },
): CapturedCaseSpec {
  const callerLines = result.transcript
    .filter((t) => t.role === "caller")
    .map((t) => t.text);
  return {
    id: opts.id,
    title: opts.title,
    kind: "captured",
    callerLines,
    assertions: opts.failedAssertions,
  };
}

/** Render a captured spec as pasteable TypeScript for cases.ts. */
export function renderCapturedCase(spec: CapturedCaseSpec): string {
  const lines = spec.callerLines.map((l) => `    ${JSON.stringify(l)},`).join("\n");
  const asserts = spec.assertions.map((a) => `    ${a},`).join("\n");
  return `captured(
  ${JSON.stringify(spec.id)},
  ${JSON.stringify(spec.title)},
  [
${lines}
  ],
  [
${asserts}
  ],
),`;
}
