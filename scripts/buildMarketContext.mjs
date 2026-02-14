import fs from "fs";
import path from "path";

const cwd = process.cwd();
const dataOut = path.join(cwd, "data", "market_context.json");
const rootOut = path.join(cwd, "market_context.json");
const publicOut = path.join(cwd, "public", "market_context.json");

const FALLBACK_CONTEXT = {
  as_of_utc: new Date().toISOString(),
  sol: {
    price: null,
    change_24h: null,
    change_7d: null,
  },
  mkt_cap: {
    solana_mkt_cap_usd: null,
    change_24h: null,
  },
  fear_greed: {
    value: null,
    label: "n/a",
  },
  btc_dominance: {
    value: null,
  },
  vol: {
    sol_24h_usd: null,
  },
};

const loadJson = (filePath) => {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
};

const withTimeout = async (url, timeoutMs = 10000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      },
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
};

const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const loadPrevious = () =>
  loadJson(dataOut) || loadJson(rootOut) || loadJson(publicOut) || FALLBACK_CONTEXT;

const main = async () => {
  const previous = loadPrevious();
  const next = {
    ...FALLBACK_CONTEXT,
    ...previous,
    as_of_utc: new Date().toISOString(),
  };

  try {
    const solRes = await withTimeout(
      "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=solana&price_change_percentage=7d"
    );
    if (solRes.ok) {
      const solJson = await solRes.json();
      const sol = Array.isArray(solJson) ? solJson[0] : null;
      next.sol = {
        price: toNum(sol?.current_price) ?? next.sol.price ?? null,
        change_24h: toNum(sol?.price_change_percentage_24h) ?? next.sol.change_24h ?? null,
        change_7d:
          toNum(sol?.price_change_percentage_7d_in_currency) ?? next.sol.change_7d ?? null,
      };
      next.mkt_cap = {
        solana_mkt_cap_usd: toNum(sol?.market_cap) ?? next.mkt_cap.solana_mkt_cap_usd ?? null,
        change_24h: toNum(sol?.market_cap_change_percentage_24h) ?? next.mkt_cap.change_24h ?? null,
      };
      next.vol = {
        sol_24h_usd: toNum(sol?.total_volume) ?? next.vol.sol_24h_usd ?? null,
      };
    }
  } catch {
    // keep previous values
  }

  try {
    const globalRes = await withTimeout("https://api.coingecko.com/api/v3/global");
    if (globalRes.ok) {
      const globalJson = await globalRes.json();
      next.btc_dominance = {
        value:
          toNum(globalJson?.data?.market_cap_percentage?.btc) ??
          next.btc_dominance.value ??
          null,
      };
    }
  } catch {
    // keep previous values
  }

  try {
    const fgRes = await withTimeout("https://api.alternative.me/fng/?limit=1&format=json");
    if (fgRes.ok) {
      const fgJson = await fgRes.json();
      const row = fgJson?.data?.[0];
      const value = toNum(row?.value);
      next.fear_greed = {
        value: value ?? next.fear_greed.value ?? null,
        label: String(row?.value_classification || next.fear_greed.label || "n/a"),
      };
    }
  } catch {
    // keep previous values
  }

  fs.mkdirSync(path.dirname(dataOut), { recursive: true });
  fs.mkdirSync(path.dirname(publicOut), { recursive: true });
  fs.writeFileSync(dataOut, JSON.stringify(next, null, 2), "utf-8");
  fs.writeFileSync(rootOut, JSON.stringify(next, null, 2), "utf-8");
  fs.writeFileSync(publicOut, JSON.stringify(next, null, 2), "utf-8");

  console.log(`Saved market context -> ${dataOut}`);
};

main().catch((err) => {
  console.error("market:build failed:", err?.message || err);
  process.exit(1);
});

