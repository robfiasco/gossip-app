#!/usr/bin/env node
/**
 * dlmmScanner.mjs
 *
 * Finds Meteora DLMM pools currently earning outsized fees relative to their
 * TVL ("printers"), pings Telegram/Slack, and writes the result so the app's
 * /api/scan route can serve it without re-scanning on every request.
 * Output: data/dlmm_printers.json (mirrored to public/data/)
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
try {
  const dotenv = require('dotenv');
  dotenv.config({ path: '.env.local' });
  dotenv.config();
} catch { }

import fs from 'fs';
import path from 'path';

const API_URL = 'https://dlmm.datapi.meteora.ag/pools';
const OUTPUT_PATH = './data/dlmm_printers.json';
const OUTPUT_PATH_MIRROR = './public/data/dlmm_printers.json';

const CONFIG = {
  minTvlUsd: 10_000,
  minFees30mUsd: 300,
  minPoolAgeHours: 6,
  minMarketCapUsd: 400_000, // enrichment-only cutoff
  candidatePoolCount: 20,   // pre-enrichment shortlist, so MC drops still leave up to maxResults
  maxResults: 8,
  pagesToScan: 5,           // page_size is fixed at 10 server-side; pagination is sorted by 24h volume desc
};

// ============================================================================
// SIGNAL SOURCING
// ============================================================================

// The `limit` query param is silently ignored by this API - it always returns
// 10 pools per page regardless of what's passed. Pagination appears sorted by
// 24h volume descending (verified by sampling: high page numbers are all
// zero-TVL dead pools) - that's undocumented behavior, not a guarantee, so
// don't assume it holds forever.
async function fetchPools() {
  const pools = [];
  for (let page = 1; page <= CONFIG.pagesToScan; page++) {
    const res = await fetch(`${API_URL}?page=${page}`, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`Meteora API ${res.status}`);
    const json = await res.json();
    const batch = json.data ?? json.pairs ?? [];
    if (!Array.isArray(batch) || batch.length === 0) break;
    pools.push(...batch);
  }
  return pools;
}

function poolAgeHours(pool) {
  const createdAt = Number(pool.created_at ?? 0);
  if (!createdAt) return 0;
  return (Date.now() - createdAt) / (60 * 60 * 1000);
}

function findPrinterCandidates(pools) {
  return pools
    .map((p) => ({
      ...p,
      _tvl: Number(p.tvl ?? p.liquidity ?? 0),
      _fees30m: Number(p.fees?.['30m'] ?? 0),
      _feeTvl30m: Number(p.fee_tvl_ratio?.['30m'] ?? 0),
      _feeTvl1h: Number(p.fee_tvl_ratio?.['1h'] ?? 0),
      _ageHours: poolAgeHours(p),
    }))
    .filter((p) => p.is_blacklisted !== true)
    .filter((p) => p._tvl >= CONFIG.minTvlUsd)
    .filter((p) => p._fees30m >= CONFIG.minFees30mUsd)
    .filter((p) => p._ageHours >= CONFIG.minPoolAgeHours)
    .sort((a, b) => b._feeTvl30m - a._feeTvl30m)
    .slice(0, CONFIG.candidatePoolCount);
}

// ============================================================================
// OPTIONAL ENRICHMENT (market cap via DexScreener) - separate + best-effort so
// a DexScreener outage never breaks the core scan.
// ============================================================================

async function fetchMarketCap(tokenAddress) {
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`);
    if (!res.ok) return null;
    const json = await res.json();
    const pairs = Array.isArray(json?.pairs) ? json.pairs : [];
    const match = pairs.find((p) => p?.baseToken?.address === tokenAddress) ?? pairs[0];
    const marketCap = Number(match?.marketCap ?? match?.fdv ?? 0);
    return marketCap > 0 ? marketCap : null;
  } catch {
    return null;
  }
}

async function enrichWithMarketCap(candidates) {
  const enriched = await Promise.all(
    candidates.map(async (pool) => {
      const tokenAddress = pool.token_x?.address;
      const marketCapUsd = tokenAddress ? await fetchMarketCap(tokenAddress) : null;
      return { ...pool, _marketCapUsd: marketCapUsd };
    })
  );
  // Only drop pools we could actually price and confirmed below the cutoff -
  // an enrichment miss (null) should never remove an otherwise-qualifying pool.
  return enriched.filter((p) => p._marketCapUsd === null || p._marketCapUsd >= CONFIG.minMarketCapUsd);
}

// ============================================================================
// FORMATTING
// ============================================================================

const usd = (n) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M`
    : n >= 1_000 ? `$${(n / 1_000).toFixed(1)}K`
      : `$${n.toFixed(0)}`;

const formatAge = (hours) =>
  hours >= 24 ? `${(hours / 24).toFixed(1)}d` : `${hours.toFixed(1)}h`;

function formatTelegramMessage(printers) {
  const lines = printers.map((p, i) => {
    const binStep = p.pool_config?.bin_step ?? '?';
    const baseFee = p.pool_config?.base_fee_pct ?? '?';
    return `${i + 1}. ${p.name} (${binStep}/${baseFee}%) — TVL ${usd(p._tvl)} | 30m fees ${usd(p._fees30m)} | fee/TVL 30m ${p._feeTvl30m.toFixed(2)}% — https://app.meteora.ag/dlmm/${p.address}`;
  });
  return `🖨️ DLMM Hot Pools — ${new Date().toUTCString()}\n\n${lines.join('\n')}`;
}

// ============================================================================
// SENDERS
// ============================================================================

async function sendTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    });
  } catch (error) {
    console.error('Telegram send failed:', error.message);
  }
}

async function sendSlack(text) {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  } catch (error) {
    console.error('Slack send failed:', error.message);
  }
}

// ============================================================================
// MAIN
// ============================================================================

function toPublicShape(printers) {
  return printers.map((p) => ({
    address: p.address,
    name: p.name,
    tvlUsd: p._tvl,
    fees30mUsd: p._fees30m,
    feeTvlRatio30m: p._feeTvl30m,
    feeTvlRatio1h: p._feeTvl1h,
    ageHours: Math.round(p._ageHours * 10) / 10,
    binStep: p.pool_config?.bin_step ?? null,
    baseFeePct: p.pool_config?.base_fee_pct ?? null,
    marketCapUsd: p._marketCapUsd ?? null,
    url: `https://app.meteora.ag/dlmm/${p.address}`,
  }));
}

export async function scan({ sendAlerts = true } = {}) {
  const pools = await fetchPools();
  console.log(`Scanned ${pools.length} pools across ${CONFIG.pagesToScan} pages`);

  // Flip DLMM_DEBUG=1 to double-check the API's field names haven't changed
  // upstream - this is an undocumented endpoint.
  if (process.env.DLMM_DEBUG === '1' && pools[0]) {
    console.log('Raw pool sample:', JSON.stringify(pools[0], null, 2));
  }

  const candidates = findPrinterCandidates(pools);
  const enriched = await enrichWithMarketCap(candidates);
  const printers = enriched.slice(0, CONFIG.maxResults);

  const publicPrinters = toPublicShape(printers);

  let alerted = false;
  if (printers.length > 0 && sendAlerts) {
    const message = formatTelegramMessage(printers);
    await Promise.all([sendTelegram(message), sendSlack(message)]);
    alerted = true;
  }

  const output = {
    generated_at: new Date().toISOString(),
    printers: publicPrinters,
    alerted,
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  fs.mkdirSync(path.dirname(OUTPUT_PATH_MIRROR), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH_MIRROR, JSON.stringify(output, null, 2));

  return output;
}

// ---- CLI ----
if (import.meta.url === `file://${process.argv[1]}`) {
  scan()
    .then((r) => console.log(r.alerted ? `Alerted on ${r.printers.length} pools` : 'Nothing printing right now'))
    .catch((error) => {
      console.error('Scan failed:', error.message);
      // Write an empty result so the API route has something graceful to serve
      // even when the upstream API is down, rather than serving stale data forever.
      fs.mkdirSync('./data', { recursive: true });
      fs.writeFileSync(OUTPUT_PATH, JSON.stringify({ generated_at: new Date().toISOString(), printers: [], alerted: false, error: error.message }, null, 2));
      process.exit(1);
    });
}
