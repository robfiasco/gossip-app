#!/usr/bin/env node
/**
 * selectStoryClusters.mjs - SATURDAY UPGRADE
 * 
 * New features:
 * 1. Urgency detection (time-sensitive opportunities)
 * 2. New story categories (Alpha, Security, etc.)
 * 3. Signal pattern detection (alpha, investigative, security, builder)
 * 4. Better narrative extraction
 * 5. Engagement weighting (quotes/RTs valued higher)
 */

import fs from 'fs';

// ============================================================================
// FILE PATHS - ADJUST TO YOUR SETUP
// ============================================================================

const SIGNALS_RAW_PATH = './signals_raw.json';  // Your tweet data
const OUTPUT_PATH = './public/data/story_candidates.json';
const MEMORY_24H_PATH = './data/stories_shown_last_24h.json';
const MEMORY_48H_PATH = './data/stories_shown_last_48h.json';

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  MIN_CLUSTER_SIZE: 2,
  MIN_ENGAGEMENT_SCORE: 200,
  MAX_CANDIDATES: 5,
  MIN_TWEET_QUALITY: 50,

  // NEW: Category priorities (Saturday upgrade)
  CATEGORY_WEIGHTS: {
    'Alpha / Early Access': 2.0,           // HIGHEST - time-sensitive opportunities
    'Security / Risk Alert': 1.9,          // Breaches, hacks, warnings
    'Product Launch / Live': 1.8,          // Just launched
    'DeFi Strategy / Alpha': 1.8,          // Non-obvious strategies
    'Prediction Markets': 1.75,            // NEW: Trending high
    'Infrastructure / Tools': 1.7,         // Builder announcements
    'Investigative / Due Diligence': 1.7,  // Deep dives, mechanics
    'Privacy / ZK Tech': 1.6,              // NEW: Emerging topic
    'Airdrop Strategy': 1.5,               // NEW: Actionable farming
    'AI / Agents': 1.5,
    'Mobile / Seeker': 1.4,
    'New Product Launch': 1.4,             // Announcements (not live yet)
    'Gaming / NFT': 1.3,
    'DeFi Innovation': 1.3,
    'Infrastructure': 1.2,
    'Ecosystem Updates': 0.8,              // Generic (low priority)
    'Token Launch / Pump': 0.6,            // Just hype (lowest)
  },

  // NEW: Urgency boost
  URGENCY_BOOST: 1.5,  // Multiply score by this for urgent stories
};

// ============================================================================
// URGENCY DETECTION (NEW)
// ============================================================================

const URGENCY_SIGNALS = [
  'too late', 'closing soon', 'limited', 'early access',
  'manual verification', 'one post', 'barrier is literally',
  'first come', 'limited spots', 'apply now', 'deadline',
  'ends today', 'last chance', 'closing', 'whitelist'
];

function calculateUrgencyScore(tweet) {
  const text = (tweet.full_text || '').toLowerCase();
  let score = 0;

  // Check for urgency signals
  URGENCY_SIGNALS.forEach(signal => {
    if (text.includes(signal)) score += 1;
  });

  // Time decay (newer = more urgent)
  const tweetTime = new Date(tweet.created_at).getTime();
  const now = Date.now();
  const hoursOld = (now - tweetTime) / (1000 * 60 * 60);

  if (hoursOld < 6) score += 3;       // Very fresh
  else if (hoursOld < 24) score += 2; // Fresh
  else if (hoursOld < 48) score += 1; // Moderately fresh

  return score;
}

// ============================================================================
// SIGNAL DETECTION (NEW)
// ============================================================================

const ALPHA_SIGNALS = [
  'most people won\'t think of',
  'most people don\'t know',
  'far less risk than',
  'safer than buying',
  'best way to capture',
  'the play is',
  'instead of buying'
];

const INVESTIGATIVE_SIGNALS = [
  'I looked into how it works',
  'mechanics breakdown',
  'here\'s how it actually works',
  'I dug into',
  'after researching',
  'mechanics explained'
];

const SECURITY_SIGNALS = [
  '🚨 breaking', 'breaking:',
  'data breach', 'hack', 'hacked', 'hacker',
  'exploit', 'vulnerability',
  'stolen data', 'leaked',
  'phishing', 'scam alert'
];

const BUILDER_SIGNALS = [
  'I built', 'we built', 'I created',
  'we shipped', 'just deployed',
  'I launched', 'we launched'
];

const LAUNCH_SIGNALS = [
  'just launched', 'now live',
  'is now available', 'went live',
  'officially launched',
  'invite code:'
];

const PRIVACY_SIGNALS = [
  'privacy', 'zero knowledge', 'zk', 'snark', 'proof', 'confidential'
];

