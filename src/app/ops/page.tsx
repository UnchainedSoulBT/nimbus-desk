import Link from "next/link";
import { OpsDashboard } from "@/components/OpsDashboard";

export const metadata = {
  title: "Nimbus Desk — operations",
  description: "Live operational metrics for the Nimbus Desk voice agent deployment.",
};

export default function OpsPage() {
  return (
    <main className="min-h-screen grid-bg">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-ink-muted mb-2">
              Nimbus Desk · operations
            </p>
            <h1 className="text-3xl font-bold tracking-tight text-ink">
              Deployment metrics
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-ink-dim">
              The numbers a support operation actually runs on. Logged per session:
              outcome, handling time, turns, and every function call with its result
              and latency. Transcripts never leave the caller&apos;s browser; only
              operational metadata lands here.
            </p>
          </div>
          <Link href="/" className="btn-ghost press-scale px-4 py-2 text-sm shrink-0">
            ← Back to the demo
          </Link>
        </header>
        <OpsDashboard />
      </div>
    </main>
  );
}
