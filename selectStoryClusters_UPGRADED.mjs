#!/usr/bin/env node
/**
 * selectStoryClusters.mjs - UPGRADED VERSION
 * 
 * Improvements over original:
 * 1. Engagement-weighted scoring (not just cluster size)
 * 2. Quality filtering BEFORE clustering
 * 3. Smarter duplicate detection
 * 4. Category-aware selection
 * 5. Narrative extraction (not just keywords)
 */

import fs from 'fs';

const TWEET_CLUSTERS_PATH = 'data/tweet_clusters.json';
const TWEETS_72H_PATH = 'data/tweets_72h.json';
const MEMORY_24H_PATH = 'data/stories_shown_last_24h.json';
const MEMORY_48H_PATH = 'data/stories_shown_last_48h.json';
const OUTPUT_PATH = 'data/story_candidates.json';

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  MIN_CLUSTER_SIZE: 2,        // At least 2 voices (not just one person)
  MIN_ENGAGEMENT_SCORE: 100,  // Minimum total engagement
  MAX_CANDIDATES: 5,          // Top 5 candidates (not just 3)
  MIN_TWEET_QUALITY: 50,      // Minimum individual tweet engagement
  
  // Category priorities (higher = more likely to be selected)
  CATEGORY_WEIGHTS: {
    'AI / Agents': 1.5,
    'New Product Launch': 1.4,
    'Gaming / NFT': 1.3,
    'DeFi Innovation': 1.3,
    'Infrastructure': 1.2,
    'Mobile / Seeker': 1.4,
    'Ecosystem Updates': 0.8,  // Lower priority (too generic)
    'Token Launch / Pump': 0.6, // Lower priority (usually noise)
  }
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function calculateEngagementScore(tweet) {
  const likes = Number(tweet.favorite_count || tweet.like_count || 0);
  const retweets = Number(tweet.retweet_count || 0);
  const quotes = Number(tweet.quote_count || 0);
  const replies = Number(tweet.reply_count || 0);
  const preScored = Number(tweet.score || 0);
  
  // Weighted scoring (retweets/quotes show stronger signal)
  const weighted = (
    likes * 1.0 +
    retweets * 2.0 +
    quotes * 3.0 +
    replies * 1.5
  );
  return Math.max(weighted, preScored);
}

function isHighQualityTweet(tweet) {
  const text = tweet.full_text || tweet.text || '';
  const engagement = calculateEngagementScore(tweet);
  
  // Minimum engagement threshold
  if (engagement < CONFIG.MIN_TWEET_QUALITY) return false;
  
  // Minimum length (avoid one-liners)
  if (text.length < 80) return false;
  
  // Filter out obvious spam
  const spamPatterns = ['gm', 'gn', 'lfg', 'wagmi'];
  const textLower = text.toLowerCase();
  const spamCount = spamPatterns.filter(p => textLower.includes(p)).length;
  if (spamCount > 2) return false;
  
  // Require substance (links, mentions, numbers, or technical terms)
  const hasSubstance = (
    text.includes('http') ||
    text.includes('@') ||
    /\d/.test(text) ||
    text.split(' ').some(word => word.length > 12)
  );
  
  return hasSubstance;
}

function extractNarrative(cluster) {
  /**
   * Extract the actual narrative/story, not just category
   * 
   * Examples:
   * - "PayPal integrates Solana" (not just "Infrastructure")
   * - "Backpack's anti-dump tokenomics" (not just "DeFi")
   * - "$100k AI agent hackathon" (not just "AI / Agents")
   */
  
  const tweets = cluster.tweets || [];
  const topTweet = tweets[0]; // Highest engagement
  
  if (!topTweet) return null;
  
  const text = topTweet.full_text || topTweet.text || '';
  
  // Look for key entities/products
  const entities = extractEntities(text);
  
  // Look for action verbs
  const actions = extractActions(text);
  
  // Combine into narrative
  if (entities.length > 0 && actions.length > 0) {
    return `${entities[0]} ${actions[0]}`;
  }
  
  // Fallback: Use first meaningful phrase
  const sentences = text.split(/[.!?]/).filter(s => s.length > 20);
  if (sentences.length > 0) {
    return sentences[0].trim().substring(0, 100);
  }
  
  return cluster.label || 'Untitled';
}

function extractEntities(text) {
  /**
   * Extract named entities (products, protocols, people)
   */
  const entities = [];
  
  // Look for @mentions (but clean them up)
  const mentions = text.match(/@\w+/g) || [];
  entities.push(...mentions.map(m => m.substring(1)));
  
  // Look for capitalized terms (product names)
  const caps = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || [];
  entities.push(...caps);
  
  // Look for known protocols/products
  const knownProducts = [
    'PayPal', 'Backpack', 'Jupiter', 'Kamino', 'Helius', 
    'Seeker', 'Saga', 'Drift', 'Solana', 'Polymarket'
  ];
  
  for (const product of knownProducts) {
    if (text.includes(product)) {
      entities.push(product);
    }
  }
  
  return [...new Set(entities)]; // Dedupe
}

