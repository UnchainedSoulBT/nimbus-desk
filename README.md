# Nimbus Desk

A browser-based voice AI support agent for Nimbus Telecom, a fictional mobile operator. A visitor clicks **Start a call**, talks to the agent about a confusing charge, and watches it resolve the dispute through live function calls against a billing system: identity verification, bill lookup, a plain-language explanation, a goodwill credit within a hard authority limit, and a written summary. Anything off-script hands off to a human queue with a structured case summary.

Built as a deployment, not a demo: there is a problem, an agent design, integrations, guardrails, and measured outcomes on an [operations dashboard](/ops).

## The problem

Telecom billing disputes are high-volume, low-complexity, and emotionally charged: a customer sees a roaming charge they do not understand and calls support. Most of these calls need three things a machine does well when it is wired to real systems: verify who is calling, read the actual bill, and apply a bounded remedy. The interesting engineering is not the voice. It is the integration surface and the failure handling.

## Agent design

One TypeScript module ([src/lib/agent/definition.ts](src/lib/agent/definition.ts)) is the single source of truth for the agent: the instructions and seven typed tool definitions. Every channel consumes it, so behavior never forks between voice, evals, and a future text channel.

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
- **Privacy split:** transcripts stay in the caller's browser. The server logs operational metadata only — outcome, duration, turn counts, tool names/latencies — which is what powers [/ops](src/app/ops/page.tsx): containment rate, average handling time, tool success rate, sessions per day.

## Every failure becomes a test

The first live call failed. The caller said "Maya **Fischer**", the speech model transcribed "Maya **Fisher**", and exact-match verification refused a legitimate customer twice, then escalated. Correct guard behavior, wrong matcher: never exact-match ASR output.

The fix went into the integration layer, not the prompt — exact match on the account digits (the credential), edit-distance tolerance on the spoken name, scaled to name length so "Maia Fisher" verifies but "Dan Peretz" with someone else's digits does not. It shipped with a nine-case regression test. The second live call surfaced two more: the agent had no way to hang up (it narrated the caller's breathing for a minute of paid audio), and it applied a credit *after* escalating the case to a human. Both became policy: an `end_call` tool, and escalation as a terminal state.

That loop — production failure → fix at the right layer → regression case — is the working method this repo is meant to demonstrate.

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
| `OPENAI_API_KEY` | yes | — | Server-side only; mints ephemeral client secrets |
| `OPENAI_REALTIME_MODEL` | no | `gpt-realtime-2` | Realtime model override |
| `NIMBUS_SESSION_SECONDS` | no | `180` | Hard per-call time cap |
| `NIMBUS_DAILY_SESSION_CAP` | no | `60` | Global sessions/day before the demo sleeps |
| `NIMBUS_PER_IP_DAILY_CAP` | no | `6` | Sessions per IP per day |

## Deploy

Vercel, zero config: import the repo, set `OPENAI_API_KEY`, deploy. The in-memory caps and session log reset on cold starts, which only ever errs toward allowing traffic and losing history — the accepted tradeoff for a stateless demo (a real deployment would put both behind Redis/Postgres).

## Roadmap

- **Eval harness** (`pnpm eval`): scripted conversations in text mode against the same agent definition and tool executor, scored by deterministic assertions (identity before data, credit cap, escalation terminality) plus an LLM judge, with a capture path that turns a logged bad session into a new regression case.
- **Text chat channel** from the same agent definition — one agent, two channels.

Built by [Ben Tal Mizrahi](https://trbt.cloud). MIT.
