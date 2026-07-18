#!/usr/bin/env node
/**
 * dlmmScanner.mjs
 *
 * Finds Meteora DLMM pools currently earning outsized fees relative to their
 * TVL ("printers"), classifies them into a SAFE and a DEGEN tier, and alerts
 * to Slack (+ Telegram, if configured) only on new/upgraded/stale-cooldown
 * pools - not every pool on every run.
 *
 * Two persisted outputs:
 *  - data/dlmm_printers.json (+ public/data/ mirror): current snapshot for
 *    the app's /api/scan route. Overwritten every run, never committed.
 *  - state.json (repo root): { [poolAddress]: { tier, alertedAt } }, used to
 *    decide what's actually worth re-alerting on. Committed back to the repo
 *    each run by the GitHub Actions workflow, since there's no database.
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
const WSOL_MINT = 'So11111111111111111111111111111111111111112';

const OUTPUT_PATH = './data/dlmm_printers.json';
const OUTPUT_PATH_MIRROR = './public/data/dlmm_printers.json';
const STATE_PATH = './state.json';

const REALERT_COOLDOWN_MS = 2 * 60 * 60 * 1000; // re-alert a pool that's still qualifying after this long
const STATE_MAX_AGE_MS = 6 * 60 * 60 * 1000;     // prune state entries older than this

const SCAN_CONFIG = {
  pagesToScan: 5, // page_size is fixed at 10 server-side; pagination is sorted by 24h volume desc
  maxResultsPerTier: 8, // not in spec - a guardrail so a busy market can't spam an unbounded alert
};

const TIERS = {
  SAFE: {
    name: 'SAFE',
    emoji: '🟢',
    minTvlUsd: 10_000,
    minPoolAgeHours: 6,
    minFees30mUsd: 300,
    minFeeTvlRatio30m: 0,
  },
  DEGEN: {
    name: 'DEGEN',
    emoji: '🚨',
    minTvlUsd: 3_000,
    minPoolAgeHours: 0.5, // skip anything younger - instant-rug zone
    minFees30mUsd: 150,
    minFeeTvlRatio30m: 2.0,
  },
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
  for (let page = 1; page <= SCAN_CONFIG.pagesToScan; page++) {
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

function qualifiesForTier(p, tier) {
  return (
    p._tvl >= tier.minTvlUsd &&
    p._ageHours >= tier.minPoolAgeHours &&
    p._fees30m >= tier.minFees30mUsd &&
    p._feeTvl30m >= tier.minFeeTvlRatio30m
  );
}

// DEGEN is checked first - a pool qualifying for both tiers is the stronger
// signal, so it's reported once, under DEGEN only.
function classifyPool(p) {
  if (qualifiesForTier(p, TIERS.DEGEN)) return 'DEGEN';
  if (qualifiesForTier(p, TIERS.SAFE)) return 'SAFE';
  return null;
}

function findCandidates(pools) {
  const classified = pools
    .filter((p) => p.is_blacklisted !== true)
    .map((p) => {
      const enriched = {
        ...p,
        _tvl: Number(p.tvl ?? p.liquidity ?? 0),
        _fees30m: Number(p.fees?.['30m'] ?? 0),
        _feeTvl30m: Number(p.fee_tvl_ratio?.['30m'] ?? 0),
        _feeTvl1h: Number(p.fee_tvl_ratio?.['1h'] ?? 0),
        _ageHours: poolAgeHours(p),
      };
      return { ...enriched, _tier: classifyPool(enriched), _momentum: enriched._feeTvl30m > enriched._feeTvl1h };
    })
    .filter((p) => p._tier !== null);

  const byFeeTvl30mDesc = (a, b) => b._feeTvl30m - a._feeTvl30m;

  return {
    safe: classified.filter((p) => p._tier === 'SAFE').sort(byFeeTvl30mDesc).slice(0, SCAN_CONFIG.maxResultsPerTier),
    degen: classified.filter((p) => p._tier === 'DEGEN').sort(byFeeTvl30mDesc).slice(0, SCAN_CONFIG.maxResultsPerTier),
  };
}

// ============================================================================
// STATE / DELTA ALERTING
// ============================================================================

function loadState() {
  if (!fs.existsSync(STATE_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

function pruneState(state, nowMs) {
  const pruned = {};
  for (const [address, entry] of Object.entries(state)) {
    const alertedAt = Date.parse(entry?.alertedAt ?? '');
    if (Number.isFinite(alertedAt) && nowMs - alertedAt <= STATE_MAX_AGE_MS) {
      pruned[address] = entry;
    }
  }
  return pruned;
}

// New to the list, upgraded SAFE -> DEGEN, or its last alert aged out of the cooldown.
function shouldAlert(pool, state, nowMs) {
  const existing = state[pool.address];
  if (!existing) return true;
  if (existing.tier === 'SAFE' && pool._tier === 'DEGEN') return true;
  const lastAlertMs = Date.parse(existing.alertedAt ?? '');
  return !Number.isFinite(lastAlertMs) || nowMs - lastAlertMs > REALERT_COOLDOWN_MS;
}

function updateState(state, allCandidates, alertedAddresses, nowIso) {
  const next = { ...state };
  for (const p of allCandidates) {
    const prev = next[p.address];
    next[p.address] = {
      tier: p._tier,
      // Only bump the timestamp when we actually alert - seeing a pool again
      // during its cooldown shouldn't reset the clock.
      alertedAt: alertedAddresses.has(p.address) ? nowIso : (prev?.alertedAt ?? nowIso),
    };
  }
  return next;
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

function projectTokenMint(p) {
  if (p.token_y?.address === WSOL_MINT) return p.token_x?.address ?? null;
  if (p.token_x?.address === WSOL_MINT) return p.token_y?.address ?? null;
  return p.token_x?.address ?? null;
}

function formatPoolBlock(p) {
  const binStep = p.pool_config?.bin_step ?? '?';
  const baseFee = p.pool_config?.base_fee_pct ?? '?';
  const emoji = TIERS[p._tier].emoji;
  const momentum = p._momentum ? ' 📈' : '';
  const mint = projectTokenMint(p);

  // Slack mrkdwn link syntax - collapses two lines of raw addresses into one
  // line of short clickable labels.
  const links = [`<https://app.meteora.ag/dlmm/${p.address}|Meteora ↗>`];
  if (mint) links.push(`<https://gmgn.ai/sol/token/${mint}|Chart ↗>`);

  return `${emoji} *${p.name}* (${binStep}/${baseFee}%)${momentum} — TVL ${usd(p._tvl)} | 30m fees ${usd(p._fees30m)} | fee/TVL 30m ${p._feeTvl30m.toFixed(2)}% | age ${formatAge(p._ageHours)}\n${links.join(' · ')}`;
}

function formatTierMessage(tierName, pools) {
  if (pools.length === 0) return null;
  const header = tierName === 'DEGEN'
    ? `🚨 DEGEN Hot Pools — ${new Date().toUTCString()}\n⚠️ Degen tier: high IL/rug risk. Small size, fast exits.`
    : `🟢 SAFE Hot Pools — ${new Date().toUTCString()}`;
  return `${header}\n\n${pools.map(formatPoolBlock).join('\n\n')}`;
}

// ============================================================================
// SENDERS
// ============================================================================

async function sendSlack(text, webhookUrl) {
  if (!webhookUrl) return;
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  } catch (error) {
    console.error('Slack send failed:', error.message);
  }
}

// Note: `text` uses Slack's <url|label> link syntax, which Telegram renders
// as literal text, not a link. Fine while Telegram is unconfigured; revisit
// the message format if Telegram is ever wired up for real.
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

async function sendTierAlert(tierName, pools, webhookUrl) {
  const message = formatTierMessage(tierName, pools);
  if (!message) return false;
  await Promise.all([sendSlack(message, webhookUrl), sendTelegram(message)]);
  return true;
}

// ============================================================================
// MAIN
// ============================================================================

function toPublicShape(p) {
  return {
    address: p.address,
    name: p.name,
    tier: p._tier,
    momentum: p._momentum,
    tvlUsd: p._tvl,
    fees30mUsd: p._fees30m,
    feeTvlRatio30m: p._feeTvl30m,
    feeTvlRatio1h: p._feeTvl1h,
    ageHours: Math.round(p._ageHours * 10) / 10,
    binStep: p.pool_config?.bin_step ?? null,
    baseFeePct: p.pool_config?.base_fee_pct ?? null,
    url: `https://app.meteora.ag/dlmm/${p.address}`,
    chartUrl: projectTokenMint(p) ? `https://gmgn.ai/sol/token/${projectTokenMint(p)}` : null,
  };
}

function writeOutput(output) {
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  fs.mkdirSync(path.dirname(OUTPUT_PATH_MIRROR), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH_MIRROR, JSON.stringify(output, null, 2));
}

export async function scan() {
  let pools = [];
  try {
    pools = await fetchPools();
    console.log(`Scanned ${pools.length} pools across ${SCAN_CONFIG.pagesToScan} pages`);
  } catch (error) {
    // Never let an upstream outage fail the workflow - proceed with zero
    // pools so state pruning and the UI snapshot still happen cleanly.
    console.error('Pool fetch failed:', error.message);
  }

  // Set DEBUG=1 to double-check the API's field names haven't changed
  // upstream - this is an undocumented endpoint.
  if (process.env.DEBUG === '1' && pools[0]) {
    console.log('Raw pool sample:', JSON.stringify(pools[0], null, 2));
  }

  const { safe, degen } = findCandidates(pools);
  const allCandidates = [...safe, ...degen];

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const state = pruneState(loadState(), nowMs);

  const safeToAlert = safe.filter((p) => shouldAlert(p, state, nowMs));
  const degenToAlert = degen.filter((p) => shouldAlert(p, state, nowMs));
  const alertedAddresses = new Set([...safeToAlert, ...degenToAlert].map((p) => p.address));

  // Both tiers post to the same channel - one webhook, no separate DEGEN routing.
  const webhook = process.env.SLACK_WEBHOOK_URL;

  const safeAlerted = await sendTierAlert('SAFE', safeToAlert, webhook);
  const degenAlerted = await sendTierAlert('DEGEN', degenToAlert, webhook);

  const nextState = updateState(state, allCandidates, alertedAddresses, nowIso);
  fs.writeFileSync(STATE_PATH, JSON.stringify(nextState, null, 2));

  const output = {
    generated_at: nowIso,
    printers: [...degen, ...safe].map(toPublicShape), // DEGEN first - it's the stronger signal
    alerted: { safe: safeToAlert.length, degen: degenToAlert.length },
  };
  writeOutput(output);

  return { ...output, safeAlerted, degenAlerted };
}

// ---- CLI ----
if (import.meta.url === `file://${process.argv[1]}`) {
  scan()
    .then((r) => {
      const total = r.alerted.safe + r.alerted.degen;
      console.log(total > 0 ? `Alerted on ${total} pool(s) (${r.alerted.degen} degen, ${r.alerted.safe} safe)` : 'Nothing new to alert on');
    })
    .catch((error) => {
      // Log and exit 0 - an API hiccup should never turn the workflow red.
      console.error('Scan failed:', error.message);
      process.exit(0);
    });
}
