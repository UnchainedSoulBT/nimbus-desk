# Nimbus Desk

A browser-based voice AI support agent for Nimbus Telecom, a fictional mobile operator. A visitor clicks **Start a call**, talks to the agent about a confusing charge, and watches it resolve the dispute through live function calls against a billing system: identity verification, bill lookup, a plain-language explanation, a goodwill credit within a hard authority limit, and a written summary. Anything off-script hands off to a human queue with a structured case summary.

The same agent also runs a [text-chat channel](/chat) and an eval harness: three surfaces, one agent definition.

Built as a deployment, not a demo: there is a problem, an agent design, integrations, guardrails, and measured outcomes on an [operations dashboard](/ops).

## The problem

Telecom billing disputes are high-volume, low-complexity, and emotionally charged: a customer sees a roaming charge they do not understand and calls support. Most of these calls need three things a machine does well when it is wired to real systems: verify who is calling, read the actual bill, and apply a bounded remedy. The interesting engineering is not the voice. It is the integration surface and the failure handling.

## Agent design

One TypeScript module ([src/lib/agent/definition.ts](src/lib/agent/definition.ts)) is the single source of truth for the agent: the instructions and seven typed tool definitions. Every channel consumes it, so behavior never forks between voice, chat, and the eval harness.

The tools, executed against a mock billing service:

| Tool | What it does | Guard |
|---|---|---|
| `verify_identity` | Match caller to account | Exact last-4 digits, fuzzy name (see below) |
| `get_bill` | Current invoice with line items | Refuses before identity is verified |
| `explain_charge` | Billing system's detail for one line item | Identity gate |
| `apply_credit` | One-time goodwill credit | Hard 20 EUR authority limit, enforced in code |
| `send_summary_email` | Written summary to email on file (mocked) | Identity gate |
| `escalate_to_human` | Human queue + structured case summary | Terminal: no account actions afterward |
| `end_call` | Hang up after goodbye, escalation, or silence | Client drops the connection |

The policy that matters is enforced in the service layer, not the prompt. The model can ask for a 50 EUR credit all it wants; the billing system declines it.

## Architecture

```
 Browser ──────────────── WebRTC audio + data channel ─────────────── OpenAI Realtime API
   │  mic in, agent audio out                                          gpt-realtime-2, cedar voice,
   │  live transcript (both sides)                                     semantic VAD, input transcription
   │  executes tool calls locally, renders the timeline
   │
   │  POST /api/realtime/token           POST /api/sessions
   ▼                                       ▼
 Next.js server ── mints 60s ephemeral client secrets (the real key never ships)
                ── per-IP and global daily session caps, fail closed
                ── session log: outcome, duration, turns, tool latencies → /ops
```

- **Key security:** `OPENAI_API_KEY` lives only in the server environment. The browser receives a 60-second ephemeral client secret minted by [the token route](src/app/api/realtime/token/route.ts); session config (model, voice, instructions, tools) is baked into the secret server-side.
- **Cost guardrails:** calls hard-cap at 3 minutes with a visible countdown; per-IP daily cap, global daily cap, and a reconnect cooldown protect a public demo's token budget. Every guard fails closed with honest copy ("the demo is asleep").
- **Privacy split:** transcripts stay in the caller's browser. The server logs operational metadata only (outcome, duration, turn counts, tool names and latencies), which is what powers [/ops](src/app/ops/page.tsx): containment rate, average handling time, tool success rate, sessions per day.

## Design decisions

Every mechanism is a choice with a reason and an accepted tradeoff. The ones that matter:

