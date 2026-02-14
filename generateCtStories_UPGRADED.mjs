#!/usr/bin/env node
/**
 * generateCtStories.mjs - UPGRADED VERSION
 * 
 * Improvements over original:
 * 1. Premium Llama3 prompts (no more generic output)
 * 2. Title generation first (compelling hooks)
 * 3. Structured output (hook, deep dive, alpha)
 * 4. Post-processing (add visuals, callouts, who to follow)
 * 5. Quality checks before saving
 */

import fs from 'fs';
import { spawn } from 'child_process';

const CANDIDATES_PATH = 'data/story_candidates.json';
const OUTPUT_CT_PATH = 'data/ct_stories.json';
const OUTPUT_PUBLIC_PATH = 'public/data/validator_stories.json';
const MEMORY_24H_PATH = 'data/stories_shown_last_24h.json';
const MEMORY_48H_PATH = 'data/stories_shown_last_48h.json';

const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3';

// ============================================================================
// PREMIUM PROMPT TEMPLATES
// ============================================================================

const PROMPT_TEMPLATES = {
  'AI / Agents': `You are an elite crypto intelligence analyst writing exclusive reports for Seeker device owners (high-value Solana users).

CONTEXT:
{context}

CATEGORY: AI Agents / Automation

YOUR TASK:
Write a 500-word investigative story about this AI agent development.

FOCUS ON:
- What specific capabilities do these AI agents have that humans can't replicate?
- Who's building them and what's their track record?
- Economic model: How do users and agents make money?
- What makes this different from previous trading bots or automation?
- What are the risks? (manipulation, bugs, regulation)
- Competitive landscape - who wins/loses if this succeeds?

STRUCTURE:
1. THE HOOK (50 words): What's happening RIGHT NOW and why Seeker owners should care
2. THE DEEP DIVE (400 words): Context, data, implications, connections others miss
3. THE ALPHA (50 words): Actionable takeaways - who to follow, what to watch

STYLE:
- Bloomberg Terminal meets Dune Analytics
- Confident, data-driven, insider tone
- Use crypto-native language
- NO fluff, NO cliches ("buckle up", "LFG", "strap in")
- DO NOT quote tweets directly
- Every sentence must add value

REQUIREMENTS:
✅ Include specific numbers, dates, names
✅ Find the non-obvious angle
✅ Compare to past similar launches
✅ Identify what could go wrong
✅ End with 3 specific people to follow

BEGIN YOUR STORY:`,

  'New Product Launch': `You are an elite crypto intelligence analyst writing exclusive reports for Seeker device owners.

CONTEXT:
{context}

CATEGORY: Product Launch

YOUR TASK:
Write a 500-word investigative story about this product launch.

FOCUS ON:
- What problem does this product actually solve?
- Who's behind it and why should we trust them? (track record matters)
- What's the technical innovation or is this just repackaging?
- Competitive advantage vs existing solutions
- Go-to-market strategy and early traction
- What's the business model? Who pays, who profits?

STRUCTURE:
1. THE HOOK (50 words): What launched and why it matters NOW
2. THE DEEP DIVE (400 words): How it works, who built it, why it's different, market implications
3. THE ALPHA (50 words): What to do with this information - follow these people, watch these metrics

STYLE:
- Skeptical but fair
- Data-driven analysis
- NO marketing speak
- Compare to competitors specifically

REQUIREMENTS:
✅ Name the team/founders and their background
✅ Identify the competitive moat (or lack of one)
✅ Include adoption metrics if available
✅ Call out red flags if you see them
✅ Specific action items at the end

BEGIN YOUR STORY:`,

  'DeFi Innovation': `You are an elite crypto intelligence analyst writing for Seeker owners.

CONTEXT:
{context}

CATEGORY: DeFi / Protocol

YOUR TASK:
Write a 500-word deep dive on this DeFi development.

FOCUS ON:
- What's the mechanism and is it actually sustainable?
- Where do the yields/returns come from? (Be specific)
- Smart contract audits and security posture
- Total Value Locked (TVL) and growth trajectory
- Competitive moat vs other protocols
- What happens in a market crash or exploit?

STRUCTURE:
1. THE HOOK (50 words): What's new in DeFi and why it matters
2. THE DEEP DIVE (400 words): Mechanism explained, risks analyzed, competition assessed
3. THE ALPHA (50 words): Is this safe? Who should use it? What to watch?

STYLE:
- Forensic analysis
- Question everything
- Show your work with data

REQUIREMENTS:
✅ Explain the mechanism in plain English
✅ Identify where yield comes from
✅ Compare to similar protocols
✅ Assess risks honestly
✅ Give clear recommendation (or lack of one)

BEGIN YOUR STORY:`,

  'Gaming / NFT': `You are an elite crypto analyst writing for Seeker device owners.

CONTEXT:
{context}

CATEGORY: Gaming / NFTs

YOUR TASK:
Write a 500-word story about this gaming/NFT development.

FOCUS ON:
- What's the actual gameplay loop?
- Can players make money or is it pay-to-win?
- Team background - have they shipped games before?
- Community size and early engagement metrics
- What keeps players coming back? (The loop)
- Sustainability of the economic model

STRUCTURE:
1. THE HOOK (50 words): What's launching and why gamers care
2. THE DEEP DIVE (400 words): Gameplay, economics, team, traction
3. THE ALPHA (50 words): Worth your time? Who to follow? Red flags?

STYLE:
- Gamer-first analysis
- Economics-aware
- Cut through the hype

REQUIREMENTS:
✅ Describe actual gameplay (not just "play to earn")
✅ Analyze token economics
✅ Check team's game dev history
✅ Give honest assessment

BEGIN YOUR STORY:`,

  'Mobile / Seeker': `You are an elite crypto analyst writing for Seeker device owners.

CONTEXT:
{context}

CATEGORY: Mobile / Seeker Ecosystem

YOUR TASK:
Write a 500-word story about this Seeker/mobile development.

FOCUS ON:
- What's the killer feature for mobile crypto?
- How does this leverage Seeker's unique capabilities?
- Integration with Solana ecosystem
- Who's the target user and why would they care?
- Competitive positioning vs web apps or other mobile solutions

STRUCTURE:
1. THE HOOK (50 words): What's new for Seeker and why it matters
2. THE DEEP DIVE (400 words): Features, integration, use cases, adoption
3. THE ALPHA (50 words): How Seeker owners can use this, what to expect

STYLE:
- Seeker-owner perspective
- Feature-focused
- Practical advice

REQUIREMENTS:
✅ Explain Seeker-specific advantages
✅ Show real use cases
✅ Compare to alternatives
✅ Give activation instructions

BEGIN YOUR STORY:`,

  'Infrastructure': `You are an elite crypto analyst writing for Seeker owners.

CONTEXT:
{context}

CATEGORY: Infrastructure / Protocol

YOUR TASK:
Write a 500-word analysis of this infrastructure development.

FOCUS ON:
- What technical problem does this solve?
- How does this impact the broader ecosystem?
- Who benefits most from this change?
- Comparison to competing L1/L2 solutions
- Adoption timeline and migration path

STRUCTURE:
1. THE HOOK (50 words): What changed and why it matters
2. THE DEEP DIVE (400 words): Technical details, ecosystem impact, adoption path
3. THE ALPHA (50 words): What developers/users should know

STYLE:
- Technical but accessible
- Ecosystem-aware
- Forward-looking

REQUIREMENTS:
✅ Explain the technical innovation
✅ Identify who this helps most
✅ Assess adoption likelihood
✅ Compare to alternatives

BEGIN YOUR STORY:`
};

