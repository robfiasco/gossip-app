"use client";

import { useCallback, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";

// How close to an edge counts as a warning, as a fraction of the position's
// full range width (0.1 = within the outer 10% on either side).
const EDGE_WARNING_THRESHOLD = 0.1;

type PositionView = {
    positionAddress: string;
    poolAddress: string;
    poolUrl: string;
    tokenXMint: string;
    tokenYMint: string;
    tokenXSymbol: string;
    tokenYSymbol: string;
    binStep: number;
    lowerBinId: number;
    upperBinId: number;
    activeId: number;
    status: "below" | "above" | "in-range";
    pctFromLower: number | null;
    pctFromUpper: number | null;
    lowerPriceDisplay: string | null;
    upperPriceDisplay: string | null;
    currentPriceDisplay: string | null;
};

const short = (addr: string) => `${addr.slice(0, 4)}...${addr.slice(-4)}`;

// Best-effort symbol lookup - a position still renders with truncated
// addresses if DexScreener doesn't have the token indexed.
async function fetchSymbol(mint: string): Promise<string | null> {
    try {
        const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
        if (!res.ok) return null;
        const json = await res.json();
        const pairs = Array.isArray(json?.pairs) ? json.pairs : [];
        const best = [...pairs].sort((a, b) => Number(b?.liquidity?.usd ?? 0) - Number(a?.liquidity?.usd ?? 0))[0];
        return best?.baseToken?.address === mint ? best?.baseToken?.symbol ?? null : best?.quoteToken?.symbol ?? null;
    } catch {
        return null;
    }
}

export default function PositionsPage() {
    const { connection } = useConnection();
    const { publicKey, connected } = useWallet();
    const { setVisible } = useWalletModal();
    const [positions, setPositions] = useState<PositionView[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!publicKey) return;
        setLoading(true);
        setError(null);
        try {
            const { default: DLMM, getPriceOfBinByBinId } = await import("@meteora-ag/dlmm");
            const byPool = await DLMM.getAllLbPairPositionsByUser(connection, publicKey);

            const symbolCache = new Map<string, Promise<string | null>>();
            const getSymbol = (mint: string) => {
                if (!symbolCache.has(mint)) symbolCache.set(mint, fetchSymbol(mint));
                return symbolCache.get(mint)!;
            };

            const rows: PositionView[] = [];
            for (const info of byPool.values()) {
                const binStep = info.lbPair.binStep;
                const activeId = info.lbPair.activeId;
                const tokenXMint = info.tokenX.mint.address.toBase58();
                const tokenYMint = info.tokenY.mint.address.toBase58();
                const [tokenXSymbol, tokenYSymbol] = await Promise.all([
                    getSymbol(tokenXMint).then((s) => s ?? short(tokenXMint)),
                    getSymbol(tokenYMint).then((s) => s ?? short(tokenYMint)),
                ]);

                for (const pos of info.lbPairPositionsData) {
                    const { lowerBinId, upperBinId } = pos.positionData;

                    // getPriceOfBinByBinId is decimal-invariant (no token-decimals
                    // adjustment) - fine for range-percentage math since decimals
                    // cancel out in a ratio, not fine as a display price.
                    const lowerRaw = getPriceOfBinByBinId(lowerBinId, binStep);
                    const upperRaw = getPriceOfBinByBinId(upperBinId, binStep);
                    const activeRaw = getPriceOfBinByBinId(activeId, binStep);

                    let status: PositionView["status"] = "in-range";
                    let pctFromLower: number | null = null;
                    let pctFromUpper: number | null = null;
                    if (activeId < lowerBinId) {
                        status = "below";
                    } else if (activeId > upperBinId) {
                        status = "above";
                    } else {
                        const width = upperRaw.minus(lowerRaw);
                        pctFromLower = width.isZero() ? 1 : activeRaw.minus(lowerRaw).div(width).toNumber();
                        pctFromUpper = 1 - pctFromLower;
                    }

                    // Bounds are always within the position's own bin data, so this
                    // is the real decimal-adjusted display price, not the raw ratio.
                    const lowerBin = pos.positionData.positionBinData.find((b) => b.binId === lowerBinId);
                    const upperBin = pos.positionData.positionBinData.find((b) => b.binId === upperBinId);
                    const activeBin = pos.positionData.positionBinData.find((b) => b.binId === activeId);

                    rows.push({
                        positionAddress: pos.publicKey.toBase58(),
                        poolAddress: info.publicKey.toBase58(),
                        poolUrl: `https://app.meteora.ag/dlmm/${info.publicKey.toBase58()}`,
                        tokenXMint,
                        tokenYMint,
                        tokenXSymbol,
                        tokenYSymbol,
                        binStep,
                        lowerBinId,
                        upperBinId,
                        activeId,
                        status,
                        pctFromLower,
                        pctFromUpper,
                        lowerPriceDisplay: lowerBin?.pricePerToken ?? null,
                        upperPriceDisplay: upperBin?.pricePerToken ?? null,
                        // Out-of-range positions don't have the active bin in their
                        // own bin data - no decimal-adjusted display price available
                        // without a second call, so it's left blank rather than guessed.
                        currentPriceDisplay: activeBin?.pricePerToken ?? null,
                    });
                }
            }

            setPositions(rows);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load positions");
        } finally {
            setLoading(false);
        }
    }, [connection, publicKey]);

    return (
        <div style={{ padding: "20px 14px 60px", color: "#f0f3ff", fontFamily: "'JetBrains Mono', monospace" }}>
            <h1 style={{ fontSize: "1rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "#52f0cb", margin: "0 0 4px" }}>
                My DLMM Positions
            </h1>
            <p style={{ fontSize: "0.72rem", color: "rgba(240,243,255,0.5)", margin: "0 0 18px" }}>
                Range status for your connected wallet's Meteora positions.
            </p>

            {!connected ? (
                <button
                    onClick={() => setVisible(true)}
                    style={{
                        background: "#52f0cb", color: "#0a0e1a", border: "none", borderRadius: "6px",
                        padding: "10px 16px", fontFamily: "inherit", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer",
                    }}
                >
                    Connect Wallet
                </button>
            ) : (
                <>
                    <button
                        onClick={load}
                        disabled={loading}
                        style={{
                            background: "none", color: "#52f0cb", border: "1px solid #52f0cb", borderRadius: "6px",
                            padding: "8px 14px", fontFamily: "inherit", fontSize: "0.78rem", cursor: loading ? "default" : "pointer",
                            marginBottom: "18px", opacity: loading ? 0.6 : 1,
                        }}
                    >
                        {loading ? "Loading..." : positions === null ? "Load Positions" : "Refresh"}
                    </button>

                    {error && <p style={{ color: "#ff5d70", fontSize: "0.85rem" }}>{error}</p>}

                    {positions !== null && positions.length === 0 && !error && (
                        <p style={{ color: "rgba(240,243,255,0.5)", fontSize: "0.85rem", fontStyle: "italic" }}>
                            No open DLMM positions found for this wallet.
                        </p>
                    )}

                    {positions !== null && positions.length > 0 && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                            {positions.map((p) => {
                                const isWarning = p.status !== "in-range" ||
                                    (p.pctFromLower !== null && Math.min(p.pctFromLower, p.pctFromUpper ?? 1) < EDGE_WARNING_THRESHOLD);
                                const color = p.status !== "in-range" ? "#ff5d70" : isWarning ? "#f5a623" : "#2eb67d";
                                const label = p.status === "below"
                                    ? `Below range - holding 100% ${p.tokenXSymbol}`
                                    : p.status === "above"
                                        ? `Above range - holding 100% ${p.tokenYSymbol}`
                                        : isWarning
                                            ? `Approaching edge (${(Math.min(p.pctFromLower!, p.pctFromUpper!) * 100).toFixed(0)}% from bound)`
                                            : "In range";

                                return (
                                    <div
                                        key={p.positionAddress}
                                        style={{ borderLeft: `3px solid ${color}`, padding: "10px 14px", background: "rgba(255,255,255,0.03)", borderRadius: "4px" }}
                                    >
                                        <div style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                                            {p.tokenXSymbol}-{p.tokenYSymbol}
                                        </div>
                                        <div style={{ fontSize: "0.75rem", color, margin: "4px 0" }}>{label}</div>
                                        <div style={{ fontSize: "0.72rem", color: "rgba(240,243,255,0.6)" }}>
                                            Range: {p.lowerPriceDisplay ?? "?"} - {p.upperPriceDisplay ?? "?"}
                                            {p.currentPriceDisplay ? ` | Current: ${p.currentPriceDisplay}` : ""}
                                        </div>
                                        <a href={p.poolUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#52f0cb", fontSize: "0.72rem" }}>
                                            Meteora ↗
                                        </a>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
