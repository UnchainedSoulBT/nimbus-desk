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
              "6 tools, mock billing system",
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