| Decision | Why | Tradeoff accepted |
|---|---|---|
| **Telecom billing dispute** as the scenario | Identity, account data, a bounded remedy, a human fallback: every step of a real deployment, each verifiable through a tool call, resolvable in a 90-second demo. It also generalizes transaction-investigation work beyond crypto. | A fictional operator; the billing system is a mock. |
| **Speech-to-speech (Realtime API)** over a cascaded STT to LLM to TTS pipeline | Every hop in a cascade adds latency, and barge-in needs custom engineering. Realtime gives sub-second turns and native interruption handling. | Less per-stage control and observability, higher price per minute. The caps bound the cost; the text-mode eval restores the testability. |
| **WebRTC + ephemeral client secrets** | The real key never ships to the browser. The secret expires in 60 seconds and only gates starting a call. Browsers also bring echo cancellation and jitter buffering for free. | Session duration is enforced client-side plus by caps, not by the token itself. |
| **A model per task**: gpt-realtime-2 for voice, gpt-4.1-mini for chat, eval personas, and the judge | The small model passed all 26 behavioral assertions; paying for a larger one there buys nothing. Voice uses the cedar voice for a warm, professional register. Right-sizing per task is the habit that scales to real deployments. | Chat and voice run on different models. Acceptable because policy is enforced in code, and each model is one env var to swap. |
| **Policy in code, prompt as UX** | The eval caught the escalation-terminality rule holding "most of the time" when it lived only in the prompt. Most of the time is not a policy. The credit cap, identity gate, and escalation terminality are enforced in the billing service. | The prompt still matters for tone and flow; it is just not the enforcement layer. |
| **Caps on everything, failing closed** | Realtime audio is the most expensive API surface there is, on a public URL. 3-minute calls with a visible countdown, per-IP daily allowance, global daily budget, reconnect cooldown. Every guard returns honest copy instead of a broken page. | A determined visitor is capped, not blocked forever. Fine for a demo. |
| **Transcripts stay in the browser** | The ops dashboard needs outcomes, durations, and tool latencies, not caller speech. The split keeps a public /ops safe and mirrors how real deployments separate media from telemetry. | No transcript replay for debugging; tool traces carry the operational story. |
| **In-memory state** (caps, sessions, chats) | Zero infrastructure for a stateless demo. Cold starts lose history and reset counters, which only ever errs toward allowing traffic. | A real deployment puts this behind Redis or Postgres. Known, named, and cheap to swap. |
| **Pure-TypeScript mock billing** | The same service class runs in the browser (voice executes tools client-side), in Node (chat and eval), and in tests, with no I/O layer to fake. | An in-memory mock resets per session. That is also what makes it safe to expose publicly. |
| **One agent definition, three surfaces** | Voice, chat, and eval consume a single module of instructions and tools, so behavior cannot fork between channels, and a fix lands everywhere at once. | Channel-specific tuning happens in instructions shared by all channels, so wording must work for both speech and text. |
| **LLM-persona evals with tool-log assertions** | Personas apply realistic multi-turn pressure; assertions read the tool-call log so security and policy checks stay deterministic despite model nondeterminism. An LLM judge covers only what the log cannot show. | Persona runs cost a few cents and vary in wording. The invariants are what gate the build. |

## Every failure becomes a test

The first live call failed. The caller said "Maya **Fischer**", the speech model transcribed "Maya **Fisher**", and exact-match verification refused a legitimate customer twice, then escalated. Correct guard behavior, wrong matcher: never exact-match ASR output.

The fix went into the integration layer, not the prompt: exact match on the account digits (the credential), edit-distance tolerance on the spoken name, scaled to name length so "Maia Fisher" verifies but "Dan Peretz" with someone else's digits does not. It shipped with a nine-case regression test. The second live call surfaced two more: the agent had no way to hang up (it narrated the caller's breathing for a minute of paid audio), and it applied a credit *after* escalating the case to a human. Both became policy: an `end_call` tool, and escalation as a terminal state.

That loop, production failure to fix at the right layer to regression case, is the working method this repo is meant to demonstrate.

## Run locally

```bash
pnpm install
cp .env.example .env.local   # paste your OpenAI API key
pnpm dev
```

