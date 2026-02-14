# IMPLEMENTATION BRIEF: Premium Story Layout for Validator App

## Problem We're Solving

Current story section in Validator app (Seeker-exclusive):
- ❌ Generic titles ("Token Launch Chatter Is Building")
- ❌ Bullet points in monospace font (looks cheap)
- ❌ No visual data (charts, stats, metrics)
- ❌ No actual story content (just 3 bullets)
- ❌ Doesn't feel premium/exclusive

## What We Need

Card-based layout with:
1. Real metrics from tweet data (engagement, mentions, users)
2. 500-600 word investigative article (not just bullets)
3. Beautiful visual hierarchy with color-coded cards
4. Structured content: Signal → Stats → Story → Takeaways → Who To Follow

## Reference Files

All implementation files are in the `/mnt/user-data/outputs/` directory:

1. **card-layout-full-story.jsx** - Complete React component (the target UI)
2. **LLAMA3_FULL_STORY_PROMPT.md** - Prompt for generating 500-word stories
3. **extract_story_metrics.py** - Script to extract metrics from tweets
4. **IMPLEMENTATION_GUIDE_FULL_STORIES.md** - Detailed integration guide

## Current Tech Stack

- Node.js scripts in `scripts/` directory
- Ollama (llama3) for story generation
- React frontend
- Tweet data in `signals_raw.json` (148 tweets)
- Output to `public/data/validator_stories.json`

## What You Need To Build

### 1. Update Story Selection Script

**File:** `scripts/selectStoryClusters.mjs`

**Changes needed:**
- Use `selectStoryClusters_UPGRADED.mjs` (provided in outputs) as reference
- Implement engagement-weighted scoring (not just cluster size)
- Extract actual narratives, not generic categories
- Output should be specific (e.g., "PayPal integrates Solana") not generic ("Ecosystem Updates")

**Key function to add:**
```javascript
function extractNarrative(cluster) {
  // Finds entities (PayPal, Backpack, Jupiter)
  // Finds actions (launch, integrate, announce)
  // Returns specific narrative like "PayPal integrates Solana"
  // NOT generic like "Ecosystem Updates"
}
```

### 2. Add Metrics Extraction

**New file:** `scripts/extractStoryMetrics.mjs`

**What it does:**
- Takes tweet cluster
- Calculates total engagement
- Identifies top tweets
- Finds key voices/users
- Outputs metrics for stats card

**Based on:** `extract_story_metrics.py` (convert to JavaScript)

**Output format:**
```javascript
{
  metrics: {
    total_tweets: 148,
    total_engagement: 18202,
    top_tweet_engagement: 1482,
    unique_users: 8
  },
  top_tweets: [...],
  top_users: [...]
}
```

### 3. Update Story Generation Script

**File:** `scripts/generateCtStories.mjs`

**Changes needed:**
- Load the new LLAMA3 FULL STORY prompt (from `LLAMA3_FULL_STORY_PROMPT.md`)
- Feed it: title, signal, context tweets, metrics
- Expect back: 500-word story + structured data (takeaways, who to follow)
- Save in new format (see below)

**New prompt location:**
Create `prompts/llama3_full_story.txt` with content from `LLAMA3_FULL_STORY_PROMPT.md`

**Key function to add:**
```javascript
async function generateFullStory(candidate, title) {
  // 1. Extract metrics from candidate
  const metrics = extractMetrics(candidate);
  
  // 2. Build input for Llama3
  const inputData = {
    title: title,
    category: candidate.category,
    signal: extractSignal(candidate),
    context_tweets: candidate.tweets.slice(0, 3),
    metrics: metrics
  };
  
  // 3. Load prompt template
  const prompt = loadPrompt('prompts/llama3_full_story.txt', inputData);
  
  // 4. Call Ollama
  const response = await ollama.generate({
    model: 'llama3',
    prompt: prompt
  });
  
  // 5. Parse JSON response
  return parseStoryJSON(response);
}
```

### 4. New Output Format

**File:** `public/data/validator_stories.json`

**Current format (bad):**
```json
[
  {
    "title": "Token Launch Chatter Is Building",
    "content": "Three bullet points..."
  }
]
```