const DEFAULT_PROMPT = `You are an elite crypto intelligence analyst writing for Seeker device owners.

CONTEXT:
{context}

YOUR TASK:
Write a compelling 500-word story about this development in the Solana ecosystem.

STRUCTURE:
1. THE HOOK (50 words): What's happening and why it matters NOW
2. THE DEEP DIVE (400 words): Context, implications, data, connections
3. THE ALPHA (50 words): What to do with this information

STYLE:
- Data-driven and specific
- No hype or fluff
- Find the non-obvious angle

BEGIN YOUR STORY:`;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function buildContext(candidate) {
  /**
   * Build context from tweet cluster
   */
  const tweets = candidate.tweets || [];
  
  // Sort by engagement
  const sortedTweets = tweets.sort((a, b) => {
    const scoreA = (a.favorite_count || 0) + (a.retweet_count || 0);
    const scoreB = (b.favorite_count || 0) + (b.retweet_count || 0);
    return scoreB - scoreA;
  });
  
  // Take top 5 tweets
  const topTweets = sortedTweets.slice(0, 5);
  
  // Format context
  const context = topTweets.map((tweet, i) => {
    const engagement = (tweet.favorite_count || 0) + (tweet.retweet_count || 0);
    const user = tweet.screen_name || 'unknown';
    const text = tweet.full_text || '';
    
    return `Tweet ${i + 1} (@${user}, ${engagement} engagement):\n${text}`;
  }).join('\n\n');
  
  return context;
}

