import {
  AGENT_INSTRUCTIONS,
  AGENT_TOOLS,
  REALTIME_MODEL_DEFAULT,
  REALTIME_VOICE,
} from "@/lib/agent/definition";
import { allowSession, clientIp, SESSION_SECONDS } from "@/lib/guardrails";

/* Mints a short-lived ephemeral client secret for the browser's WebRTC session.
 * The real OPENAI_API_KEY never leaves this route. The secret only gates
 * STARTING a call (60s window); call duration is capped client-side at
 * SESSION_SECONDS and the caps here bound how many calls can start at all. */

const MODEL = process.env.OPENAI_REALTIME_MODEL || REALTIME_MODEL_DEFAULT;

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "not_configured" }, { status: 503 });
  }

  const verdict = allowSession(clientIp(request));
  if (!verdict.allowed) {
    return Response.json({ error: verdict.reason }, { status: 429 });
  }

  try {
    const upstream = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        expires_after: { anchor: "created_at", seconds: 60 },
        session: {
          type: "realtime",
          model: MODEL,
          instructions: AGENT_INSTRUCTIONS,
          output_modalities: ["audio"],
          audio: {
            input: {
              transcription: { model: "gpt-realtime-whisper" },
              turn_detection: {
                type: "semantic_vad",
                eagerness: "auto",
                create_response: true,
                interrupt_response: true,
              },
            },
            output: { voice: REALTIME_VOICE },
          },
          tools: AGENT_TOOLS.map((t) => ({
            type: "function",
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          })),
          tool_choice: "auto",
        },
      }),
    });

    if (!upstream.ok) {
      console.error("client_secrets failed", upstream.status, await upstream.text());
      return Response.json({ error: "upstream_error" }, { status: 502 });
    }

    const data = (await upstream.json()) as { value?: string };
    if (!data.value) {
      return Response.json({ error: "upstream_error" }, { status: 502 });
    }
    return Response.json(
      { value: data.value, sessionSeconds: SESSION_SECONDS, model: MODEL },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json({ error: "upstream_error" }, { status: 502 });
  }
}
