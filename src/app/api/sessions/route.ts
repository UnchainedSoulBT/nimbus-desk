import { opsSnapshot, recordSession, sanitizeReport } from "@/lib/sessions";

/* POST: the browser reports one finished call's operational metadata.
 * GET: the /ops dashboard reads aggregates. Both are public by design — the
 * data is metrics about a mock system, never transcript content. */

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const report = sanitizeReport(body);
  if (!report) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const rec = recordSession(report);
  return Response.json({ id: rec.id }, { status: 201 });
}

export async function GET() {
  return Response.json(opsSnapshot(), {
    headers: { "Cache-Control": "no-store" },
  });
}