**New format (good):**
```json
[
  {
    "id": "story_2026_02_13_001",
    "title": "PayPal's Silent Solana Shift: What It Means for Seeker Owners",
    "category": "Infrastructure",
    "date": "2026-02-13T18:30:00Z",
    
    "signal": "One-sentence hook that goes in purple card",
    
    "stats": {
      "total_tweets": 148,
      "total_engagement": 18202,
      "top_engagement": 1482
    },
    
    "story": "Full 500-600 word article text with \\n\\n for paragraph breaks",
    
    "takeaways": [
      "Actionable item 1",
      "Actionable item 2",
      "Actionable item 3"
    ],
    
    "whoToFollow": [
      {
        "handle": "@solana_daily",
        "reason": "Broke the story",
        "role": "Community",
        "engagement": 1204
      }
    ],
    
    "riskLevel": "medium",
    "narrativeStrength": 8.7
  }
]
```

### 5. Frontend Component

**File:** Create new component or update existing story display

**Reference:** `card-layout-full-story.jsx` (complete implementation provided)

**What it needs:**
- Fetch from `public/data/validator_stories.json`
- Render 6 cards:
  1. Title Card (with category badge)
  2. Signal Card (violet background, one-sentence hook)
  3. Stats Card (3-column metrics)
  4. Story Card (full 500-word article with paragraphs)
  5. Takeaways Card (numbered 1, 2, 3)
  6. Who To Follow Card (users with roles & engagement)

**Component structure:**
```jsx
<div className="space-y-5">
  <TitleCard title={story.title} category={story.category} date={story.date} />
  <SignalCard text={story.signal} />
  <StatsCard stats={story.stats} />
  <StoryCard story={story.story} />
  <TakeawaysCard items={story.takeaways} />
  <WhoToFollowCard people={story.whoToFollow} />
</div>
```

## Implementation Checklist

- [ ] Update `scripts/selectStoryClusters.mjs` with better narrative extraction
- [ ] Create `scripts/extractStoryMetrics.mjs` (based on Python version)
- [ ] Update `scripts/generateCtStories.mjs` to use full story prompt
- [ ] Create `prompts/llama3_full_story.txt` from the markdown file
- [ ] Update output format in `public/data/validator_stories.json`
- [ ] Create/update frontend component to render card layout
- [ ] Test with actual `signals_raw.json` data (148 tweets, 18K engagement)

## Testing Steps

1. **Run metric extraction:**
   ```bash
   node scripts/extractStoryMetrics.mjs
   ```
   Should output: 148 tweets, 18,202 engagement, top tweet 1,482

2. **Test Llama3 prompt manually:**
   ```bash
   cat prompts/llama3_full_story.txt | ollama run llama3
   ```
   Should return 500-word story + structured JSON

3. **Run full pipeline:**
   ```bash
   npm run stories:candidates
   npm run stories:ct
   ```
   Should generate `validator_stories.json` with full stories

4. **Check frontend:**
   Load Seeker story page → should show card layout with metrics + full story

## Expected Result

**Before:**
- Generic title
- 3 bullet points in monospace
- No data/metrics
- Feels cheap

**After:**
- Specific, compelling title ("PayPal's Silent Solana Shift...")
- 6 beautiful cards with proper hierarchy
- Real metrics (148 tweets, 18K engagement, 1,482 top)
- 500-word investigative article
- Actionable takeaways
- Who to follow with engagement numbers
- Feels premium/exclusive

## Reference Data

From latest `signals_raw.json`:
- 148 total tweets
- 18,202 total engagement
- Top tweet: 1,482 engagement (@armaniferrante on Backpack)
- Top 5 voices: @solana_daily (3,663), @gumsays (3,362), @armaniferrante (3,220)

This data should flow through to the stats card automatically.

## Files To Reference

All in `/mnt/user-data/outputs/`:

1. `card-layout-full-story.jsx` - Target UI (copy this exactly)
2. `LLAMA3_FULL_STORY_PROMPT.md` - Copy to `prompts/llama3_full_story.txt`
3. `extract_story_metrics.py` - Convert to JavaScript version
4. `IMPLEMENTATION_GUIDE_FULL_STORIES.md` - Detailed step-by-step

Also reference the upgraded scripts:
5. `selectStoryClusters_UPGRADED.mjs` - Better story selection logic
6. `generateCtStories_UPGRADED.mjs` - Full story generation

## Questions?

If anything is unclear:
1. Check `IMPLEMENTATION_GUIDE_FULL_STORIES.md` for detailed explanations
2. Look at `card-layout-full-story.jsx` for exact UI implementation
3. The Python script shows the logic (just needs conversion to JS)

## Priority

**HIGH** - This is the main Seeker-exclusive feature and currently looks unfinished.

Users expect premium content when they're locked behind a Seeker gate. Right now it looks like a placeholder. After this implementation, it will look like exclusive intelligence worth protecting.
