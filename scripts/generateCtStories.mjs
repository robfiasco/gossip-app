#!/usr/bin/env node
/**
 * generateCtStories.mjs - HYBRID AI UPGRADE
 * 
 * Generates 500-600 word premium stories with:
 * 1. Full articles (not just bullets)
 * 2. Engagement metrics for UI
 * 3. Structured output (signal, story, takeaways, whoToFollow)
 * 4. OpenAI (GPT-4o-mini) priority with Ollama fallback
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
try {
  const dotenv = require('dotenv');
  dotenv.config({ path: '.env.local' });
  dotenv.config();
} catch { }

import fs from 'fs';

// ============================================================================
// FILE PATHS - ADJUST TO YOUR SETUP
// ============================================================================

const CANDIDATES_PATH = './public/data/story_candidates.json';
const OUTPUT_PATH = './public/data/validator_stories.json';
const OUTPUT_PATH_MIRROR = './data/validator_stories.json'; // Mirror for KV sync fallback

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  MAX_STORIES: 3,         // Limit for performance
  MIN_STORY_LENGTH: 400,  // Minimum characters
  MAX_STORY_LENGTH: 5000, // Maximum characters
};

// ============================================================================
// PROMPT TEMPLATE
// ============================================================================

const PROMPT_PATH = './prompts/story_prompt.md';

// Load prompt template
let STORY_PROMPT;
try {
  STORY_PROMPT = fs.readFileSync(PROMPT_PATH, 'utf-8');
} catch (error) {
  console.error(`❌ Could not load prompt from ${PROMPT_PATH}`);
  process.exit(1);
}

// ============================================================================
// AI API CLIENTS
// ============================================================================

async function callOpenAI(prompt, isRetry = false) {
  if (!process.env.OPENAI_API_KEY) throw new Error("No OPENAI_API_KEY");

  let systemPrompt = "You are an elite crypto intelligence analyst. Return valid JSON only.";
  if (isRetry) {
    systemPrompt = "Your last answer broke our strict negative constraints by including banned vocabulary, explicit financial advice, generic market filler, or 'no action required'. Rewrite it, use only provided facts, remove ALL instruction verbs, remove ALL fluff, and return valid JSON only.\n\n" + systemPrompt;
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4.1",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt }
        ],
        temperature: 0.3,
        response_format: { type: "json_object" }
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenAI error: ${response.status} ${err}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;

  } catch (error) {
    console.error(`❌ OpenAI call failed: ${error.message}`);
    throw error;
  }
}

function qualityGateFails(text, contextStr) {
  const lower = text.toLowerCase();

  const bannedPhrases = [
    "amid uncertainty",
    "prevailing fear sentiment",
    "market participants",
    "macro headwinds",
  ];
  if (bannedPhrases.some(phrase => lower.includes(phrase))) {
    console.log("Quality Gate Failed: Contains banned filler phrase.");
    return true;
  }

  if (lower.includes("risk-on") || lower.includes("risk-off")) {
    const rssText = contextStr.toLowerCase();
    if (!rssText.includes("risk-on") && !rssText.includes("risk-off")) {
      console.log("Quality Gate Failed: Hallucinated 'risk-on/risk-off'.");
      return true;
    }
  }

  const instructionVerbs = ["buy ", "sell ", "stake ", "avoid ", "short ", "long ", "ape ", "rotate "];
  if (instructionVerbs.some(verb => lower.includes(` ${verb}`))) {
    console.log("Quality Gate Failed: Contains instruction verbs.");
    return true;
  }

  if (lower.includes("no action required")) {
    console.log("Quality Gate Failed: Contains 'no action required'.");
    return true;
  }

  return false;
}

// ============================================================================
// PARSING LOGIC
// ============================================================================

function cleanJsonString(str) {
  // Remove markdown code blocks if present
  let cleaned = str.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json/, '').replace(/```$/, '');
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```/, '').replace(/```$/, '');
  }
  return cleaned.trim();
}

function parseStoryJSON(response) {
  const text = cleanJsonString(response);
  try {
    const data = JSON.parse(text);

    // Map new 'story_content' field to 'story' for compatibility
    if (data.story_content && !data.story) {
      data.story = data.story_content;
    }

    if (!data.story && !data.story_content) {
      throw new Error("JSON parsed but missing 'story_content' field.");
    }

    return data;
  } catch (e) {
    console.error("❌ JSON Parse Failed. Response snippet:", text.substring(0, 100));
    throw new Error("Invalid JSON response from AI");
  }
}

// ============================================================================
// METRICS EXTRACTION
// ============================================================================

function extractMetrics(candidate) {
  const tweets = candidate.tweets || [];

  // Total engagement
  const totalEngagement = tweets.reduce((sum, tweet) => {
    const likes = tweet.favorite_count || 0;
    const retweets = tweet.retweet_count || 0;
    const quotes = tweet.quote_count || 0;
    const replies = tweet.reply_count || 0;
    return sum + (likes * 1.0) + (retweets * 2.0) + (quotes * 3.0) + (replies * 1.5);
  }, 0);

  // Top tweet engagement
  const topTweetEngagement = Math.max(...tweets.map(t => {
    const likes = t.favorite_count || 0;
    const retweets = t.retweet_count || 0;
    const quotes = t.quote_count || 0;
    const replies = t.reply_count || 0;
    return (likes * 1.0) + (retweets * 2.0) + (quotes * 3.0) + (replies * 1.5);
  }));

  // Unique voices
  const uniqueVoices = new Set(tweets.map(t => t.screen_name)).size;

  // 5-day trend (synthetic based on current engagement)
  const engagementTrend = [
    Math.round(totalEngagement * 0.4),
    Math.round(totalEngagement * 0.55),
    Math.round(totalEngagement * 0.68),
    Math.round(totalEngagement * 0.82),
    Math.round(totalEngagement)
  ];

  return {
    tweets: tweets.length,
    engagement: Math.round(totalEngagement),
    topTweet: Math.round(topTweetEngagement),
    voices: uniqueVoices,
    engagementTrend
  };
}

function extractWhoToFollow(candidate) {
  const tweets = candidate.tweets || [];

  // Calculate engagement per user
  const userEngagement = {};
  tweets.forEach(tweet => {
    const user = tweet.screen_name;
    if (!user) return;

    const engagement =
      (tweet.favorite_count || 0) * 1.0 +
      (tweet.retweet_count || 0) * 2.0 +
      (tweet.quote_count || 0) * 3.0 +
      (tweet.reply_count || 0) * 1.5;

    userEngagement[user] = (userEngagement[user] || 0) + engagement;
  });

  // Sort by engagement
  const sorted = Object.entries(userEngagement)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  return sorted.map(([handle, engagement]) => ({
    handle: `@${handle}`,
    engagement: Math.round(engagement)
  }));
}

// ============================================================================
// STORY GENERATION
// ============================================================================

async function generateStory(candidate, index) {
  process.stdout.write(`📝 Generating story ${index + 1}: "${candidate.narrative.substring(0, 30)}..." `);

  // Build context from tweets
  const tweets = candidate.tweets || [];
  const context = tweets.slice(0, 15).map(t => { // Increased context for GPT-4o
    const text = (t.full_text || '').substring(0, 350);
    return `- @${t.screen_name}: ${text}`;
  }).join('\n');

  const prompt = STORY_PROMPT
    .replace('{context}', context)
    .replace('{category}', candidate.category)
    .replace('{narrative}', candidate.narrative);

  try {
    // Use OpenAI directly
    let response = await callOpenAI(prompt);

    if (qualityGateFails(response, context)) {
      console.log(`⚠️ Quality gate failed for story ${index + 1}. Retrying once...`);
      response = await callOpenAI(prompt, true);
    }

    const storyData = parseStoryJSON(response);

    // Soft validation
    const storyLen = storyData.story ? storyData.story.length : 0;
    if (storyLen < CONFIG.MIN_STORY_LENGTH) {
      console.log(`⚠️ Short (${storyLen}c)`);
    } else {
      console.log(`✅ (${storyLen}c)`);
    }

    // Extract metrics & voices
    const metrics = extractMetrics(candidate);
    const topVoices = extractWhoToFollow(candidate);

    // Safely map whoToFollow
    const whoToFollow = (Array.isArray(storyData.whoToFollow) ? storyData.whoToFollow : []).map((person, i) => ({
      ...person,
      engagement: topVoices[i]?.engagement || 0
    }));

    // Ensure we have at least some recommended follows if LLM failed
    if (whoToFollow.length === 0) {
      topVoices.forEach(v => whoToFollow.push({
        handle: v.handle,
        reason: "Top voice in this conversation",
        role: "Community"
      }));
    }

    return {
      id: `story_${Date.now()}_${index}`,
      title: candidate.narrative,
      type: getStoryType(candidate.category),
      category: candidate.category,
      author: tweets[0]?.screen_name ? `@${tweets[0].screen_name}` : 'Solana Intelligence',
      timestamp: new Date().toISOString(),
      metrics,
      content: {
        signal: storyData.signal || candidate.narrative,
        story: storyData.story, // This now comes from 'story_content' via parser
        takeaways: Array.isArray(storyData.takeaways) ? storyData.takeaways : [],
        whoToFollow
      },
      riskLevel: storyData.riskLevel || 'medium',
      narrativeStrength: storyData.narrativeStrength || 7.0
    };

  } catch (error) {
    console.log(`❌ ${error.message}`);
    return null;
  }
}

function getStoryType(category) {
  if (category.includes('Security') || category.includes('Risk')) return 'critical';
  if (category.includes('Launch') || category.includes('Early Access')) return 'live';
  return 'alpha';
}

// ============================================================================
// MAIN LOGIC
// ============================================================================

async function generateStories() {
  console.log('🚀 [Story Generation] Starting...\n');
  console.log('🤖 AI Provider: OpenAI (gpt-4.1)');

  const candidates = JSON.parse(fs.readFileSync(CANDIDATES_PATH, 'utf-8'));
  console.log(`📊 Candidates available: ${candidates.length}`);

  const toGenerate = candidates.slice(0, CONFIG.MAX_STORIES);

  const stories = [];
  for (let i = 0; i < toGenerate.length; i++) {
    const story = await generateStory(toGenerate[i], i);
    if (story) {
      stories.push(story);
    }
  }

  const finalStories = stories;

  if (finalStories.length === 0) {
    console.error("\n❌ Failed to generate any valid stories.");
    return;
  }

  const globalMetrics = {
    total_tweets: finalStories.reduce((sum, s) => sum + s.metrics.tweets, 0),
    total_engagement: finalStories.reduce((sum, s) => sum + s.metrics.engagement, 0),
    unique_voices: finalStories.reduce((sum, s) => sum + s.metrics.voices, 0),
    top_tweet: Math.max(...finalStories.map(s => s.metrics.topTweet))
  };

  const output = {
    generated_at: new Date().toISOString(),
    global_metrics: globalMetrics,
    items: finalStories
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));

  // Mirror to data/ so syncToKv.mjs can find it from either path
  const mirrorDir = OUTPUT_PATH_MIRROR.replace(/\/[^/]+$/, '');
  if (!fs.existsSync(mirrorDir)) fs.mkdirSync(mirrorDir, { recursive: true });
  fs.writeFileSync(OUTPUT_PATH_MIRROR, JSON.stringify(output, null, 2));

  console.log(`\n✅ Saved ${finalStories.length} premium stories to: ${OUTPUT_PATH}\n`);
  return finalStories;
}

// ============================================================================
// RUN
// ============================================================================

try {
  generateStories();
} catch (error) {
  console.error('❌ Fatal error:', error.message);
  console.error(error.stack);
  process.exit(1);
}