function getPromptTemplate(category) {
  return PROMPT_TEMPLATES[category] || DEFAULT_PROMPT;
}

async function runOllama(prompt, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ollama', ['run', OLLAMA_MODEL], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error(`Ollama timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    proc.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(stderr.trim() || `ollama exited with code ${code}`));
        return;
      }
      resolve(stdout.trim());
    });

    proc.stdin.write(prompt);
    proc.stdin.end();
  });
}

async function generateTitle(candidate) {
  /**
   * Generate compelling title first
   */
  const titlePrompt = `Based on this narrative: "${candidate.narrative}"

Category: ${candidate.category}

Generate a COMPELLING article title (max 80 characters) that:
- Makes people want to click
- Includes specific entities/products
- Reveals the "so what?"
- Avoids generic phrases

Good examples:
- "PayPal's Silent Solana Switch: What It Means for Enterprise"
- "Inside Backpack's Anti-Dump Tokenomics"
- "The $100k AI Agent War: 15 Platforms, Real Money"

Bad examples:
- "Solana Updates This Week"
- "New DeFi Protocol Launches"
- "Top AI Agents to Watch"

Your title (max 80 chars):`;

  try {
    const stdout = await runOllama(titlePrompt, 60000);
    const title = stdout.trim().split('\n')[0]; // First line only
    return title.substring(0, 80); // Ensure max length
  } catch (error) {
    console.error('[Generator] Title generation failed:', error.message);
    return candidate.narrative; // Fallback
  }
}

async function generateStory(candidate, title) {
  /**
   * Generate full story using Llama3
   */
  const template = getPromptTemplate(candidate.category);
  const context = buildContext(candidate);
  
  const prompt = template.replace('{context}', context);
  
  console.log(`[Generator] Generating story: "${title}"`);
  console.log(`[Generator] Category: ${candidate.category}`);
  console.log(`[Generator] Using ${candidate.tweets.length} tweets, ${candidate.uniqueUsers} unique users`);
  
  try {
    const stdout = await runOllama(prompt, 180000);
    return stdout.trim();
  } catch (error) {
    console.error(`[Generator] Story generation failed: ${error.message}`);
    return null;
  }
}

