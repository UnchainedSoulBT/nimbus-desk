/* Cost/abuse guardrails for a public demo that burns realtime-audio tokens.
 * Same fail-closed pattern as trbt-v2's Ask BT route: best-effort in-memory
 * counters survive warm invocations; cold starts only ever err toward
 * allowing traffic. The hard cost ceiling is the per-session time cap, which
 * is embedded in the ephemeral token's expiry and enforced client-side too. */

export const SESSION_SECONDS = Number(process.env.NIMBUS_SESSION_SECONDS ?? 180);

const DAILY_SESSION_CAP = Number(process.env.NIMBUS_DAILY_SESSION_CAP ?? 60);
const PER_IP_DAILY_CAP = Number(process.env.NIMBUS_PER_IP_DAILY_CAP ?? 6);
/** Minimum gap between session starts from one IP, to stop rapid reconnect loops. */
const PER_IP_COOLDOWN_MS = 20_000;

interface IpState {
  day: string;
  count: number;
  lastStartAt: number;
}

const ipStates = new Map<string, IpState>();
let dailyCount = 0;
let dailyDay = "";

export type GuardVerdict =
  | { allowed: true }
  | { allowed: false; reason: "demo_asleep" | "ip_capped" | "cooldown" };

export function allowSession(ip: string): GuardVerdict {
  // Caps exist to protect the public deployment's token budget. Local dev
  // (pnpm dev) is the developer's own key and needs unlimited test calls.
  if (process.env.NODE_ENV !== "production") return { allowed: true };

  const today = new Date().toISOString().slice(0, 10);
  if (today !== dailyDay) {
    dailyDay = today;
    dailyCount = 0;
  }
  if (dailyCount >= DAILY_SESSION_CAP) return { allowed: false, reason: "demo_asleep" };

  const now = Date.now();
  const s = ipStates.get(ip) ?? { day: today, count: 0, lastStartAt: 0 };
  if (s.day !== today) {
    s.day = today;
    s.count = 0;
  }
  if (s.count >= PER_IP_DAILY_CAP) {
    ipStates.set(ip, s);
    return { allowed: false, reason: "ip_capped" };
  }
  if (now - s.lastStartAt < PER_IP_COOLDOWN_MS) {
    ipStates.set(ip, s);
    return { allowed: false, reason: "cooldown" };
  }

  dailyCount += 1;
  s.count += 1;
  s.lastStartAt = now;
  ipStates.set(ip, s);
  if (ipStates.size > 5000) ipStates.clear();
  return { allowed: true };
}

export function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}
