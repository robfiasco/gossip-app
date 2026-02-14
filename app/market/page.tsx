"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { TerminalData } from "../../lib/data/types";

export default function MarketContextPage() {
  const [data, setData] = useState<TerminalData | null>(null);

  useEffect(() => {
    let active = true;
    const fetchData = async () => {
      try {
        const res = await fetch("/api/terminal");
        if (!res.ok) throw new Error("fetch failed");
        const json = (await res.json()) as TerminalData;
        if (active) setData(json);
      } catch {
        if (active) setData(null);
      }
    };
    fetchData();
    return () => {
      active = false;
    };
  }, []);

  const sol = data?.sol;
  const fearGreed = data?.fearGreed;

  return (
    <main className="page detail-page">
      <header className="detail-header">
        <Link className="back-link" href="/">
          Back to brief
        </Link>
      </header>

      <section className="detail-hero">
        <p className="detail-source">
          Validator
          <span className="dot" aria-hidden="true" />
          <span className="time">Market Context</span>
        </p>
        <h1 className="detail-title">SOL Week: Market Move Context</h1>
      </section>

      <section className="detail-section">
        <div className="section-label">Summary</div>
        <p className="detail-text">
          SOL moved {sol?.change7dPct !== null ? sol.change7dPct.toFixed(1) : "—"}% over the
          past 7 days. Fear &amp; Greed sits at {fearGreed?.value ?? "—"}, signaling the
          current risk posture across crypto.
        </p>
      </section>

      <section className="detail-section">
        <div className="section-label">Why It Matters</div>
        <p className="detail-text">
          Large weekly moves often coincide with shifts in leverage, liquidity, and Solana-native
          flows. Use today’s story list to pinpoint the specific catalysts.
        </p>
      </section>
    </main>
  );
}
