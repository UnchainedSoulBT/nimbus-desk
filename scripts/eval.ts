import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import OpenAI from "openai";
import { buildCases } from "@/lib/eval/cases";
import { runCase, type CaseOutcome, type HarnessConfig } from "@/lib/eval/harness";

/* `pnpm eval` — runs the agent-eval corpus and prints a scorecard.
 *
 * Tests the shared agent definition (prompt + tools + guardrails) in text mode,
 * a faithful proxy for the voice agent minus the audio path. Usage:
 *   pnpm eval                      run everything
 *   pnpm eval --case golden-path   run one case
 *   pnpm eval --captured-only      only the deterministic regression cases
 *   pnpm eval --live-only          only the LLM-persona cases
 *   pnpm eval --agent-model gpt-5  override the agent-under-test model
 */

function loadEnv(): void {
  for (const file of [".env.local", ".env"]) {
    try {
      const text = readFileSync(resolve(process.cwd(), file), "utf8");
      for (const raw of text.split("\n")) {
        const line = raw.trim();
        if (!line || line.startsWith("#")) continue;
        const eq = line.indexOf("=");
        if (eq === -1) continue;
        const key = line.slice(0, eq).trim();
        let val = line.slice(eq + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!(key in process.env)) process.env[key] = val;
      }
    } catch {
      /* file optional */
    }
  }
}

interface Args {
  case?: string;
  liveOnly: boolean;
  capturedOnly: boolean;
  agentModel: string;
  callerModel: string;
  concurrency: number;
}

function parseArgs(argv: string[]): Args {
  const a: Args = {
    liveOnly: false,
    capturedOnly: false,
    agentModel: process.env.OPENAI_EVAL_MODEL || "gpt-4.1-mini",
    callerModel: process.env.OPENAI_EVAL_CALLER_MODEL || "gpt-4.1-mini",
    // gpt-4.1-mini has a 200k TPM limit, so a few concurrent runs are safe.
    // For a stricter agent-under-test (gpt-4.1, 30k TPM), pass --concurrency 1.
    concurrency: Number(process.env.OPENAI_EVAL_CONCURRENCY || 3),
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--case") a.case = argv[++i];
    else if (arg === "--live-only") a.liveOnly = true;
    else if (arg === "--captured-only") a.capturedOnly = true;
    else if (arg === "--agent-model") a.agentModel = argv[++i];
    else if (arg === "--caller-model") a.callerModel = argv[++i];
    else if (arg === "--concurrency") a.concurrency = Number(argv[++i]);
  }
  return a;
}

const useColor = process.stdout.isTTY;
const c = (code: string, s: string) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
const green = (s: string) => c("32", s);
const red = (s: string) => c("31", s);
const dim = (s: string) => c("2", s);
const bold = (s: string) => c("1", s);

async function pool<T, R>(items: T[], n: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}

async function main() {
  loadEnv();
  const args = parseArgs(process.argv.slice(2));
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error(red("OPENAI_API_KEY is not set. Add it to .env.local (see .env.example)."));
    process.exit(2);
  }

  // High retry budget so transient 429s (rate limits) wait out their
  // Retry-After window and self-heal instead of failing the case.
  const openai = new OpenAI({ apiKey, maxRetries: 8 });
  const cfg: HarnessConfig = {
    openai,
    agentModel: args.agentModel,
    callerModel: args.callerModel,
  };

  let cases = buildCases(openai, args.callerModel);
  if (args.case) cases = cases.filter((x) => x.id === args.case);
  if (args.liveOnly) cases = cases.filter((x) => x.kind === "live");
  if (args.capturedOnly) cases = cases.filter((x) => x.kind === "captured");
  if (cases.length === 0) {
    console.error(red("No cases match that filter."));
    process.exit(2);
  }

  console.log(bold("\nNimbus Desk — agent eval"));
  console.log(
    dim(
      `agent: ${args.agentModel}   caller/judge: ${args.callerModel}   cases: ${cases.length}\n`,
    ),
  );

  const started = Date.now();
  const outcomes = await pool<(typeof cases)[number], CaseOutcome>(cases, args.concurrency, (x) =>
    runCase(x, cfg),
  );
  const elapsed = Math.round((Date.now() - started) / 1000);

  let passedCases = 0;
  let totalAssertions = 0;
  let passedAssertions = 0;

  for (const o of outcomes) {
    if (o.passed) passedCases++;
    const tag = o.passed ? green(" PASS ") : red(" FAIL ");
    const kind = o.kind === "captured" ? dim(" [regression]") : "";
    console.log(`${tag} ${bold(o.id.padEnd(30))} ${o.title}${kind}`);
    if (o.error) {
      console.log(`       ${red("error:")} ${o.error}`);
    }
    for (const a of o.assertions) {
      totalAssertions++;
      if (a.pass) passedAssertions++;
      const mark = a.pass ? green("✓") : red("✗");
      const detail = a.pass ? dim(a.detail) : red(a.detail);
      console.log(`         ${mark} ${a.name} ${dim("—")} ${detail}`);
    }
  }

  const allPass = passedCases === outcomes.length;
  console.log(
    "\n" +
      (allPass ? green(bold("PASS")) : red(bold("FAIL"))) +
      `  ${passedCases}/${outcomes.length} cases · ${passedAssertions}/${totalAssertions} assertions · ${elapsed}s\n`,
  );
  process.exit(allPass ? 0 : 1);
}

main().catch((err) => {
  console.error(red("eval crashed:"), err);
  process.exit(2);
});
