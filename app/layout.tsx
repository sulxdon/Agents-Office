import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agent Office — your AI team, live in 2D",
  description: "Drop goals, watch AI agents collaborate in a simulated 2D office.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-stone-950 text-stone-200 antialiased">{children}</body>
    </html>
  );
}
