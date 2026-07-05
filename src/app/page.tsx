import { VoiceSession } from "@/components/VoiceSession";

export default function Home() {
  return (
    <main className="min-h-screen grid-bg">
      <div className="mx-auto max-w-5xl px-6 py-14 sm:py-20">
        <header className="mb-12">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-ink-muted mb-4">
            Live deployment demo · voice channel
          </p>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-ink">
            Nimbus Desk
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-ink-dim">
            A voice support agent for Nimbus Telecom, a fictional mobile operator.
            Call it about a confusing charge. It verifies who you are, pulls your
            bill, explains the line item, and applies a goodwill credit, all
            through function calls you can watch happen on the right.
          </p>
          <div className="mt-5 flex flex-wrap gap-2 font-mono text-[11px] text-ink-muted">
            {[
              "OpenAI Realtime API",
              "WebRTC",
              "Next.js + TypeScript",
              "7 tools, mock billing system",
              "3 min cap",
            ].map((chip) => (
              <span key={chip} className="rounded-full border border-border px-3 py-1 bg-bg-inset">
                {chip}
              </span>
            ))}
          </div>
        </header>

        <VoiceSession />

        <p className="mt-3 text-sm text-ink-muted">
          Prefer typing, or no mic handy?{" "}
          <a href="/chat" className="text-ember underline underline-offset-4">
            The same agent runs a text channel
          </a>
          . One agent definition, two channels.
        </p>

        <section className="mt-12 grid gap-4 sm:grid-cols-3 text-sm text-ink-dim">
          <div className="panel p-5">
            <h2 className="font-mono text-xs uppercase tracking-widest text-ink-muted mb-2">
              Try the golden path
            </h2>
            <p>
              Say a charge on your bill looks wrong. When asked, verify as{" "}
              <span className="font-mono text-ink">Maya Fischer</span>, account ending{" "}
              <span className="font-mono text-ink">2210</span>. Ask about the roaming charge.
            </p>
          </div>
          <div className="panel p-5">
            <h2 className="font-mono text-xs uppercase tracking-widest text-ink-muted mb-2">
              Try to break it
            </h2>
            <p>
              Ask for account data before verifying. Demand a 50 euro credit. Ask to
              cancel your contract. It should refuse, cap, or hand off cleanly.
            </p>
          </div>
          <div className="panel p-5">
            <h2 className="font-mono text-xs uppercase tracking-widest text-ink-muted mb-2">
              What this proves
            </h2>
            <p>
              Prompt design, function calling against a billing system, identity
              gating, authority limits, and clean human handoff, in one live voice
              deployment.
            </p>
          </div>
        </section>

        <section className="mt-14">
          <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-ink-muted mb-4">
            How it&apos;s built
          </h2>
          <div className="panel p-6">
            <div className="grid gap-3 font-mono text-xs md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-stretch">
              <div className="rounded-xl border border-border bg-bg-inset p-4">
                <p className="font-semibold text-ink mb-1">Browser</p>
                <p className="text-ink-dim leading-relaxed">
                  mic + WebRTC · live transcript · executes the agent&apos;s function
                  calls · hard 3-min cutoff
                </p>
              </div>
              <div className="self-center text-center text-ink-muted px-1" aria-hidden>
                <span className="hidden md:inline">⇄</span>
                <span className="md:hidden">⇅</span>
                <p className="text-[10px] mt-1">audio +<br />events</p>
              </div>
              <div className="rounded-xl border border-[var(--ember)] bg-[var(--ember-tint)] p-4">
                <p className="font-semibold text-ink mb-1">OpenAI Realtime API</p>
                <p className="text-ink-dim leading-relaxed">
                  gpt-realtime-2 · cedar voice · semantic VAD · speech in, speech out,
                  tool calls over a data channel
                </p>
              </div>
              <div className="self-center text-center text-ink-muted px-1" aria-hidden>
                <span className="hidden md:inline">←</span>
                <span className="md:hidden">↑</span>
                <p className="text-[10px] mt-1">ephemeral<br />secret</p>
              </div>
              <div className="rounded-xl border border-border bg-bg-inset p-4">
                <p className="font-semibold text-ink mb-1">Next.js server</p>
                <p className="text-ink-dim leading-relaxed">
                  mints 60s client secrets · real key never ships · per-IP and global
                  daily caps, fail closed
                </p>
              </div>
            </div>
            <div className="mt-3 grid gap-3 font-mono text-xs md:grid-cols-2">
              <div className="rounded-xl border border-border bg-bg-inset p-4">
                <p className="font-semibold text-ink mb-1">One agent definition, every channel</p>
                <p className="text-ink-dim leading-relaxed">
                  Instructions + 7 typed tools live in one shared TypeScript module.
                  The voice channel, the eval harness, and a future text channel all
                  consume the same definition, so behavior never forks.
                </p>
              </div>
              <div className="rounded-xl border border-border bg-bg-inset p-4">
                <p className="font-semibold text-ink mb-1">Mock billing system + session log</p>
                <p className="text-ink-dim leading-relaxed">
                  Tools hit an in-memory billing service with an identity gate and a
                  20 EUR credit authority enforced in code, not prompt. Outcomes,
                  latencies, and turns land on{" "}
                  <a href="/ops" className="text-ember underline underline-offset-2">/ops</a>.
                </p>
              </div>
            </div>
            <p className="mt-4 text-sm text-ink-dim">
              First live test call, first production lesson: the caller said
              &quot;Fischer&quot;, the speech model wrote &quot;Fisher&quot;, and exact-match
              identity verification refused a legitimate customer. The fix lives in the
              integration layer, not the prompt: exact match on the account digits, fuzzy
              match on the spoken name, locked in with a regression test. Every failure
              becomes a test.
            </p>
          </div>
        </section>

        <section className="mt-14">
          <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-ink-muted mb-2">
            Why it&apos;s built this way
          </h2>
          <p className="mb-5 max-w-2xl text-sm text-ink-dim">
            Every mechanism here is a decision with a reason and an accepted tradeoff.
            These are the ones that matter.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            {[
              {
                t: "Telecom billing, not a generic assistant",
                d: "A billing dispute has everything a real deployment has: identity, account data, a bounded remedy, and a human fallback. Each step is verifiable through a tool call, so the demo proves integration work rather than conversation. And it resolves inside 90 seconds, which is all the time a visitor gives you.",
              },
              {
                t: "Speech-to-speech, not a cascaded pipeline",
                d: "The classic stack chains speech-to-text, an LLM, and text-to-speech. Every hop adds latency, and interruptions need custom handling. OpenAI's Realtime API does speech in, speech out with barge-in built in, which is why the agent stops talking the moment you cut it off. The tradeoff is less per-stage control and a higher price per minute; the caps and the text-mode eval absorb both.",
              },
              {
                t: "WebRTC with ephemeral secrets",
                d: "The real API key never leaves the server. The browser gets a client secret that expires in 60 seconds and only gates starting a call. The browser also brings echo cancellation and jitter handling for free, which is most of what makes a voice call feel decent on bad wifi.",
              },
              {
                t: "A model per task, not one model for everything",
                d: "Voice runs on gpt-realtime-2 with the cedar voice, picked for a warm, professional register. Chat, the eval personas, and the judge run on gpt-4.1-mini: it passed all 26 behavioral assertions at a fraction of the cost, so paying for a bigger model there buys nothing. Right-sizing the model per task is the habit; every choice is one env var to revisit.",
              },
              {
                t: "Policy lives in code, the prompt is UX",
                d: "The 20 euro credit cap, the identity gate, and the rule that escalation ends account actions are all enforced in the billing service. The eval proved why: instructions alone held the escalation rule most of the time, and most of the time is not a policy. The prompt shapes tone and flow; code decides what is allowed.",
              },
              {
                t: "Caps on everything, failing closed",
                d: "Realtime audio is the most expensive API surface there is, and this demo is public. Calls hard-stop at 3 minutes with a visible countdown, each IP gets a daily allowance, and a global daily budget puts the demo to sleep before the bill grows teeth. Every limit fails closed with honest copy instead of a broken page.",
              },
              {
                t: "Transcripts never leave the browser",
                d: "The ops dashboard runs on outcomes, durations, and tool latencies, not on what callers said. That split keeps a public metrics page safe to share and mirrors how a real deployment separates media storage from operational telemetry.",
              },
              {
                t: "One agent definition, three surfaces",
                d: "Instructions and tools live in a single TypeScript module consumed by voice, chat, and the eval harness. When a live call exposed a flaw, the fix landed once and every channel inherited it, with a frozen regression case to keep it fixed. That failure-becomes-a-test loop is the working method this whole project demonstrates.",
              },
            ].map((card) => (
              <div key={card.t} className="panel p-5">
                <h3 className="font-mono text-xs uppercase tracking-widest text-ink mb-2">
                  {card.t}
                </h3>
                <p className="text-sm text-ink-dim leading-relaxed">{card.d}</p>
              </div>
            ))}
          </div>
        </section>

        <footer className="mt-14 border-t border-border pt-6 text-sm text-ink-muted flex flex-wrap items-center gap-x-6 gap-y-2">
          <span>
            Built by{" "}
            <a href="https://trbt.cloud" className="text-ink underline underline-offset-4 hover:text-ember">
              Ben Tal Mizrahi
            </a>
          </span>
          <a href="/ops" className="text-ink-dim underline underline-offset-4 hover:text-ember">
            Operations dashboard
          </a>
          <a
            href="https://github.com/UnchainedSoulBT/nimbus-desk"
            className="text-ink-dim underline underline-offset-4 hover:text-ember"
          >
            Source (MIT)
          </a>
          <span className="font-mono text-xs">
            Every account here is fictional. Sessions are capped; transcripts stay in your browser.
          </span>
        </footer>
      </div>
    </main>
  );
}
