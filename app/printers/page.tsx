"use client";

import { useEffect, useState } from "react";

type Printer = {
    address: string;
    name: string;
    tvlUsd: number;
    fees30mUsd: number;
    feeTvlRatio30m: number;
    feeTvlRatio1h: number;
    ageHours: number;
    binStep: number | string | null;
    baseFeePct: number | string | null;
    marketCapUsd: number | null;
    url: string;
};

type ScanResult = {
    generated_at: string | null;
    printers: Printer[];
    alerted: boolean;
};

const usd = (n: number) =>
    n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M`
        : n >= 1_000 ? `$${(n / 1_000).toFixed(1)}K`
            : `$${n.toFixed(0)}`;

const formatAge = (hours: number) => (hours >= 24 ? `${(hours / 24).toFixed(1)}d` : `${hours.toFixed(1)}h`);

const formatUpdated = (iso: string | null) => {
    if (!iso) return "Never scanned yet";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const diffMins = Math.floor((Date.now() - d.getTime()) / 60000);
    if (diffMins < 1) return "Updated just now";
    if (diffMins < 60) return `Updated ${diffMins}m ago`;
    return `Updated ${Math.floor(diffMins / 60)}h ago`;
};

export default function PrintersPage() {
    const [data, setData] = useState<ScanResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const res = await fetch("/api/scan", { cache: "no-store" });
                if (!res.ok) throw new Error(`API returned ${res.status}`);
                const json = await res.json();
                if (!cancelled) setData(json);
            } catch (e) {
                if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
            }
        };
        load();
        const interval = setInterval(load, 60_000);
        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, []);

    const printers = data?.printers ?? [];

    return (
        <div style={{ padding: "20px 14px 60px", color: "#f0f3ff", fontFamily: "'JetBrains Mono', monospace" }}>
            <h1 style={{ fontSize: "1rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "#52f0cb", margin: "0 0 4px" }}>
                DLMM Hot Pools
            </h1>
            <p style={{ fontSize: "0.72rem", color: "rgba(240,243,255,0.5)", margin: "0 0 18px" }}>
                {formatUpdated(data?.generated_at ?? null)}
            </p>

            {error ? (
                <p style={{ color: "#ff5d70", fontSize: "0.85rem" }}>{error}</p>
            ) : printers.length === 0 ? (
                <p style={{ color: "rgba(240,243,255,0.5)", fontSize: "0.85rem", fontStyle: "italic" }}>
                    Nothing printing right now.
                </p>
            ) : (
                <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem", minWidth: "560px" }}>
                        <thead>
                            <tr style={{ borderBottom: "1px solid rgba(72,84,112,0.4)", textAlign: "left" }}>
                                <th style={{ padding: "8px 10px" }}>Pool</th>
                                <th style={{ padding: "8px 10px" }}>TVL</th>
                                <th style={{ padding: "8px 10px" }}>fee/TVL (30m)</th>
                                <th style={{ padding: "8px 10px" }}>30m fees</th>
                                <th style={{ padding: "8px 10px" }}>Age</th>
                                <th style={{ padding: "8px 10px" }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {printers.map((p) => (
                                <tr key={p.address} style={{ borderBottom: "1px solid rgba(72,84,112,0.2)" }}>
                                    <td style={{ padding: "8px 10px", color: "#f0f3ff" }}>
                                        {p.name}
                                        <div style={{ fontSize: "0.64rem", color: "rgba(240,243,255,0.4)" }}>
                                            {p.binStep}/{p.baseFeePct}%{p.marketCapUsd ? ` · MC ${usd(p.marketCapUsd)}` : ""}
                                        </div>
                                    </td>
                                    <td style={{ padding: "8px 10px" }}>{usd(p.tvlUsd)}</td>
                                    <td style={{ padding: "8px 10px", color: "#52f0cb" }}>{p.feeTvlRatio30m.toFixed(2)}%</td>
                                    <td style={{ padding: "8px 10px" }}>{usd(p.fees30mUsd)}</td>
                                    <td style={{ padding: "8px 10px" }}>{formatAge(p.ageHours)}</td>
                                    <td style={{ padding: "8px 10px" }}>
                                        <a href={p.url} target="_blank" rel="noopener noreferrer" style={{ color: "#52f0cb" }}>
                                            Open ↗
                                        </a>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
