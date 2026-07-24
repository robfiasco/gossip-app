#!/usr/bin/env node
/**
 * positionMonitor.mjs
 *
 * Checks one wallet's open Meteora DLMM positions and posts Slack alerts on
 * range status (approaching edge / out of range) and progress toward a
 * personal profit target (accrued LP fees, not directional price PnL -
 * Meteora positions have no on-chain entry price, see app/positions/page.tsx
 * for the full reasoning).
 *
 * Manual test script - not wired into a GitHub Actions workflow yet. Posts
 * every open position's status on every run (no dedup/cooldown state like
 * dlmmScanner.mjs has); fine for a one-off test, would get noisy on a
 * recurring schedule without adding that later.
 *
 * Run: node scripts/positionMonitor.mjs
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
try {
  const dotenv = require('dotenv');
  dotenv.config({ path: '.env.local' });
  dotenv.config();
} catch { }

import { Connection, PublicKey, clusterApiUrl } from '@solana/web3.js';
import { sendSlack } from '../lib/notify.mjs';

const WALLET_ADDRESS = process.env.POSITION_MONITOR_WALLET || '69CZcMnbdciyUKjRZGxorD9i6tuY4UTZ5Wz6GfBnrsZ2';
const RPC_URL = process.env.SOLANA_RPC_URL || clusterApiUrl('mainnet-beta');

// Matches app/positions/page.tsx exactly - keep both in sync if either changes.
const EDGE_WARNING_THRESHOLD = 0.1;
const FEE_PROFIT_TARGET_USD = 20;

const short = (addr) => `${addr.slice(0, 4)}...${addr.slice(-4)}`;

async function fetchTokenInfo(mint) {
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
// when our mint is the quote side instead, back it out via priceNative.
function priceUsdForMint(pair, mint) {
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

async function scanPositions() {
  const connection = new Connection(RPC_URL, 'confirmed');
  const wallet = new PublicKey(WALLET_ADDRESS);

  // @meteora-ag/dlmm's ESM build (dist/index.mjs) has a broken import into
  // @coral-xyz/anchor's CJS directory that Node's ESM resolver rejects
  // ("Directory import ... is not supported"). The package's CJS build
  // (dist/index.js) doesn't have this problem, so pull it in via require()
  // instead of a dynamic import - same package, different entry point.
  // The CJS build's module.exports IS the DLMM class itself (no .default
  // wrapper), with named exports like getPriceOfBinByBinId mixed onto it.
  const DLMM = require('@meteora-ag/dlmm');
  const { getPriceOfBinByBinId } = DLMM;
  const byPool = await DLMM.getAllLbPairPositionsByUser(connection, wallet);

  const infoCache = new Map();
  const getTokenInfo = (mint) => {
    if (!infoCache.has(mint)) infoCache.set(mint, fetchTokenInfo(mint));
    return infoCache.get(mint);
  };

  const rows = [];
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

      // getPriceOfBinByBinId is decimal-invariant - fine for range-percentage
      // math, not fine as a display price (see the bin lookups below).
      const lowerRaw = getPriceOfBinByBinId(lowerBinId, binStep);
      const upperRaw = getPriceOfBinByBinId(upperBinId, binStep);
      const activeRaw = getPriceOfBinByBinId(activeId, binStep);

      let status = 'in-range';
      let pctFromLower = null;
      let pctFromUpper = null;
      if (activeId < lowerBinId) {
        status = 'below';
      } else if (activeId > upperBinId) {
        status = 'above';
      } else {
        const width = upperRaw.minus(lowerRaw);
        pctFromLower = width.isZero() ? 1 : activeRaw.minus(lowerRaw).div(width).toNumber();
        pctFromUpper = 1 - pctFromLower;
      }

      const lowerBin = pos.positionData.positionBinData.find((b) => b.binId === lowerBinId);
      const upperBin = pos.positionData.positionBinData.find((b) => b.binId === upperBinId);
      const activeBin = pos.positionData.positionBinData.find((b) => b.binId === activeId);

      const feeXUsd = tokenXInfo.priceUsd != null
        ? (Number(pos.positionData.feeX.toString()) / 10 ** tokenXDecimals) * tokenXInfo.priceUsd
        : null;
      const feeYUsd = tokenYInfo.priceUsd != null
        ? (Number(pos.positionData.feeY.toString()) / 10 ** tokenYDecimals) * tokenYInfo.priceUsd
        : null;
      const accruedFeesUsd = feeXUsd != null && feeYUsd != null ? feeXUsd + feeYUsd : feeXUsd ?? feeYUsd;

      rows.push({
        positionAddress: pos.publicKey.toBase58(),
        poolAddress: info.publicKey.toBase58(),
        tokenXSymbol,
        tokenYSymbol,
        status,
        pctFromLower,
        pctFromUpper,
        lowerPriceDisplay: lowerBin?.pricePerToken ?? null,
        upperPriceDisplay: upperBin?.pricePerToken ?? null,
        currentPriceDisplay: activeBin?.pricePerToken ?? null,
        accruedFeesUsd,
      });
    }
  }
  return rows;
}

function formatMessage(p) {
  const pairName = `${p.tokenXSymbol}/${p.tokenYSymbol}`;
  const meteoraUrl = `https://app.meteora.ag/dlmm/${p.poolAddress}`;
  const feeLine = p.accruedFeesUsd != null
    ? (p.accruedFeesUsd >= FEE_PROFIT_TARGET_USD
      ? `🎯 Target hit - $${p.accruedFeesUsd.toFixed(2)} accrued fees`
      : `Accrued fees: $${p.accruedFeesUsd.toFixed(2)} (target $${FEE_PROFIT_TARGET_USD})`)
    : 'Accrued fees: n/a';

  if (p.status === 'below' || p.status === 'above') {
    const brokeToward = p.status === 'below' ? p.tokenXSymbol : p.tokenYSymbol;
    return `🔴 OUT OF RANGE: ${pairName}\n` +
      `Position: ${p.lowerPriceDisplay ?? '?'} - ${p.upperPriceDisplay ?? '?'}\n` +
      `Now holding 100% ${brokeToward}\n` +
      `${feeLine}\n` +
      meteoraUrl;
  }

  const pctFromEdge = Math.min(p.pctFromLower, p.pctFromUpper) * 100;
  if (pctFromEdge < EDGE_WARNING_THRESHOLD * 100) {
    const edgeSide = p.pctFromLower < p.pctFromUpper ? 'lower' : 'upper';
    return `⚠️ APPROACHING EDGE: ${pairName}\n` +
      `Position: ${p.lowerPriceDisplay ?? '?'} - ${p.upperPriceDisplay ?? '?'} | Current: ${p.currentPriceDisplay ?? '?'}\n` +
      `${pctFromEdge.toFixed(1)}% from ${edgeSide} edge\n` +
      `${feeLine}\n` +
      meteoraUrl;
  }

  return `🟢 IN RANGE: ${pairName}\n` +
    `Position: ${p.lowerPriceDisplay ?? '?'} - ${p.upperPriceDisplay ?? '?'} | Current: ${p.currentPriceDisplay ?? '?'}\n` +
    `${feeLine}\n` +
    meteoraUrl;
}

export async function scan() {
  const positions = await scanPositions();
  console.log(`Found ${positions.length} open position(s) for ${WALLET_ADDRESS}`);

  const webhook = process.env.SLACK_WEBHOOK_EDGE_ALERTS || process.env.SLACK_WEBHOOK_URL;
  if (!webhook) {
    console.log('No SLACK_WEBHOOK_EDGE_ALERTS or SLACK_WEBHOOK_URL set - printing to console only.');
  }

  for (const p of positions) {
    const text = formatMessage(p);
    console.log('---\n' + text);
    if (webhook) await sendSlack({ text }, webhook);
  }

  return positions;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  scan()
    .then((positions) => console.log(`\nDone - ${positions.length} position(s) checked.`))
    .catch((error) => {
      console.error('Position monitor failed:', error.message);
      process.exit(1);
    });
}
