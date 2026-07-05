/* Mock billing data for Nimbus Telecom. Three seeded accounts, each with a
 * current bill containing one plausibly disputable line item. All figures EUR. */

export interface LineItem {
  id: string;
  label: string;
  category: "plan" | "roaming" | "premium" | "device" | "usage" | "fee";
  amountEur: number;
  note: string;
}

export interface Bill {
  id: string;
  period: string;
  totalEur: number;
  issuedAt: string;
  items: LineItem[];
}

export interface Customer {
  accountId: string;
  /** Last 4 digits of the account number, used for mock identity verification. */
  last4: string;
  fullName: string;
  plan: string;
  email: string;
  creditsAppliedEur: number;
  bills: Bill[];
}

export const CUSTOMERS: Customer[] = [
  {
    accountId: "NB-4471-2210",
    last4: "2210",
    fullName: "Maya Fischer",
    plan: "Nimbus Unlimited 5G",
    email: "maya.fischer@example.com",
    creditsAppliedEur: 0,
    bills: [
      {
        id: "INV-2026-06-4471",
        period: "June 2026",
        totalEur: 87.4,
        issuedAt: "2026-07-01",
        items: [
          { id: "li-1", label: "Nimbus Unlimited 5G monthly plan", category: "plan", amountEur: 39.9, note: "Recurring plan charge." },
          { id: "li-2", label: "Roaming data — Switzerland (non-EU zone), 412 MB", category: "roaming", amountEur: 28.5, note: "Switzerland is outside the EU roam-like-home zone; billed at 6.9c/MB after the 1 GB day-pass window lapsed on 2026-06-14." },
          { id: "li-3", label: "International calls — UK, 24 min", category: "usage", amountEur: 9.6, note: "Standard international rate 0.40/min." },
          { id: "li-4", label: "Device installment — Pixel 10 (14 of 24)", category: "device", amountEur: 9.4, note: "Interest-free installment." },
        ],
      },
    ],
  },
  {
    accountId: "NB-8834-7355",
    last4: "7355",
    fullName: "Daniel Peretz",
    plan: "Nimbus Family 4 lines",
    email: "daniel.peretz@example.com",
    creditsAppliedEur: 0,
    bills: [
      {
        id: "INV-2026-06-8834",
        period: "June 2026",
        totalEur: 112.75,
        issuedAt: "2026-07-01",
        items: [
          { id: "li-1", label: "Nimbus Family plan, 4 lines", category: "plan", amountEur: 79.9, note: "Recurring plan charge." },
          { id: "li-2", label: "Premium SMS — StarQuiz subscription, 3 messages", category: "premium", amountEur: 17.85, note: "Third-party premium SMS service opted in on 2026-06-08 from line ending 4412. Can be blocked on request." },
          { id: "li-3", label: "Extra data pack 5 GB", category: "usage", amountEur: 12.0, note: "One-time top-up purchased in-app 2026-06-19." },
          { id: "li-4", label: "Paper invoice fee", category: "fee", amountEur: 3.0, note: "Waivable by switching to e-invoice." },
        ],
      },
    ],
  },
  {
    accountId: "NB-1902-0088",
    last4: "0088",
    fullName: "Sofia Marino",
    plan: "Nimbus Start 20GB",
    email: "sofia.marino@example.com",
    creditsAppliedEur: 0,
    bills: [
      {
        id: "INV-2026-06-1902",
        period: "June 2026",
        totalEur: 54.2,
        issuedAt: "2026-07-01",
        items: [
          { id: "li-1", label: "Nimbus Start 20GB monthly plan", category: "plan", amountEur: 24.9, note: "Recurring plan charge." },
          { id: "li-2", label: "Late payment fee — May invoice", category: "fee", amountEur: 8.5, note: "May invoice settled 2026-06-11, nine days past due date. First late payment on this account." },
          { id: "li-3", label: "Roaming data — Turkey, 180 MB", category: "roaming", amountEur: 14.4, note: "Turkey is outside the EU zone; billed at 8c/MB." },
          { id: "li-4", label: "Voicemail-to-text add-on", category: "usage", amountEur: 6.4, note: "Recurring add-on active since 2025-11." },
        ],
      },
    ],
  },
];
