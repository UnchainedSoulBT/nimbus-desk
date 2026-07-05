import { BillingSession, type ToolResult } from "@/lib/billing/service";

/* Channel-agnostic tool dispatcher: maps an agent tool call (name + JSON args)
 * onto the mock billing system. The voice client, the chat route, and the eval
 * harness all execute tools through this one function. */

export function executeTool(
  session: BillingSession,
  name: string,
  args: Record<string, unknown>,
): ToolResult {
  const str = (k: string) => (typeof args[k] === "string" ? (args[k] as string) : "");
  const num = (k: string) => (typeof args[k] === "number" ? (args[k] as number) : NaN);

  switch (name) {
    case "verify_identity":
      return session.verifyIdentity(str("full_name"), str("account_last4"));
    case "get_bill":
      return session.getBill();
    case "explain_charge":
      return session.explainCharge(str("line_item_id"));
    case "apply_credit":
      return session.applyCredit(num("amount_eur"), str("reason"));
    case "send_summary_email":
      return session.sendSummaryEmail(str("summary"));
    case "escalate_to_human":
      return session.escalateToHuman(str("reason"), str("case_summary"));
    case "end_call":
      // Hanging up is a channel action; each channel watches for this call
      // and closes its own connection after the model's final words.
      return { ok: true, data: { ending: true, outcome: str("outcome") || "resolved" } };
    default:
      return { ok: false, error: `Unknown tool: ${name}` };
  }
}
