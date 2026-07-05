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

        <footer className="mt-14 border-t border-border pt-6 text-sm text-ink-muted flex flex-wrap items-center gap-x-6 gap-y-2">
          <span>
            Built by{" "}
            <a href="https://trbt.cloud" className="text-ink underline underline-offset-4 hover:text-ember">
              Ben Tal Mizrahi
            </a>
          </span>
          <span className="font-mono text-xs">
            Every account here is fictional. Sessions are capped and logged.
          </span>
        </footer>
      </div>
    </main>
  );
}
