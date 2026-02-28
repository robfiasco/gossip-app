import { NextResponse } from "next/server";

// Live market pricing — fetches fresh from CoinGecko + Fear & Greed on every request
// Cache for 3 minutes at the CDN/edge layer so we don't hammer the free APIs
export const dynamic = "force-dynamic";
export const revalidate = 180;

const COINGECKO_URL =
    "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=solana&order=market_cap_desc&per_page=1&page=1&sparkline=false&price_change_percentage=24h,7d";

const GLOBAL_URL = "https://api.coingecko.com/api/v3/global";
const FEAR_GREED_URL = "https://api.alternative.me/fng/?limit=1";

const FALLBACK = {
    sol: { price: null, change_24h: null, change_7d: null },
    mkt_cap: { solana_mkt_cap_usd: null, change_24h: null },
    fear_greed: { value: null, label: "n/a" },
    btc_dominance: { value: null },
    vol: { sol_24h_usd: null },
    as_of_utc: new Date().toISOString(),
    live: true,
};

export async function GET() {
    try {
        const headers = { "Accept": "application/json" };
        const opts = { headers, next: { revalidate: 0 } };

        const [coinRes, globalRes, fngRes] = await Promise.allSettled([
            fetch(COINGECKO_URL, opts),
            fetch(GLOBAL_URL, opts),
            fetch(FEAR_GREED_URL, opts),
        ]);

        // ── SOL price data ───────────────────────────────────────
        let sol = { price: null as number | null, change_24h: null as number | null, change_7d: null as number | null };
        let mkt_cap = { solana_mkt_cap_usd: null as number | null, change_24h: null as number | null };
        let vol = { sol_24h_usd: null as number | null };

        if (coinRes.status === "fulfilled" && coinRes.value.ok) {
            const coins = await coinRes.value.json();
            const s = coins?.[0];
            if (s) {
                sol.price = typeof s.current_price === "number" ? s.current_price : null;
                sol.change_24h = typeof s.price_change_percentage_24h === "number" ? s.price_change_percentage_24h : null;
                sol.change_7d = typeof s.price_change_percentage_7d_in_currency === "number" ? s.price_change_percentage_7d_in_currency : null;
                mkt_cap.solana_mkt_cap_usd = typeof s.market_cap === "number" ? s.market_cap : null;
                mkt_cap.change_24h = typeof s.market_cap_change_percentage_24h === "number" ? s.market_cap_change_percentage_24h : null;
                vol.sol_24h_usd = typeof s.total_volume === "number" ? s.total_volume : null;
            }
        }

        // ── Global data (BTC dominance, total vol) ───────────────
        let btc_dominance = { value: null as number | null };

        if (globalRes.status === "fulfilled" && globalRes.value.ok) {
            const g = await globalRes.value.json();
            const dom = g?.data?.market_cap_percentage?.btc;
            btc_dominance.value = typeof dom === "number" ? dom : null;
            // If no vol from coin endpoint, fall back to global total
            if (!vol.sol_24h_usd) {
                const totalVol = g?.data?.total_volume?.usd;
                vol.sol_24h_usd = typeof totalVol === "number" ? totalVol : null;
            }
        }

        // ── Fear & Greed ─────────────────────────────────────────
        let fear_greed = { value: null as number | null, label: "n/a" as string };

        if (fngRes.status === "fulfilled" && fngRes.value.ok) {
            const fng = await fngRes.value.json();
            const entry = fng?.data?.[0];
            if (entry) {
                fear_greed.value = parseInt(entry.value, 10) || null;
                fear_greed.label = entry.value_classification ?? "n/a";
            }
        }

        const payload = {
            sol,
            mkt_cap,
            fear_greed,
            btc_dominance,
            vol,
            as_of_utc: new Date().toISOString(),
            live: true,
        };

        return NextResponse.json(payload, {
            headers: {
                "Cache-Control": "public, s-maxage=180, stale-while-revalidate=60",
            },
        });
    } catch (err) {
        console.error("market-prices fetch error:", err);
        return NextResponse.json(FALLBACK);
    }
}
