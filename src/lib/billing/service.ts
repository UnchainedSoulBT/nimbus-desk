import { CUSTOMERS, type Bill, type Customer } from "./data";

/* In-memory mock of Nimbus Telecom's billing system. One BillingSession is
 * created per call; identity state and applied credits live for the session.
 * Pure TypeScript with no I/O so the same code runs in the browser (voice
 * channel), on the server (chat channel), and in the eval harness. */

export const CREDIT_AUTHORITY_LIMIT_EUR = 20;

export type ToolResult = { ok: true; data: unknown } | { ok: false; error: string };

/* Names arrive through speech recognition, so "Fischer" often comes back as
 * "Fisher". The last-4 digits are the exact credential; the name is verified
 * fuzzily against the account that owns those digits, with a tolerance that
 * scales with name length: 1 slip per ~6 characters, capped at 3. Keeps
 * "Maia Fisher" in and "Dan Peretz" (a different given name) out. */
function maxNameEditDistance(len: number): number {
  return Math.min(3, Math.max(1, Math.floor(len / 6)));
}

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i, ...new Array<number>(n).fill(0)];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[n];
}

export class BillingSession {
  private verified: Customer | null = null;
  private creditsThisSession = 0;
  private escalated = false;

  get verifiedCustomer(): Customer | null {
    return this.verified;
  }

  verifyIdentity(fullName: string, accountLast4: string): ToolResult {
    const name = normalizeName(fullName);
    const last4 = accountLast4.replace(/\D/g, "");
    const byDigits = CUSTOMERS.find((c) => c.last4 === last4);
    const accountName = byDigits ? normalizeName(byDigits.fullName) : "";
    const match =
      byDigits && name && editDistance(name, accountName) <= maxNameEditDistance(accountName.length)
        ? byDigits
        : undefined;
    if (!match) {
      return {
        ok: false,
        error:
          "No account matches that name and last-4 combination. Ask the caller to repeat the digits and spell their last name, then try again.",
      };
    }
    this.verified = match;
    return {
      ok: true,
      data: {
        verified: true,
        accountId: match.accountId,
        fullName: match.fullName,
        plan: match.plan,
      },
    };
  }

  /** Every account-data tool goes through this gate. */
  private requireIdentity(): Customer | ToolResult {
    if (!this.verified) {
      return {
        ok: false,
        error:
          "Identity not verified. Call verify_identity with the caller's full name and the last 4 digits of their account number before accessing account data.",
      };
    }
    return this.verified;
  }

  getBill(): ToolResult {
    const c = this.requireIdentity();
    if (!(c as Customer).accountId) return c as ToolResult;
    const customer = c as Customer;
    const bill: Bill = customer.bills[0];
    return {
      ok: true,
      data: {
        accountId: customer.accountId,
        period: bill.period,
        invoiceId: bill.id,
        totalEur: bill.totalEur,
        items: bill.items.map(({ id, label, category, amountEur }) => ({
          id,
          label,
          category,
          amountEur,
        })),
      },
    };
  }

  explainCharge(lineItemId: string): ToolResult {
    const c = this.requireIdentity();
    if (!(c as Customer).accountId) return c as ToolResult;
    const customer = c as Customer;
    const item = customer.bills[0].items.find((i) => i.id === lineItemId);
    if (!item) {
      return { ok: false, error: `No line item '${lineItemId}' on the current bill.` };
    }
    return {
      ok: true,
      data: { id: item.id, label: item.label, amountEur: item.amountEur, detail: item.note },
    };
  }

  /* Escalation is terminal for account actions. The instructions say so too,
   * but the eval showed prompt-only enforcement is probabilistic — the model
   * occasionally applied a credit after a handoff. Policy lives in code. */
  private requireNotEscalated(): ToolResult | null {
    if (this.escalated) {
      return {
        ok: false,
        error:
          "Declined: this case has been escalated to a human agent. No further account changes can be made on this call; the human agent will handle any resolution.",
      };
    }
    return null;
  }

  applyCredit(amountEur: number, reason: string): ToolResult {
    const blocked = this.requireNotEscalated();
    if (blocked) return blocked;
    const c = this.requireIdentity();
    if (!(c as Customer).accountId) return c as ToolResult;
    const customer = c as Customer;
    if (!(amountEur > 0)) {
      return { ok: false, error: "Credit amount must be a positive number of euros." };
    }
    const rounded = Math.round(amountEur * 100) / 100;
    if (this.creditsThisSession + rounded > CREDIT_AUTHORITY_LIMIT_EUR) {
      return {
        ok: false,
        error: `Declined: total session credits would exceed the ${CREDIT_AUTHORITY_LIMIT_EUR} EUR agent authority limit (already applied: ${this.creditsThisSession} EUR). Offer to escalate to a human agent instead.`,
      };
    }
    this.creditsThisSession += rounded;
    customer.creditsAppliedEur += rounded;
    return {
      ok: true,
      data: {
        applied: true,
        amountEur: rounded,
        reason,
        newBalanceEur: Math.round((customer.bills[0].totalEur - customer.creditsAppliedEur) * 100) / 100,
        confirmationId: `CR-${customer.last4}-${String(Math.round(this.creditsThisSession * 100))}`,
      },
    };
  }

  sendSummaryEmail(summary: string): ToolResult {
    const blocked = this.requireNotEscalated();
    if (blocked) return blocked;
    const c = this.requireIdentity();
    if (!(c as Customer).accountId) return c as ToolResult;
    const customer = c as Customer;
    return {
      ok: true,
      data: {
        sent: true,
        to: customer.email,
        subject: `Your Nimbus Telecom support summary — ${customer.bills[0].period}`,
        preview: summary.slice(0, 200),
      },
    };
  }

  escalateToHuman(reason: string, caseSummary: string): ToolResult {
    this.escalated = true;
    return {
      ok: true,
      data: {
        queued: true,
        queue: "human-support",
        position: 2,
        estimatedWaitMinutes: 4,
        caseId: `CASE-${(this.verified?.last4 ?? "ANON")}-${caseSummary.length}`,
        reason,
        caseSummary,
      },
    };
  }
}
