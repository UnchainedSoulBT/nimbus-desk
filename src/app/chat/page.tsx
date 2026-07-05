import Link from "next/link";
import { ChatSession } from "@/components/ChatSession";

export const metadata = {
  title: "Nimbus Desk — text chat",
  description:
    "Chat with the same Nimbus Desk agent that answers the voice line: same instructions, same tools, same guardrails.",
};

export default function ChatPage() {
  return (
    <main className="min-h-screen grid-bg">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-ink-muted mb-2">
              Nimbus Desk · text channel
            </p>
            <h1 className="text-3xl font-bold tracking-tight text-ink">
              Same agent, in writing
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-ink-dim">
              This chat runs the exact agent definition the voice line uses: one
              shared module of instructions and tools, two channels. Verify as{" "}
              <span className="font-mono text-ink">Maya Fischer</span>, account ending{" "}
              <span className="font-mono text-ink">2210</span>, and dispute the
              roaming charge.
            </p>
          </div>
          <Link href="/" className="btn-ghost press-scale px-4 py-2 text-sm shrink-0">
            ← Voice demo
          </Link>
        </header>
        <ChatSession />
        <footer className="mt-10 border-t border-border pt-6 text-sm text-ink-muted flex flex-wrap items-center gap-x-6 gap-y-2">
          <span>
            Built by{" "}
            <a
              href="https://trbt.cloud"
              className="text-ink underline underline-offset-4 hover:text-ember"
            >
              Ben Tal Mizrahi
            </a>
          </span>
          <Link href="/ops" className="text-ink-dim underline underline-offset-4 hover:text-ember">
            Operations dashboard
          </Link>
          <span className="font-mono text-xs">
            Every account here is fictional. Chats are rate limited and logged.
          </span>
        </footer>
      </div>
    </main>
  );
}