const PREDICTION_SIGNALS = [
  'prediction', 'polymarket', 'betting', 'outcome', 'forecast'
];

const AIRDROP_SIGNALS = [
  'airdrop', 'snapshot', 'farming', 'points', 'eligibility', 'claim'
];

function detectSignalType(text) {
  const lower = text.toLowerCase();

  if (SECURITY_SIGNALS.some(s => lower.includes(s))) return 'security';
  if (ALPHA_SIGNALS.some(s => lower.includes(s))) return 'alpha';
  if (INVESTIGATIVE_SIGNALS.some(s => lower.includes(s))) return 'investigative';
  if (BUILDER_SIGNALS.some(s => lower.includes(s))) return 'builder';
  if (LAUNCH_SIGNALS.some(s => lower.includes(s))) return 'launch';
  if (PRIVACY_SIGNALS.some(s => lower.includes(s))) return 'privacy';
  if (PREDICTION_SIGNALS.some(s => lower.includes(s))) return 'prediction';

  return null;
}

// ============================================================================
// ENGAGEMENT SCORING
// ============================================================================

function calculateEngagementScore(tweet) {
  const likes = tweet.favorite_count || 0;
  const retweets = tweet.retweet_count || 0;
  const quotes = tweet.quote_count || 0;
  const replies = tweet.reply_count || 0;

  // NEW: Weighted scoring (quotes/RTs signal stronger engagement)
  return (
    likes * 1.0 +
    retweets * 2.0 +
    quotes * 3.0 +
    replies * 1.5
  );
}

// ============================================================================
// QUALITY FILTERING
// ============================================================================

function isHighQualityTweet(tweet) {
  const text = tweet.full_text || '';
  const engagement = calculateEngagementScore(tweet);

  // Minimum engagement
  if (engagement < CONFIG.MIN_TWEET_QUALITY) return false;

  // Minimum length
  if (text.length < 80) return false;

  // Filter spam
  const spamPatterns = ['gm', 'gn', 'lfg', 'wagmi'];
  const textLower = text.toLowerCase();
  const spamCount = spamPatterns.filter(p => textLower.includes(p)).length;
  if (spamCount > 2) return false;

  // Require substance
  const hasSubstance = (
    text.includes('http') ||
    text.includes('@') ||
    /\d/.test(text) ||
    text.split(' ').some(word => word.length > 12)
  );

  return hasSubstance;
}

// ============================================================================
// NARRATIVE EXTRACTION
// ============================================================================

function extractNarrative(tweets) {
  /**
   * Extract specific narrative (not generic category)
   * Examples:
   * - "PayPal integrates Solana as default blockchain"
   * - "Cash City launches with ponzi mechanics"
   * - "LP SOL-USD1 strategy outperforms buying memecoins"
   */

  const topTweet = tweets[0]; // Sorted by engagement
  if (!topTweet) return 'Untitled';

  const text = topTweet.full_text || '';

  // Extract entities (products, protocols)
  const entities = extractEntities(text);

  // Extract actions
  const actions = extractActions(text);

  // Combine: "Entity + Action"
  if (entities.length > 0 && actions.length > 0) {
    return `${entities[0]} ${actions[0]}`;
  }

  // Fallback: First meaningful sentence
  const sentences = text.split(/[.!?]/).filter(s => s.length > 20);
  if (sentences.length > 0) {
    return sentences[0].trim().substring(0, 100);
  }

  return 'Untitled';
}

function extractEntities(text) {
  const entities = [];

  // Known products/protocols
  const knownProducts = [
    'PayPal', 'Stripe', 'Square', 'Backpack', 'Jupiter', 'Kamino',
    'Helius', 'Seeker', 'Saga', 'Drift', 'Solana', 'Polymarket',
    'Orca', 'Raydium', 'Meteora', 'Phantom', 'Cash City', 'Figure'
  ];

  for (const product of knownProducts) {
    if (text.includes(product)) {
      entities.push(product);
    }
  }

  // @mentions (clean up)
  const mentions = text.match(/@(\w+)/g) || [];
  entities.push(...mentions.map(m => m.substring(1)));

  return [...new Set(entities)]; // Dedupe
}

function extractActions(text) {
  const actionPatterns = [
    'launch', 'release', 'announce', 'integrate', 'partner',
    'reveal', 'unveil', 'introduce', 'enable', 'unlock',
    'confirms breach', 'hacked', 'leaked', 'exploited',
    'raises funds', 'acquires', 'ships', 'deploys'
  ];

  const textLower = text.toLowerCase();
  const found = actionPatterns.filter(action => textLower.includes(action));

  return found.map(a => a.charAt(0).toUpperCase() + a.slice(1));
}