function extractActions(text) {
  /**
   * Extract action verbs that signal news
   */
  const actionPatterns = [
    'launch', 'release', 'announce', 'introduce', 'unveil',
    'integrate', 'partner', 'join', 'acquire', 'raise',
    'reveal', 'disrupt', 'challenge', 'enable', 'unlock'
  ];
  
  const textLower = text.toLowerCase();
  const found = actionPatterns.filter(action => textLower.includes(action));
  
  return found;
}

function categorizeCluster(cluster) {
  /**
   * Assign category based on content, not just keywords
   */
  const keywords = (cluster.keywords || []).map(k => k.toLowerCase());
  const tweets = cluster.tweets || [];
  const allText = tweets.map(t => t.full_text || t.text || '').join(' ').toLowerCase();
  
  // AI / Agents
  if (keywords.some(k => ['agent', 'ai', 'autonomous', 'bot'].includes(k)) ||
      allText.includes('agent') || allText.includes('autonomous')) {
    return 'AI / Agents';
  }
  
  // Product Launch
  if (keywords.some(k => ['launch', 'release', 'announce'].includes(k)) ||
      allText.includes('launching') || allText.includes('released')) {
    return 'New Product Launch';
  }
  
  // Gaming
  if (keywords.some(k => ['game', 'gaming', 'nft', 'play'].includes(k))) {
    return 'Gaming / NFT';
  }
  
  // DeFi
  if (keywords.some(k => ['defi', 'yield', 'lp', 'liquidity', 'swap'].includes(k))) {
    return 'DeFi Innovation';
  }
  
  // Mobile / Seeker
  if (keywords.some(k => ['seeker', 'mobile', 'saga', 'phone'].includes(k))) {
    return 'Mobile / Seeker';
  }
  
  // Infrastructure
  if (keywords.some(k => ['protocol', 'network', 'infrastructure'].includes(k))) {
    return 'Infrastructure';
  }
  
  // Token launches (low priority)
  if (keywords.some(k => ['airdrop', 'token', 'tge'].includes(k))) {
    return 'Token Launch / Pump';
  }
  
  // Default
  return 'Ecosystem Updates';
}

function isSeenRecently(narrative, memory24h, memory48h) {
  /**
   * Smarter duplicate detection
   * 
   * Instead of blocking all similar topics, check for:
   * 1. Exact same narrative
   * 2. Very similar titles (>80% overlap)
   */
  
  const allMemory = [...memory24h, ...memory48h];
  
  for (const seen of allMemory) {
    const seenTitle = seen.title || seen.narrative || '';
    
    // Exact match
    if (seenTitle.toLowerCase() === narrative.toLowerCase()) {
      return true;
    }
    
    // Very high similarity
    const similarity = calculateSimilarity(narrative, seenTitle);
    if (similarity > 0.8) {
      return true;
    }
  }
  
  return false;
}

function calculateSimilarity(str1, str2) {
  /**
   * Calculate Jaccard similarity between two strings
   */
  const words1 = new Set(str1.toLowerCase().split(/\s+/));
  const words2 = new Set(str2.toLowerCase().split(/\s+/));
  
  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);
  
  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

// ============================================================================
// MAIN LOGIC
// ============================================================================