Open http://localhost:3000, allow the microphone, and start a call. Seeded accounts to verify against: **Maya Fischer / 2210**, **Daniel Peretz / 7355**, **Sofia Marino / 0088**. Session caps are disabled outside production builds.

### Environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `OPENAI_API_KEY` | yes | none | Server-side only; mints ephemeral client secrets |
| `OPENAI_REALTIME_MODEL` | no | `gpt-realtime-2` | Realtime model override |
| `NIMBUS_SESSION_SECONDS` | no | `180` | Hard per-call time cap |
| `NIMBUS_DAILY_SESSION_CAP` | no | `60` | Global sessions/day before the demo sleeps |
| `NIMBUS_PER_IP_DAILY_CAP` | no | `6` | Sessions per IP per day |

## Deploy

Vercel, zero config: import the repo, set `OPENAI_API_KEY`, deploy. The in-memory caps and session log reset on cold starts, which only ever errs toward allowing traffic and losing history, the accepted tradeoff for a stateless demo (a real deployment would put both behind Redis/Postgres).

## Eval harness

```bash
pnpm eval                      # full corpus
pnpm eval --captured-only      # just the deterministic regression cases
pnpm eval --case golden-path   # one case
```

The harness runs the **same agent definition and tool executor** the voice channel uses, in text mode, against a corpus of adversarial conversations, then prints a pass/fail scorecard (nonzero exit on failure, so it gates CI). This is the piece that separates a deployment from a demo: it measures whether the agent's policy actually holds under pressure.

- **LLM-simulated callers.** Each live case is a persona with a hidden goal (angry-wants-50, wants-to-cancel, rushed-skips-verification, mismatched-identity) that an LLM plays, conversing multi-turn with the agent. "Simulate at scale," not hand-scripted lines.
- **Invariant assertions.** The security- and policy-critical checks read only the tool-call log, so they are deterministic despite model nondeterminism: identity gates account data, credit never exceeds the 20 EUR authority, escalation fires with the right reason, escalation is terminal for account actions, off-topic requests get refused (LLM-judged).
- **The flywheel.** A failure becomes a permanent regression. The `regression-escalation-then-credit` case is real: it is the exact bug from the second live voice call (the agent applied a credit after handing off to a human), frozen as replayed caller lines plus the assertion that would have caught it. [capture.ts](src/lib/eval/capture.ts) turns any failing conversation into a new case.

```
Nimbus Desk - agent eval
agent: gpt-4.1-mini   caller/judge: gpt-4.1-mini   cases: 8

 PASS  golden-path      Roaming dispute, accepts a goodwill credit
 PASS  angry-fifty      Demands a 50 EUR credit, beyond authority
 PASS  cancel-contract  Wants to cancel the contract (out of scope)
 ...
PASS  8/8 cases · 24/24 assertions
```

The eval runs on a text model (`gpt-4.1-mini` by default; `--agent-model gpt-4.1` for a stricter run) as a faithful proxy for the voice agent minus the audio path: the guardrails are enforced in the billing service and are model-independent, and the conversational policy lives in the shared instructions both channels read.

## Text-chat channel

`/chat` runs the same agent in writing: [/api/chat](src/app/api/chat/route.ts) drives one `TextAgentSession` per conversation server-side: same instructions, same tools, same billing service, same guardrails, same tool-call timeline in the UI. Chat sessions land in the same ops log with a `channel: chat` tag, so /ops shows voice and chat side by side. The voice page offers chat as the fallback for every failure state (mic denied, caps reached, API down).

Building it immediately paid for itself: the first chat test showed the agent re-asking for identity details the caller had already volunteered. The instruction fix shipped with a frozen regression case (`regression-upfront-identity`). And an intermittent eval failure revealed that "escalation is terminal" was enforced only in the prompt, where the model obeyed it *most* of the time. It is now enforced in the billing service, like the credit cap: policy in code, prompt as UX.

Built by [Ben Tal Mizrahi](https://trbt.cloud). MIT.