function extractWhoToFollow(tweets) {
  /**
   * Extract key voices from tweets
   */
  const userEngagement = new Map();
  
  tweets.forEach(tweet => {
    const user = tweet.screen_name || 'unknown';
    const engagement = (tweet.favorite_count || 0) + (tweet.retweet_count || 0);
    
    userEngagement.set(user, (userEngagement.get(user) || 0) + engagement);
  });
  
  // Sort by engagement
  const sorted = [...userEngagement.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  
  return sorted.map(([user, engagement]) => ({
    handle: `@${user}`,
    engagement,
    role: inferRole(user, tweets)
  }));
}

function inferRole(user, tweets) {
  /**
   * Infer user's role from their tweets
   */
  const userTweets = tweets.filter(t => t.screen_name === user);
  const allText = userTweets.map(t => t.full_text || '').join(' ').toLowerCase();
  
  if (allText.includes('founder') || allText.includes('building')) {
    return 'Builder';
  } else if (allText.includes('trading') || allText.includes('perps')) {
    return 'Trader';
  } else if (allText.includes('analysis') || allText.includes('research')) {
    return 'Analyst';
  } else {
    return 'Community';
  }
}

function postProcess(story, candidate, title) {
  /**
   * Add structure and callouts to raw story
   */
  
  // Extract who to follow
  const whoToFollow = extractWhoToFollow(candidate.tweets);
  
  // Build final output
  return {
    title,
    category: candidate.category,
    narrative: candidate.narrative,
    content: story,
    metadata: {
      engagement: candidate.totalEngagement,
      uniqueUsers: candidate.uniqueUsers,
      tweetCount: candidate.tweets.length,
      generated: new Date().toISOString()
    },
    whoToFollow: whoToFollow.map(u => `${u.handle} (${u.role})`),
    keywords: candidate.keywords || [],
    // For frontend to display
    formatted: formatForDisplay(story, whoToFollow)
  };
}

function formatForDisplay(story, whoToFollow) {
  /**
   * Add visual formatting for frontend
   */
  
  // Try to split into sections
  const sections = story.split(/\n\n+/);
  
  const formatted = {
    hook: sections[0] || '',
    body: sections.slice(1, -1).join('\n\n') || '',
    alpha: sections[sections.length - 1] || '',
    whoToFollow: whoToFollow
  };
  
  return formatted;
}

function passesQualityCheck(story) {
  /**
   * Quality checks before publishing
   */
  
  if (!story || story.length < 400) {
    console.log('[Quality] ❌ Too short');
    return false;
  }
  
  if (story.length > 3000) {
    console.log('[Quality] ❌ Too long');
    return false;
  }
  
  // Check for generic AI phrases
  const badPhrases = [
    'buckle up',
    'strap in',
    'lfg',
    'wagmi',
    'gm',
    'the future is',
    'this is huge',
    'game changer'
  ];
  
  const storyLower = story.toLowerCase();
  const foundBadPhrases = badPhrases.filter(phrase => storyLower.includes(phrase));
  
  if (foundBadPhrases.length > 0) {
    console.log(`[Quality] ⚠️  Contains cliches: ${foundBadPhrases.join(', ')}`);
    // Warning but don't block
  }
  
  // Check for data/numbers
  const hasNumbers = /\d+/.test(story);
  if (!hasNumbers) {
    console.log('[Quality] ⚠️  No numbers/data found');
  }
  
  // Check for specificity
  const hasNames = /@\w+|[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/.test(story);
  if (!hasNames) {
    console.log('[Quality] ⚠️  No specific names/entities');
  }
  
  console.log('[Quality] ✅ Passed');
  return true;
}

// ============================================================================
// MAIN LOGIC
// ============================================================================

async function generateStories() {
  console.log(`[Generator] Using Ollama model: ${OLLAMA_MODEL}`);
  
  // Load candidates
  if (!fs.existsSync(CANDIDATES_PATH)) {
    console.log('[Generator] No candidates file found. Run selectStoryClusters first.');
    return;
  }
  
  const candidates = JSON.parse(fs.readFileSync(CANDIDATES_PATH, 'utf-8'));
  console.log(`[Generator] Loaded ${candidates.length} candidates.`);
  
  if (candidates.length === 0) {
    console.log('[Generator] No candidates to process.');
    return;
  }
  
  // Load memory
  const memory24h = fs.existsSync(MEMORY_24H_PATH)
    ? JSON.parse(fs.readFileSync(MEMORY_24H_PATH, 'utf-8'))
    : [];
  const memory48h = fs.existsSync(MEMORY_48H_PATH)
    ? JSON.parse(fs.readFileSync(MEMORY_48H_PATH, 'utf-8'))
    : [];
  
  // Generate stories
  const stories = [];
  
  for (const candidate of candidates) {
    console.log(`\n[Generator] Processing: ${candidate.narrative}`);
    
    // Generate title first
    const title = await generateTitle(candidate);
    console.log(`[Generator] Title: "${title}"`);
    
    // Generate story
    const story = await generateStory(candidate, title);
    
    if (!story) {
      console.log('[Generator] ❌ Story generation failed, skipping.');
      continue;
    }
    
    // Quality check
    if (!passesQualityCheck(story)) {
      console.log('[Generator] ❌ Failed quality check, skipping.');
      continue;
    }
    
    // Post-process
    const processedStory = postProcess(story, candidate, title);
    stories.push(processedStory);
    
    console.log(`[Generator] ✅ Story generated successfully`);
  }
  
  console.log(`\n[Generator] Generated ${stories.length} stories total.`);
  
  // Save
  fs.writeFileSync(OUTPUT_CT_PATH, JSON.stringify(stories, null, 2));
  fs.writeFileSync(OUTPUT_PUBLIC_PATH, JSON.stringify(stories, null, 2));
  
  // Update memory
  const newMemory = stories.map(s => ({
    title: s.title,
    narrative: s.narrative,
    timestamp: Date.now()
  }));
  
  const updated24h = [...newMemory, ...memory24h];
  const updated48h = [...newMemory, ...memory48h];
  
  fs.writeFileSync(MEMORY_24H_PATH, JSON.stringify(updated24h, null, 2));
  fs.writeFileSync(MEMORY_48H_PATH, JSON.stringify(updated48h, null, 2));
  
  console.log(`\n[Generator] Saved ${stories.length} stories to:`);
  console.log(`  - ${OUTPUT_CT_PATH}`);
  console.log(`  - ${OUTPUT_PUBLIC_PATH}`);
}

// ============================================================================
// RUN
// ============================================================================

generateStories().catch(error => {
  console.error('[Generator] Fatal error:', error);
  process.exit(1);
});