function selectStoryCandidates() {
  console.log('[Selector] Loading data...');
  
  // Load clusters
  const rawClusters = JSON.parse(fs.readFileSync(TWEET_CLUSTERS_PATH, 'utf-8'));
  const clusters = Array.isArray(rawClusters)
    ? rawClusters
    : Array.isArray(rawClusters?.clusters)
      ? rawClusters.clusters
      : [];
  const normalizedClusters = clusters.map((cluster, idx) => {
    const baseTweets = Array.isArray(cluster?.tweets)
      ? cluster.tweets
      : Array.isArray(cluster?.sampleTweets)
        ? cluster.sampleTweets
        : [];
    const normalizedTweets = baseTweets.map((tweet) => ({
      ...tweet,
      id: tweet.id || tweet.tweet_id || `tweet_${idx}`,
      screen_name: tweet.screen_name || tweet.handle || 'unknown',
      full_text: tweet.full_text || tweet.text || '',
      url: tweet.url || tweet.link || null,
      favorite_count: Number(tweet.favorite_count || tweet.like_count || 0),
      retweet_count: Number(tweet.retweet_count || 0),
      quote_count: Number(tweet.quote_count || 0),
      reply_count: Number(tweet.reply_count || 0),
      score: Number(tweet.score || 0),
    }));
    return {
      ...cluster,
      label: cluster.label || cluster.category || `Cluster ${idx + 1}`,
      keywords: Array.isArray(cluster.keywords) ? cluster.keywords : (cluster.topKeywords || []),
      tweets: normalizedTweets,
    };
  });
  console.log(`[Selector] Loaded ${normalizedClusters.length} clusters.`);
  
  // Load original tweets for additional filtering
  const rawTweets72h = fs.existsSync(TWEETS_72H_PATH)
    ? JSON.parse(fs.readFileSync(TWEETS_72H_PATH, 'utf-8'))
    : [];
  const tweets72h = Array.isArray(rawTweets72h)
    ? rawTweets72h
    : Array.isArray(rawTweets72h?.tweets)
      ? rawTweets72h.tweets
      : [];
  console.log(`[Selector] Loaded ${tweets72h.length} tweets (72h).`);
  
  // Load memory (what we've shown recently)
  const memory24h = fs.existsSync(MEMORY_24H_PATH) 
    ? JSON.parse(fs.readFileSync(MEMORY_24H_PATH, 'utf-8')) 
    : [];
  const memory48h = fs.existsSync(MEMORY_48H_PATH)
    ? JSON.parse(fs.readFileSync(MEMORY_48H_PATH, 'utf-8'))
    : [];
  
  console.log(`[Selector] Memory: ${memory24h.length} stories (24h), ${memory48h.length} stories (48h)`);
  
  // ========================================================================
  // STEP 1: Filter clusters for quality
  // ========================================================================
  
  const qualityClusters = normalizedClusters.filter(cluster => {
    // Must have minimum tweets
    if (!cluster.tweets || cluster.tweets.length < CONFIG.MIN_CLUSTER_SIZE) {
      return false;
    }
    
    // Filter cluster tweets for quality
    const qualityTweets = cluster.tweets.filter(isHighQualityTweet);
    if (qualityTweets.length < CONFIG.MIN_CLUSTER_SIZE) {
      return false;
    }
    
    // Update cluster with quality tweets only
    cluster.tweets = qualityTweets;
    
    // Calculate total engagement
    const totalEngagement = qualityTweets.reduce((sum, tweet) => {
      return sum + calculateEngagementScore(tweet);
    }, 0);
    
    if (totalEngagement < CONFIG.MIN_ENGAGEMENT_SCORE) {
      return false;
    }
    
    cluster.totalEngagement = totalEngagement;
    
    return true;
  });
  
  console.log(`[Selector] ${qualityClusters.length} quality clusters after filtering.`);
  
  // ========================================================================
  // STEP 2: Categorize and extract narratives
  // ========================================================================
  
  const enrichedClusters = qualityClusters.map(cluster => {
    const category = categorizeCluster(cluster);
    const narrative = extractNarrative(cluster);
    const uniqueUsers = new Set(cluster.tweets.map(t => t.screen_name)).size;
    
    // Calculate weighted score
    const categoryWeight = CONFIG.CATEGORY_WEIGHTS[category] || 1.0;
    const score = cluster.totalEngagement * categoryWeight;
    
    return {
      ...cluster,
      category,
      narrative,
      uniqueUsers,
      weightedScore: score
    };
  });
  
  // ========================================================================
  // STEP 3: Sort by weighted score
  // ========================================================================
  
  enrichedClusters.sort((a, b) => b.weightedScore - a.weightedScore);
  
  // ========================================================================
  // STEP 4: Select diverse candidates
  // ========================================================================
  
  const selected = [];
  const categoriesSeen = new Set();
  
  for (const cluster of enrichedClusters) {
    // Skip if we've seen this narrative recently
    if (isSeenRecently(cluster.narrative, memory24h, memory48h)) {
      console.log(`  - Skipped (seen recently): ${cluster.narrative}`);
      continue;
    }
    
    // Try to get diversity in categories
    if (categoriesSeen.has(cluster.category) && selected.length >= 3) {
      continue; // Skip if we already have this category and we have 3+ stories
    }
    
    selected.push(cluster);
    categoriesSeen.add(cluster.category);
    
    if (selected.length >= CONFIG.MAX_CANDIDATES) {
      break;
    }
  }
  
  console.log(`[Selector] Selected ${selected.length} candidates.`);
  
  // ========================================================================
  // STEP 5: Display and save
  // ========================================================================
  
  selected.forEach((cluster, i) => {
    const score = Math.round((cluster.weightedScore / enrichedClusters[0].weightedScore) * 100);
    console.log(`- [${cluster.category}] Score: ${score}% | "${cluster.narrative}"`);
    console.log(`  Engagement: ${cluster.totalEngagement}, Tweets: ${cluster.tweets.length}, Users: ${cluster.uniqueUsers}`);
  });
  
  // Save to file
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(selected, null, 2));
  console.log(`\nOutput saved to: ${OUTPUT_PATH}`);
  
  return selected;
}

// ============================================================================
// RUN
// ============================================================================

try {
  selectStoryCandidates();
} catch (error) {
  console.error('[Selector] Error:', error.message);
  process.exit(1);
}
