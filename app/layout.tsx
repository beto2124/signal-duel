import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Signal Duel — A game of connections",
  description: "Outthink your opponent on a 7×7 hex board. Play Circuit AI, challenge a friend online, or share a screen. Connect your edges to win.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
