import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nimbus Desk — a voice AI support agent, deployed",
  description:
    "A browser-based voice agent for a fictional telecom. It verifies callers, reads real bills, and resolves disputes through live function calls. Built by Ben Tal Mizrahi.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
