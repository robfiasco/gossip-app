import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gossip — Solana Intelligence",
  description: "Editorial-style Solana intelligence feed prototype.",
};

import AppWalletProvider from "./components/AppWalletProvider";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <AppWalletProvider>
          <div className="app-shell">
            <div className="phone-frame">{children}</div>
          </div>
        </AppWalletProvider>
      </body>
    </html>
  );
}
