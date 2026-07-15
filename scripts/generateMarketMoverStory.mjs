#!/usr/bin/env node
/**
 * generateMarketMoverStory.mjs
 *
 * Daily on-chain signal story: finds the Solana ecosystem token with the biggest
 * 24h price swing (CoinGecko) and turns it into a premium story, merged into
 * the existing validator_stories.json alongside the fund-flow story.
 * Output: public/data/validator_stories.json (mirrored to data/)
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
try {
  const dotenv = require('dotenv');
  dotenv.config({ path: '.env.local' });
  dotenv.config();
} catch { }

import fs from 'fs';

const OUTPUT_PATH = './public/data/validator_stories.json';
const OUTPUT_PATH_MIRROR = './data/validator_stories.json';
const PROMPT_PATH = './prompts/onchain_story_prompt.md';

const SOURCE_TAG = 'onchain-marketmover';
const MIN_MARKET_CAP_USD = 10_000_000;
const MIN_VOLUME_USD = 1_000_000;

const STORY_PROMPT = fs.readFileSync(PROMPT_PATH, 'utf-8');

// ============================================================================
// SIGNAL SOURCING
// ============================================================================

async function findBiggestMover() {
  const url = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&category=solana-ecosystem&order=market_cap_desc&per_page=250&page=1&price_change_percentage=24h,7d';
  const res = await fetch(url);
  if (!res.ok) throw new Error(`CoinGecko fetch failed: ${res.status}`);
  const coins = await res.json();

  const candidates = coins.filter((c) =>
    typeof c.price_change_percentage_24h === 'number' &&
    (c.market_cap || 0) >= MIN_MARKET_CAP_USD &&
    (c.total_volume || 0) >= MIN_VOLUME_USD
  );

  if (candidates.length === 0) throw new Error('No qualifying Solana ecosystem tokens found');

  candidates.sort((a, b) => Math.abs(b.price_change_percentage_24h) - Math.abs(a.price_change_percentage_24h));
  return candidates[0];
}

function formatUsd(n) {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(4)}`;
}

function buildFacts(coin) {
  const direction = coin.price_change_percentage_24h >= 0 ? 'rose' : 'fell';
  const narrative = `${coin.name} (${coin.symbol.toUpperCase()}) ${direction} ${Math.abs(coin.price_change_percentage_24h).toFixed(1)}% in the last 24h to ${formatUsd(coin.current_price)}.`;

  const lines = [
    `Token: ${coin.name} (${coin.symbol.toUpperCase()})`,
    `Current price: ${formatUsd(coin.current_price)}`,
    `Market cap: ${formatUsd(coin.market_cap)} (rank #${coin.market_cap_rank ?? 'n/a'})`,
    `24h trading volume: ${formatUsd(coin.total_volume)}`,
    `24h change: ${coin.price_change_percentage_24h >= 0 ? '+' : ''}${coin.price_change_percentage_24h.toFixed(2)}%`,
    typeof coin.price_change_percentage_7d_in_currency === 'number'
      ? `7d change: ${coin.price_change_percentage_7d_in_currency >= 0 ? '+' : ''}${coin.price_change_percentage_7d_in_currency.toFixed(2)}%`
      : null,
  ].filter(Boolean);

  return { narrative, context: lines.join('\n') };
}

// ============================================================================
// AI GENERATION (mirrors generateFundFlowStory.mjs conventions)
// ============================================================================

async function callOpenAI(prompt, isRetry = false) {
  if (!process.env.OPENAI_API_KEY) throw new Error('No OPENAI_API_KEY');

  let systemPrompt = 'You are an elite crypto intelligence analyst. Return valid JSON only.';
  if (isRetry) {
    systemPrompt = "Your last answer broke our strict negative constraints by including banned vocabulary, explicit financial advice, generic market filler, or 'no action required'. Rewrite it, use only provided facts, remove ALL instruction verbs, remove ALL fluff, and return valid JSON only.\n\n" + systemPrompt;
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4.1',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI error: ${response.status} ${err}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

function qualityGateFails(text) {
  const lower = text.toLowerCase();
  const bannedPhrases = ['amid uncertainty', 'prevailing fear sentiment', 'market participants', 'macro headwinds'];
  if (bannedPhrases.some((phrase) => lower.includes(phrase))) return true;

  const instructionVerbs = ['buy ', 'sell ', 'stake ', 'avoid ', 'short ', 'long ', 'ape ', 'rotate '];
  if (instructionVerbs.some((verb) => lower.includes(` ${verb}`))) return true;

  if (lower.includes('no action required')) return true;

  return false;
}

function cleanJsonString(str) {
  let cleaned = str.trim();
  if (cleaned.startsWith('```json')) cleaned = cleaned.replace(/^```json/, '').replace(/```$/, '');
  else if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```/, '').replace(/```$/, '');
  return cleaned.trim();
}

function parseStoryJSON(response) {
  const text = cleanJsonString(response);
  const data = JSON.parse(text);
  if (!data.story) throw new Error("Missing 'story' field in AI response.");
  return data;
}

function computeNarrativeStrength(coin) {
  // Log-scaled market cap (30%) + magnitude of 24h move (70%), same 1.0-9.5 range as other stories.
  const mcapScore = Math.min(Math.log10(Math.max(coin.market_cap, 1)) / Math.log10(2_000_000_000), 1);
  const moveScore = Math.min(Math.abs(coin.price_change_percentage_24h) / 60, 1);
  const raw = mcapScore * 0.3 + moveScore * 0.7;
  return Math.round((1 + raw * 8.5) * 10) / 10;
}

function computeRiskLevel(coin) {
  const magnitude = Math.abs(coin.price_change_percentage_24h);
  if (magnitude >= 40) return 'critical';
  if (magnitude >= 20) return 'high';
  if (magnitude >= 8) return 'medium';
  return 'low';
}

async function generateStory() {
  const coin = await findBiggestMover();
  console.log(`📊 Biggest Solana ecosystem mover: ${coin.name} (${coin.price_change_percentage_24h.toFixed(2)}% / 24h)`);

  const { narrative, context } = buildFacts(coin);
  const category = 'Market Movers';

  const prompt = STORY_PROMPT
    .replace('{context}', context)
    .replace('{category}', category)
    .replace('{narrative}', narrative);

  let response = await callOpenAI(prompt);
  if (qualityGateFails(response)) {
    console.log('⚠️  Quality gate failed. Retrying once...');
    response = await callOpenAI(prompt, true);
  }

  const storyData = parseStoryJSON(response);

  return {
    id: `story_${SOURCE_TAG}_${Date.now()}`,
    source: SOURCE_TAG,
    title: storyData.title || narrative,
    type: computeRiskLevel(coin) === 'critical' || computeRiskLevel(coin) === 'high' ? 'critical' : 'alpha',
    category,
    author: 'On-Chain Signal',
    timestamp: new Date().toISOString(),
    sourceUrl: `https://www.coingecko.com/en/coins/${coin.id}`,
    metrics: {
      token: coin.name,
      symbol: coin.symbol.toUpperCase(),
      priceUsd: coin.current_price,
      marketCapUsd: coin.market_cap,
      change24h: coin.price_change_percentage_24h,
      change7d: coin.price_change_percentage_7d_in_currency ?? null,
    },
    ctPulse: [],
    whoToFollow: [],
    content: {
      signal: storyData.signal || narrative,
      story: storyData.story,
      takeaways: Array.isArray(storyData.takeaways) ? storyData.takeaways : [],
    },
    riskLevel: storyData.riskLevel || computeRiskLevel(coin),
    narrativeStrength: computeNarrativeStrength(coin),
  };
}

// ============================================================================
// MERGE + WRITE
// ============================================================================

function loadExisting() {
  if (!fs.existsSync(OUTPUT_PATH)) {
    return { generated_at: new Date().toISOString(), global_metrics: {}, items: [] };
  }
  return JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf-8'));
}

async function main() {
  const newStory = await generateStory();

  const existing = loadExisting();
  const otherItems = (existing.items || []).filter((item) => item.source !== SOURCE_TAG);
  const items = [newStory, ...otherItems];

  const output = {
    generated_at: new Date().toISOString(),
    global_metrics: {},
    items,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));

  const mirrorDir = OUTPUT_PATH_MIRROR.replace(/\/[^/]+$/, '');
  if (!fs.existsSync(mirrorDir)) fs.mkdirSync(mirrorDir, { recursive: true });
  fs.writeFileSync(OUTPUT_PATH_MIRROR, JSON.stringify(output, null, 2));

  console.log(`✅ Saved market mover story to ${OUTPUT_PATH} (${items.length} total stories)`);
}

main().catch((error) => {
  console.error('❌ Fatal error:', error.message);
  process.exit(1);
});
