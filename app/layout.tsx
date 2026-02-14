import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Validator — Solana Intelligence",
  description: "Editorial-style Solana intelligence feed prototype.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <div className="app-shell">
          <div className="phone-frame">{children}</div>
        </div>
      </body>
    </html>
  );
}