// ============================================================================
// CATEGORIZATION (UPGRADED)
// ============================================================================

function categorizeCluster(tweets, signalType) {
  const allText = tweets.map(t => t.full_text || '').join(' ').toLowerCase();

  // Security (highest priority if detected)
  if (signalType === 'security' ||
    SECURITY_SIGNALS.some(s => allText.includes(s))) {
    return 'Security / Risk Alert';
  }

  // Early Access / Alpha
  if (URGENCY_SIGNALS.some(s => allText.includes(s)) ||
    signalType === 'launch' ||
    allText.includes('early access') ||
    allText.includes('whitelist')) {
    return 'Alpha / Early Access';
  }

  // Privacy / ZK
  if (signalType === 'privacy' || allText.includes('privacy') || allText.includes('zk')) {
    return 'Privacy / ZK Tech';
  }

  // Prediction Markets
  if (signalType === 'prediction' || allText.includes('polymarket')) {
    return 'Prediction Markets';
  }

  // DeFi Strategy Alpha
  if (signalType === 'alpha' ||
    (allText.includes('lp') && allText.includes('safer')) ||
    allText.includes('most people won\'t')) {
    return 'DeFi Strategy / Alpha';
  }

  // Investigative
  if (signalType === 'investigative' ||
    allText.includes('mechanics breakdown') ||
    allText.includes('ponzi')) {
    return 'Investigative / Due Diligence';
  }

  // Airdrop Strategy
  if (allText.includes('airdrop') || allText.includes('farming points')) {
    return 'Airdrop Strategy';
  }

  // Builder / Infrastructure
  if (signalType === 'builder' ||
    allText.includes('I built') ||
    allText.includes('we shipped')) {
    return 'Infrastructure / Tools';
  }

  // Live Launch
  if (signalType === 'launch' ||
    allText.includes('just launched') ||
    allText.includes('now live')) {
    return 'Product Launch / Live';
  }

  // AI / Agents
  if (allText.includes('agent') || allText.includes('autonomous') || allText.includes('ai ')) {
    return 'AI / Agents';
  }

  // Mobile / Seeker
  if (allText.includes('seeker') || allText.includes('saga') || allText.includes('mobile')) {
    return 'Mobile / Seeker';
  }

  // Gaming
  if (allText.includes('game') || allText.includes('gaming') || allText.includes('nft')) {
    return 'Gaming / NFT';
  }

  // DeFi
  if (allText.includes('defi') || allText.includes('yield') || allText.includes('swap')) {
    return 'DeFi Innovation';
  }

  // Token launches (low priority)
  if (allText.includes('airdrop') || allText.includes('token') || allText.includes('tge')) {
    return 'Token Launch / Pump';
  }

  // Default
  return 'Ecosystem Updates';
}

// ============================================================================
// CLUSTERING LOGIC
// ============================================================================

function clusterTweets(tweets) {
  /**
   * Simple clustering: Group tweets that mention same entities
   */

  const clusters = [];
  const used = new Set();

  tweets.forEach((tweet, i) => {
    if (used.has(i)) return;

    const entities = extractEntities(tweet.full_text || '');
    if (entities.length === 0) return;

    // Find all tweets mentioning same entities
    const cluster = [tweet];
    used.add(i);

    tweets.forEach((other, j) => {
      if (i === j || used.has(j)) return;

      const otherEntities = extractEntities(other.full_text || '');
      const overlap = entities.filter(e => otherEntities.includes(e));

      if (overlap.length > 0) {
        cluster.push(other);
        used.add(j);
      }
    });

    if (cluster.length >= CONFIG.MIN_CLUSTER_SIZE) {
      clusters.push(cluster);
    }
  });

  return clusters;
}

// ============================================================================
// DUPLICATE DETECTION
// ============================================================================

function isSeenRecently(narrative, memory24h, memory48h) {
  const allMemory = [...memory24h, ...memory48h];

  for (const seen of allMemory) {
    const seenTitle = seen.title || seen.narrative || '';

    // Exact match
    if (seenTitle.toLowerCase() === narrative.toLowerCase()) {
      return true;
    }

    // High similarity
    const similarity = calculateSimilarity(narrative, seenTitle);
    if (similarity > 0.8) {
      return true;
    }
  }

  return false;
}

function calculateSimilarity(str1, str2) {
  const words1 = new Set(str1.toLowerCase().split(/\s+/));
  const words2 = new Set(str2.toLowerCase().split(/\s+/));

  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}

// ============================================================================
// MAIN LOGIC
// ============================================================================

