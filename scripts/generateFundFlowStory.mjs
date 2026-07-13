#!/usr/bin/env node
/**
 * generateFundFlowStory.mjs
 *
 * Daily on-chain signal story: finds the Solana DeFi protocol with the biggest
 * 24h TVL swing (DefiLlama) and turns it into a premium story, merged into
 * the existing validator_stories.json alongside the manually-triggered CT stories.
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

const SOURCE_TAG = 'onchain-fundflow';
const MIN_TVL_USD = 5_000_000;

const STORY_PROMPT = fs.readFileSync(PROMPT_PATH, 'utf-8');

// ============================================================================
// SIGNAL SOURCING
// ============================================================================

async function findBiggestTvlMover() {
  const res = await fetch('https://api.llama.fi/protocols');
  if (!res.ok) throw new Error(`DefiLlama fetch failed: ${res.status}`);
  const protocols = await res.json();

  const candidates = protocols.filter((p) =>
    Array.isArray(p.chains) &&
    p.chains.includes('Solana') &&
    typeof p.change_1d === 'number' &&
    (p.tvl || 0) >= MIN_TVL_USD
  );

  if (candidates.length === 0) throw new Error('No qualifying Solana protocols found');

  candidates.sort((a, b) => Math.abs(b.change_1d) - Math.abs(a.change_1d));
  return candidates[0];
}

function formatUsd(n) {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  return `$${Math.round(n).toLocaleString()}`;
}

function buildFacts(protocol) {
  const direction = protocol.change_1d >= 0 ? 'rose' : 'fell';
  const narrative = `${protocol.name} TVL ${direction} ${Math.abs(protocol.change_1d).toFixed(1)}% in the last 24h to ${formatUsd(protocol.tvl)}.`;

  const lines = [
    `Protocol: ${protocol.name}`,
    `Category: ${protocol.category || 'DeFi'}`,
    `Chains: ${(protocol.chains || []).join(', ')}`,
    `Current TVL: ${formatUsd(protocol.tvl)}`,
    `24h change: ${protocol.change_1d >= 0 ? '+' : ''}${protocol.change_1d.toFixed(2)}%`,
    typeof protocol.change_7d === 'number'
      ? `7d change: ${protocol.change_7d >= 0 ? '+' : ''}${protocol.change_7d.toFixed(2)}%`
      : null,
  ].filter(Boolean);

  return { narrative, context: lines.join('\n') };
}

// ============================================================================
// AI GENERATION (mirrors generateCtStories.mjs conventions)
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

function computeNarrativeStrength(protocol) {
  // Log-scaled TVL size (40%) + magnitude of 24h move (60%), same 1.0-9.5 range as CT stories.
  const tvlScore = Math.min(Math.log10(Math.max(protocol.tvl, 1)) / Math.log10(5_000_000_000), 1);
  const moveScore = Math.min(Math.abs(protocol.change_1d) / 50, 1);
  const raw = tvlScore * 0.4 + moveScore * 0.6;
  return Math.round((1 + raw * 8.5) * 10) / 10;
}

function computeRiskLevel(protocol) {
  const magnitude = Math.abs(protocol.change_1d);
  if (magnitude >= 40) return 'critical';
  if (magnitude >= 20) return 'high';
  if (magnitude >= 8) return 'medium';
  return 'low';
}

async function generateStory() {
  const protocol = await findBiggestTvlMover();
  console.log(`📊 Biggest Solana TVL mover: ${protocol.name} (${protocol.change_1d.toFixed(2)}% / 24h)`);

  const { narrative, context } = buildFacts(protocol);
  const category = 'DeFi / Fund Flows';

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
    type: computeRiskLevel(protocol) === 'critical' || computeRiskLevel(protocol) === 'high' ? 'critical' : 'alpha',
    category,
    author: 'On-Chain Signal',
    timestamp: new Date().toISOString(),
    metrics: {
      protocol: protocol.name,
      tvlUsd: protocol.tvl,
      change1d: protocol.change_1d,
      change7d: protocol.change_7d ?? null,
    },
    ctPulse: [],
    whoToFollow: [],
    content: {
      signal: storyData.signal || narrative,
      story: storyData.story,
      takeaways: Array.isArray(storyData.takeaways) ? storyData.takeaways : [],
    },
    riskLevel: storyData.riskLevel || computeRiskLevel(protocol),
    narrativeStrength: computeNarrativeStrength(protocol),
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
    global_metrics: existing.global_metrics || {},
    items,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));

  const mirrorDir = OUTPUT_PATH_MIRROR.replace(/\/[^/]+$/, '');
  if (!fs.existsSync(mirrorDir)) fs.mkdirSync(mirrorDir, { recursive: true });
  fs.writeFileSync(OUTPUT_PATH_MIRROR, JSON.stringify(output, null, 2));

  console.log(`✅ Saved on-chain fund-flow story to ${OUTPUT_PATH} (${items.length} total stories)`);
}

main().catch((error) => {
  console.error('❌ Fatal error:', error.message);
  process.exit(1);
});
