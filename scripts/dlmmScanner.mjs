#!/usr/bin/env node
/**
 * dlmmScanner.mjs
 *
 * Finds Meteora DLMM pools currently earning outsized fees relative to their
 * TVL ("printers"), classifies them into a SAFE and a DEGEN tier, and alerts
 * to Slack only on new/upgraded/stale-cooldown pools - not every pool on
 * every run.
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
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

const OUTPUT_PATH = './data/dlmm_printers.json';
const OUTPUT_PATH_MIRROR = './public/data/dlmm_printers.json';
const STATE_PATH = './state.json';

const REALERT_COOLDOWN_MS = 2 * 60 * 60 * 1000; // re-alert a pool that's still qualifying after this long
const STATE_MAX_AGE_MS = 6 * 60 * 60 * 1000;     // prune state entries older than this

const SCAN_CONFIG = {
  pagesToScan: 5, // page_size is fixed at 10 server-side; pagination is sorted by 24h volume desc
  maxResultsPerTier: 8, // not in spec - a guardrail so a busy market can't spam an unbounded alert
};

const MIN_M5_TXNS = (() => {
  const raw = Number(process.env.MIN_M5_TXNS);
  return Number.isFinite(raw) && raw >= 0 ? raw : 30;
})();

// A pool can generate real LP fees while its price bleeds out (sell volume
// is still volume) - this filters out sustained 1h declines, not momentary
// 5m noise. 0 = must be flat or up over the last hour.
const MIN_PRICE_CHANGE_H1 = (() => {
  const raw = Number(process.env.MIN_PRICE_CHANGE_H1);
  return Number.isFinite(raw) ? raw : 0;
})();

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
    // At the 2.0% ratio floor, $150 implied a ~$7,500 TVL requirement - well
    // above minTvlUsd, so the two thresholds were mutually exclusive below
    // that and DEGEN never fired in practice (verified: 0/200 live pools
    // sampled, closest miss was $108 at a 3.09% ratio). $100 drops the
    // implied floor to ~$5,000, closer to what minTvlUsd actually implies.
    minFees30mUsd: 100,
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

// The API's `fees` / `fee_tvl_ratio` are gross trading fees - the protocol
// takes a cut before LPs get paid (commonly 5-20%, verified live: standard
// pools mostly 5%, pump.fun launches 10%, some others 20% - varies per pool,
// not just by launchpad tag). Read per-pool rather than assuming a tier.
// Checked in order: pool_config.protocol_fee_pct, pool_config.protocol_share,
// top-level protocol_fee_pct - only falls back to 10 if none of those exist.
function resolveProtocolFeePct(p) {
  const raw = p.pool_config?.protocol_fee_pct ?? p.pool_config?.protocol_share ?? p.protocol_fee_pct;
  if (raw == null) return { value: 10, wasFallback: true };
  const val = Number(raw);
  if (!Number.isFinite(val)) return { value: 10, wasFallback: true };
  return { value: val > 100 ? val / 100 : val, wasFallback: false }; // defensively handle basis points
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

// Requiring a SOL or USDC side isn't just about legitimacy of the token
// name (Meteora's data already includes real mint addresses, not spoofable
// display names) - it's about market structure. Two obscure tokens paired
// against each other have no real stable liquidity anchor, are cheap to
// wash-trade into an inflated fee/TVL ratio, and can evaporate fast (verified
// live: a SKHY-SLX pool alerted with $14.6K TVL and was down to $43 - a
// 99.7% collapse - a few hours later).
function hasBlueChipQuote(p) {
  const quotes = [p.token_x?.address, p.token_y?.address];
  return quotes.includes(WSOL_MINT) || quotes.includes(USDC_MINT);
}

function findCandidates(pools) {
  let protocolFeeRead = 0;
  let protocolFeeFallback = 0;

  const classified = pools
    .filter((p) => p.is_blacklisted !== true)
    .filter(hasBlueChipQuote)
    .map((p) => {
      const { value: protocolFeePct, wasFallback } = resolveProtocolFeePct(p);
      if (wasFallback) {
        protocolFeeFallback += 1;
        console.warn(`WARN: protocol_fee_pct missing for ${p.name} (${p.address}), using 10%`);
      } else {
        protocolFeeRead += 1;
      }

      const lpShare = 1 - protocolFeePct / 100;
      const enriched = {
        ...p,
        _tvl: Number(p.tvl ?? p.liquidity ?? 0),
        // Net of the protocol's cut - everything downstream (tier thresholds,
        // sorting, momentum, message text) operates on what LPs actually earn.
        _fees30m: Number(p.fees?.['30m'] ?? 0) * lpShare,
        _feeTvl30m: Number(p.fee_tvl_ratio?.['30m'] ?? 0) * lpShare,
        _feeTvl1h: Number(p.fee_tvl_ratio?.['1h'] ?? 0) * lpShare,
        _volume30m: Number(p.volume?.['30m'] ?? 0), // already on the pool object - no extra call needed
        _ageHours: poolAgeHours(p),
        _protocolFeePct: protocolFeePct,
      };
      return { ...enriched, _tier: classifyPool(enriched), _momentum: enriched._feeTvl30m > enriched._feeTvl1h };
    })
    .filter((p) => p._tier !== null);

  console.log(`Protocol fee sources: ${protocolFeeRead} read, ${protocolFeeFallback} fallback`);

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
// Returns why (or whether) this pool is worth alerting on right now - the
// same reason doubles as the "why are you seeing this" tag in the message.
function alertReason(pool, state, nowMs) {
  const existing = state[pool.address];
  if (!existing) return 'new';
  if (existing.tier === 'SAFE' && pool._tier === 'DEGEN') return 'upgraded';
  const lastAlertMs = Date.parse(existing.alertedAt ?? '');
  if (!Number.isFinite(lastAlertMs) || nowMs - lastAlertMs > REALERT_COOLDOWN_MS) return 'refresh';
  return null;
}

function shouldAlert(pool, state, nowMs) {
  return alertReason(pool, state, nowMs) !== null;
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
      // Never overwritten once set - this is "how long has this pool been
      // continuously worth tracking," not tied to individual alerts.
      firstSeenAt: prev?.firstSeenAt ?? nowIso,
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

function projectTokenMint(p) {
  const isQuote = (addr) => addr === WSOL_MINT || addr === USDC_MINT;
  if (isQuote(p.token_y?.address)) return p.token_x?.address ?? null;
  if (isQuote(p.token_x?.address)) return p.token_y?.address ?? null;
  return p.token_x?.address ?? null;
}

// Picks the DexScreener pair that's actually this Meteora pool (matched by
// on-chain pool address, verified live: DexScreener does index individual
// Meteora DLMM pools with dexId "meteora" and a pairAddress equal to the
// pool's own address) - falling back to the highest-liquidity pair for the
// token if this exact pool isn't indexed yet.
function pickBestPair(pairs, poolAddress) {
  if (!Array.isArray(pairs) || pairs.length === 0) return null;
  const exact = pairs.find((pair) => pair?.pairAddress === poolAddress);
  if (exact) return exact;
  return [...pairs].sort((a, b) => Number(b?.liquidity?.usd ?? 0) - Number(a?.liquidity?.usd ?? 0))[0] ?? null;
}

// Best-effort: one DexScreener call per token mint (cached within this run,
// so pools sharing a token - e.g. several bin-step variants of the same pair
// - don't each trigger their own request), used for both the chart link and
// the 5m activity segment in the alert message.
async function enrichWithDexScreener(candidates) {
  const cache = new Map(); // mint -> Promise<pairs[] | null>

  const fetchPairs = (mint) => {
    if (cache.has(mint)) return cache.get(mint);
    const promise = (async () => {
      try {
        const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
        if (!res.ok) return null;
        const json = await res.json();
        return Array.isArray(json?.pairs) ? json.pairs : null;
      } catch {
        return null;
      }
    })();
    cache.set(mint, promise);
    return promise;
  };

  return Promise.all(
    candidates.map(async (p) => {
      const mint = projectTokenMint(p);
      if (!mint) return { ...p, _chartUrl: null, _m5: null };

      const pairs = await fetchPairs(mint);
      const best = pickBestPair(pairs, p.address);
      const chartUrl = best?.url ?? `https://dexscreener.com/solana/${mint}`;
      const m5 = best?.txns?.m5
        ? {
          buys: Number(best.txns.m5.buys ?? 0),
          sells: Number(best.txns.m5.sells ?? 0),
          priceChange: Number(best.priceChange?.m5 ?? 0),
        }
        : null;
      // Tracked separately from _m5 (a different field on the same pair) so a
      // pair missing txns.m5 doesn't also lose its price-trend data, or vice versa.
      const priceChangeH1 = typeof best?.priceChange?.h1 === 'number' ? best.priceChange.h1 : null;
      const imageUrl = typeof best?.info?.imageUrl === 'string' ? best.info.imageUrl : null;

      return { ...p, _chartUrl: chartUrl, _m5: m5, _priceChangeH1: priceChangeH1, _imageUrl: imageUrl };
    })
  );
}

// Fail open: missing DexScreener data should never suppress an alert on its own.
function passesActivityGate(p) {
  if (!p._m5) return true;
  const totalTxns = p._m5.buys + p._m5.sells;
  if (totalTxns < MIN_M5_TXNS) {
    console.log(`Skipped ${p.name}: only ${totalTxns} m5 txns (min ${MIN_M5_TXNS})`);
    return false;
  }
  return true;
}

// Fail open: missing DexScreener data should never suppress an alert on its
// own. A pool can generate real fees during a sell-off (volume is volume
// regardless of direction), so this specifically catches sustained 1h
// declines rather than relying on the momentary 5m tick.
function passesPriceTrendGate(p) {
  if (p._priceChangeH1 == null) return true;
  if (p._priceChangeH1 < MIN_PRICE_CHANGE_H1) {
    console.log(`Skipped ${p.name}: down ${p._priceChangeH1.toFixed(2)}% over 1h (min ${MIN_PRICE_CHANGE_H1}%)`);
    return false;
  }
  return true;
}

const REASON_LABELS = {
  // Slack renders 🆕 as its own "NEW" badge - no need to spell it out too.
  new: '🆕',
  refresh: '🔁 still printing',
  upgraded: '⬆️ upgraded from standard',
};

// Formats as Eastern time (EDT/EST, whichever applies) rather than GMT.
function formatTimestamp(date) {
  return date.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  });
}

// "Been printing for" duration since first seen - not a personal position
// hold time, just how long this pool has continuously qualified for a tier.
function formatDuration(ms) {
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

// One Block Kit "attachment" per pool, which is the only way an incoming
// webhook can get a colored left border - plain `blocks` alone don't support it.
function buildSlackAttachment(p) {
  const reasonLabel = REASON_LABELS[p._alertReason] ?? '';
  const color = p._tier === 'DEGEN' ? '#e01e5a' : '#2eb67d'; // Slack's own red/green
  const m5Text = p._m5 ? `${p._m5.buys + p._m5.sells} tx` : 'n/a';
  const printingFor = formatDuration(Date.now() - Date.parse(p._firstSeenAt));

  const links = [`<https://app.meteora.ag/dlmm/${p.address}|Meteora ↗>`];
  if (p._chartUrl) links.push(`<${p._chartUrl}|Chart ↗>`);

  const titleBlock = {
    type: 'section',
    text: { type: 'mrkdwn', text: `*${p.name}*${reasonLabel ? `  ·  ${reasonLabel}` : ''}` },
  };
  // Best-effort - not every token has an indexed image, and a missing one
  // shouldn't break the card.
  if (p._imageUrl) {
    titleBlock.accessory = { type: 'image', image_url: p._imageUrl, alt_text: p.name };
  }

  return {
    color,
    // No tier emoji here - the colored bar already says SAFE vs DEGEN.
    blocks: [
      titleBlock,
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*TVL*\n${usd(p._tvl)}` },
          { type: 'mrkdwn', text: `*30m Net Fees*\n${usd(p._fees30m)}` },
          { type: 'mrkdwn', text: `*Fee/TVL*\n${p._feeTvl30m.toFixed(2)}%` },
          { type: 'mrkdwn', text: `*30m Volume*\n${usd(p._volume30m)}` },
          { type: 'mrkdwn', text: `*5m Activity*\n${m5Text}` },
          { type: 'mrkdwn', text: `*Printing For*\n${printingFor}` },
        ],
      },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: links.join(' · ') }],
      },
    ],
  };
}

function buildSlackPayload(tierName, pools) {
  if (pools.length === 0) return null;
  const timestamp = formatTimestamp(new Date());
  // "STANDARD" not "SAFE" - the tier is a fee/activity filter, not a risk
  // guarantee, and shouldn't imply one.
  const text = tierName === 'DEGEN'
    ? `*DEGEN Hot Pools* — ${timestamp}\n⚠️ Degen tier: high IL/rug risk. Small size, fast exits.`
    : `*STANDARD Hot Pools* — ${timestamp}`;
  return { text, attachments: pools.map(buildSlackAttachment) };
}

// ============================================================================
// SENDERS
// ============================================================================

async function sendSlack(payload, webhookUrl) {
  if (!webhookUrl) return;
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.error('Slack send failed:', error.message);
  }
}

async function sendTierAlert(tierName, pools, webhookUrl) {
  const slackPayload = buildSlackPayload(tierName, pools);
  if (!slackPayload) return false;
  await sendSlack(slackPayload, webhookUrl);
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
    fees30mUsd: p._fees30m, // net of protocol cut
    feeTvlRatio30m: p._feeTvl30m, // net of protocol cut
    feeTvlRatio1h: p._feeTvl1h, // net of protocol cut
    volume30mUsd: p._volume30m,
    protocolFeePct: p._protocolFeePct,
    ageHours: Math.round(p._ageHours * 10) / 10,
    binStep: p.pool_config?.bin_step ?? null,
    baseFeePct: p.pool_config?.base_fee_pct ?? null,
    url: `https://app.meteora.ag/dlmm/${p.address}`,
    chartUrl: p._chartUrl ?? null,
    imageUrl: p._imageUrl ?? null,
    m5: p._m5 ?? null,
    priceChangeH1: p._priceChangeH1 ?? null,
    firstSeenAt: p._firstSeenAt ?? null,
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
    console.log('pool_config keys:', Object.keys(pools[0].pool_config ?? {}));
    const feeRelatedTopLevel = Object.keys(pools[0]).filter((k) => /protocol|fee/i.test(k));
    console.log('Top-level fields containing "protocol" or "fee":', feeRelatedTopLevel);
  }

  const candidates = findCandidates(pools);
  const enriched = await enrichWithDexScreener([...candidates.safe, ...candidates.degen]);
  const enrichedSafe = enriched.slice(0, candidates.safe.length);
  const enrichedDegen = enriched.slice(candidates.safe.length);

  // Applied after tiering, before dedup/state - a pool dropped here gets no
  // state entry at all, so it isn't "seen" and can alert fresh once its
  // 5m activity picks back up (or its 1h price trend turns around), rather
  // than being stuck on cooldown.
  const passesGates = (p) => passesActivityGate(p) && passesPriceTrendGate(p);
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const state = pruneState(loadState(), nowMs);

  // _firstSeenAt mirrors exactly what updateState will persist below,
  // computed early so it's available both in the /api/scan output (all
  // candidates) and the alert message (the tagged-and-filtered subset).
  const tagFirstSeen = (list) =>
    list.filter(passesGates).map((p) => ({ ...p, _firstSeenAt: state[p.address]?.firstSeenAt ?? nowIso }));

  const safe = tagFirstSeen(enrichedSafe);
  const degen = tagFirstSeen(enrichedDegen);
  const allCandidates = [...safe, ...degen];

  // Tag each pool with why it's alerting - same value drives the message's
  // "new / still printing / upgraded" line.
  const tagReason = (list) =>
    list
      .map((p) => ({ ...p, _alertReason: alertReason(p, state, nowMs) }))
      .filter((p) => p._alertReason !== null);

  const safeToAlert = tagReason(safe);
  const degenToAlert = tagReason(degen);
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