function selectStoryCandidates() {
  console.log('🔍 [Story Selection] Starting...\n');

  // Load tweets
  const rawTweets = JSON.parse(fs.readFileSync(SIGNALS_RAW_PATH, 'utf-8'));
  console.log(`📊 Loaded ${rawTweets.length} tweets total\n`);

  // Filter to last 72 hours only
  const cutoff72h = Date.now() - (72 * 60 * 60 * 1000);
  const recentTweets = rawTweets.filter(t => {
    const ts = t.created_at ? new Date(t.created_at).getTime() : 0;
    return ts >= cutoff72h;
  });
  console.log(`🕐 ${recentTweets.length} tweets within last 72h\n`);

  // Load memory
  const memory24h = fs.existsSync(MEMORY_24H_PATH)
    ? JSON.parse(fs.readFileSync(MEMORY_24H_PATH, 'utf-8'))
    : [];
  const memory48h = fs.existsSync(MEMORY_48H_PATH)
    ? JSON.parse(fs.readFileSync(MEMORY_48H_PATH, 'utf-8'))
    : [];

  // STEP 1: Filter for quality (from already-filtered 72h set)
  const qualityTweets = recentTweets.filter(isHighQualityTweet);
  console.log(`✅ ${qualityTweets.length} quality tweets (filtered from ${rawTweets.length})\n`);

  // STEP 2: Sort by engagement
  qualityTweets.sort((a, b) => calculateEngagementScore(b) - calculateEngagementScore(a));

  // STEP 3: Cluster tweets
  const clusters = clusterTweets(qualityTweets);
  console.log(`📦 ${clusters.length} clusters formed\n`);

  // STEP 4: Analyze each cluster
  const candidates = clusters.map(tweets => {
    // Sort tweets in cluster by engagement
    tweets.sort((a, b) => calculateEngagementScore(b) - calculateEngagementScore(a));

    // Calculate metrics
    const totalEngagement = tweets.reduce((sum, t) => sum + calculateEngagementScore(t), 0);
    const uniqueUsers = new Set(tweets.map(t => t.screen_name)).size;
    const maxUrgency = Math.max(...tweets.map(calculateUrgencyScore));

    // Detect signal type
    const signalType = detectSignalType(tweets[0].full_text || '');

    // Categorize
    const category = categorizeCluster(tweets, signalType);

    // Extract narrative
    const narrative = extractNarrative(tweets);

    // Calculate weighted score
    const categoryWeight = CONFIG.CATEGORY_WEIGHTS[category] || 1.0;
    let score = totalEngagement * categoryWeight;

    // Urgency boost
    if (maxUrgency >= 3) {
      score *= CONFIG.URGENCY_BOOST;
    }

    return {
      tweets,
      narrative,
      category,
      signalType,
      totalEngagement,
      uniqueUsers,
      urgencyScore: maxUrgency,
      weightedScore: score
    };
  });

  // STEP 5: Filter minimum engagement
  const viable = candidates.filter(c => c.totalEngagement >= CONFIG.MIN_ENGAGEMENT_SCORE);

  // STEP 6: Sort by weighted score
  viable.sort((a, b) => b.weightedScore - a.weightedScore);

  // STEP 7: Select diverse top candidates
  const selected = [];
  const categoriesSeen = new Set();

  for (const candidate of viable) {
    // Skip if seen recently
    if (isSeenRecently(candidate.narrative, memory24h, memory48h)) {
      console.log(`⏭️  Skipped (seen recently): ${candidate.narrative}`);
      continue;
    }

    // STRICT Diversity: Never 2 of the same category
    if (categoriesSeen.has(candidate.category)) {
      continue;
    }

    selected.push(candidate);
    categoriesSeen.add(candidate.category);

    if (selected.length >= CONFIG.MAX_CANDIDATES) {
      break;
    }
  }

  // STEP 8: Display results
  console.log(`\n🎯 Selected ${selected.length} story candidates:\n`);

  selected.forEach((candidate, i) => {
    const urgentFlag = candidate.urgencyScore >= 3 ? '⚡ URGENT' : '';
    const signalFlag = candidate.signalType ? `[${candidate.signalType}]` : '';

    console.log(`${i + 1}. [${candidate.category}] ${urgentFlag} ${signalFlag}`);
    console.log(`   "${candidate.narrative}"`);
    console.log(`   📊 ${candidate.tweets.length} tweets • ${candidate.uniqueUsers} voices • ${candidate.totalEngagement.toLocaleString()} engagement`);
    console.log('');
  });

  // STEP 9: Save
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(selected, null, 2));
  console.log(`💾 Saved to: ${OUTPUT_PATH}\n`);

  return selected;
}

// ============================================================================
// RUN
// ============================================================================

try {
  selectStoryCandidates();
} catch (error) {
  console.error('❌ Error:', error.message);
  console.error(error.stack);
  process.exit(1);
}
