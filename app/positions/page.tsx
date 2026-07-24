"use client";

import { useCallback, useRef, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";

// How close to an edge counts as a warning, as a fraction of the position's
// full range width (0.1 = within the outer 10% on either side).
const EDGE_WARNING_THRESHOLD = 0.1;

// Matches the user's own stated scalping target - get in, farm this much in
// accrued LP fees, get out. Not directional price PnL (see load() comment).
const FEE_PROFIT_TARGET_USD = 20;

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
    accruedFeesUsd: number | null;
    feeRatePerMin: number | null;
    etaMinutesToTarget: number | null;
};

const short = (addr: string) => `${addr.slice(0, 4)}...${addr.slice(-4)}`;

// Best-effort lookup - a position still renders with truncated addresses and
// no fee-value estimate if DexScreener doesn't have the token indexed.
async function fetchTokenInfo(mint: string): Promise<{ symbol: string | null; priceUsd: number | null }> {
    try {
        const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
        if (!res.ok) return { symbol: null, priceUsd: null };
        const json = await res.json();
        const pairs = Array.isArray(json?.pairs) ? json.pairs : [];
        const best = [...pairs].sort((a, b) => Number(b?.liquidity?.usd ?? 0) - Number(a?.liquidity?.usd ?? 0))[0];
        if (!best) return { symbol: null, priceUsd: null };
        const symbol = best.baseToken?.address === mint ? best.baseToken?.symbol ?? null : best.quoteToken?.symbol ?? null;
        return { symbol, priceUsd: priceUsdForMint(best, mint) };
    } catch {
        return { symbol: null, priceUsd: null };
    }
}

// DexScreener's priceUsd is always "USD price of the pair's base token" -
// when our mint is the quote side instead, back it out via priceNative
// (base token's price expressed in the quote token).
function priceUsdForMint(pair: any, mint: string): number | null {
    const priceUsd = Number(pair?.priceUsd);
    if (!Number.isFinite(priceUsd)) return null;
    if (pair?.baseToken?.address === mint) return priceUsd;
    if (pair?.quoteToken?.address === mint) {
        const priceNative = Number(pair?.priceNative);
        if (!Number.isFinite(priceNative) || priceNative === 0) return null;
        return priceUsd / priceNative;
    }
    return null;
}

export default function PositionsPage() {
    const { connection } = useConnection();
    const { publicKey, connected } = useWallet();
    const { setVisible } = useWalletModal();
    const [positions, setPositions] = useState<PositionView[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // Rate/ETA needs two data points - kept across loads (not state, since a
    // ref update shouldn't itself trigger a render) rather than in any
    // backend, so it only covers this browser session, resets on refresh of
    // the page itself, and never persists a directional entry price (see the
    // FEE_PROFIT_TARGET_USD comment: this tracks accrued fees, not price PnL).
    const prevSnapshotsRef = useRef<Map<string, { valueUsd: number; at: number }>>(new Map());

    const load = useCallback(async () => {
        if (!publicKey) return;
        setLoading(true);
        setError(null);
        try {
            const { default: DLMM, getPriceOfBinByBinId } = await import("@meteora-ag/dlmm");
            const byPool = await DLMM.getAllLbPairPositionsByUser(connection, publicKey);

            const infoCache = new Map<string, Promise<{ symbol: string | null; priceUsd: number | null }>>();
            const getTokenInfo = (mint: string) => {
                if (!infoCache.has(mint)) infoCache.set(mint, fetchTokenInfo(mint));
                return infoCache.get(mint)!;
            };

            const rows: PositionView[] = [];
            const now = Date.now();
            for (const info of byPool.values()) {
                const binStep = info.lbPair.binStep;
                const activeId = info.lbPair.activeId;
                const tokenXMint = info.tokenX.mint.address.toBase58();
                const tokenYMint = info.tokenY.mint.address.toBase58();
                const tokenXDecimals = info.tokenX.mint.decimals;
                const tokenYDecimals = info.tokenY.mint.decimals;
                const [tokenXInfo, tokenYInfo] = await Promise.all([getTokenInfo(tokenXMint), getTokenInfo(tokenYMint)]);
                const tokenXSymbol = tokenXInfo.symbol ?? short(tokenXMint);
                const tokenYSymbol = tokenYInfo.symbol ?? short(tokenYMint);

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

                    // Accrued (unclaimed) LP fees, not directional price PnL - the
                    // "farm to $20, get out" target from the fee side, which this
                    // page already has the on-chain data for.
                    const feeXUsd = tokenXInfo.priceUsd != null
                        ? (Number(pos.positionData.feeX.toString()) / 10 ** tokenXDecimals) * tokenXInfo.priceUsd
                        : null;
                    const feeYUsd = tokenYInfo.priceUsd != null
                        ? (Number(pos.positionData.feeY.toString()) / 10 ** tokenYDecimals) * tokenYInfo.priceUsd
                        : null;
                    const accruedFeesUsd = feeXUsd != null && feeYUsd != null
                        ? feeXUsd + feeYUsd
                        : feeXUsd ?? feeYUsd;

                    // Rate needs a prior snapshot from an earlier load() in this
                    // session - first load for a position always shows no rate/ETA.
                    // A negative delta means fees were claimed since the last
                    // check, not that fees shrank - treat that as a fresh baseline
                    // rather than a (nonsensical) negative accrual rate.
                    let feeRatePerMin: number | null = null;
                    let etaMinutesToTarget: number | null = null;
                    const positionAddress = pos.publicKey.toBase58();
                    const prev = prevSnapshotsRef.current.get(positionAddress);
                    if (accruedFeesUsd != null && prev && now > prev.at) {
                        const deltaUsd = accruedFeesUsd - prev.valueUsd;
                        const deltaMin = (now - prev.at) / 60000;
                        if (deltaUsd > 0) {
                            feeRatePerMin = deltaUsd / deltaMin;
                            if (accruedFeesUsd < FEE_PROFIT_TARGET_USD) {
                                etaMinutesToTarget = (FEE_PROFIT_TARGET_USD - accruedFeesUsd) / feeRatePerMin;
                            }
                        }
                    }
                    if (accruedFeesUsd != null) prevSnapshotsRef.current.set(positionAddress, { valueUsd: accruedFeesUsd, at: now });

                    rows.push({
                        positionAddress,
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
                        accruedFeesUsd,
                        feeRatePerMin,
                        etaMinutesToTarget,
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
                                        {p.accruedFeesUsd != null && (
                                            <div
                                                style={{
                                                    fontSize: "0.75rem",
                                                    margin: "4px 0",
                                                    color: p.accruedFeesUsd >= FEE_PROFIT_TARGET_USD ? "#52f0cb" : "rgba(240,243,255,0.7)",
                                                    fontWeight: p.accruedFeesUsd >= FEE_PROFIT_TARGET_USD ? 700 : 400,
                                                }}
                                            >
                                                {p.accruedFeesUsd >= FEE_PROFIT_TARGET_USD
                                                    ? `🎯 Target hit - $${p.accruedFeesUsd.toFixed(2)} accrued fees`
                                                    : `Accrued Fees: $${p.accruedFeesUsd.toFixed(2)}`}
                                                {p.feeRatePerMin != null && (
                                                    <span style={{ color: "rgba(240,243,255,0.45)" }}>
                                                        {` · +$${p.feeRatePerMin.toFixed(2)}/min`}
                                                        {p.etaMinutesToTarget != null ? ` · ~${p.etaMinutesToTarget.toFixed(0)}m to $${FEE_PROFIT_TARGET_USD}` : ""}
                                                    </span>
                                                )}
                                            </div>
                                        )}
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
