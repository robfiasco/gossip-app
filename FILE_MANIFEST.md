# 📁 FILE MANIFEST - Everything You Need

All files are in `/mnt/user-data/outputs/`

## 🚀 START HERE

1. **CURSOR_QUICK_START.md** ← Copy/paste this to Cursor to begin
2. **CODEX_BRIEF.md** ← Full implementation requirements (give this to your AI)

## 🎨 DESIGN REFERENCE (What It Should Look Like)

3. **card-layout-full-story.jsx** 
   - Complete React component
   - Shows exactly what the final UI should be
   - 6 cards: Title, Signal, Stats, Story, Takeaways, Who To Follow
   - Copy this component structure exactly

4. **premium-story-mockups.jsx**
   - 5 different design variations we explored
   - You picked "Card Layout" - that became #3 above

## 🤖 AI STORY GENERATION

5. **LLAMA3_FULL_STORY_PROMPT.md**
   - Prompt that generates 500-word stories
   - Copy this to `prompts/llama3_full_story.txt` in your project
   - Llama3 reads this and outputs structured story JSON

6. **SIGNAL_BOARD_PROMPT_IMPROVED.md**
   - Bonus: Improved prompt for Signal Board section
   - Makes it sound more human, less robotic

## 📊 DATA EXTRACTION

7. **extract_story_metrics.py**
   - Python script that analyzes your tweets
   - Extracts: total tweets, engagement, top voices
   - Needs to be converted to JavaScript for your pipeline
   - Output: metrics for the stats card

8. **story_metrics.json**
   - Example output from #7 running on your actual data
   - Shows you have: 148 tweets, 18K engagement, 1,482 top tweet

## 🔧 IMPROVED SCRIPTS

9. **selectStoryClusters_UPGRADED.mjs**
   - Better version of your story selection script
   - Uses engagement weighting (not just cluster size)
   - Extracts specific narratives ("PayPal integrates Solana") not generic ("Ecosystem Updates")
   - Replace your current `scripts/selectStoryClusters.mjs` with this

10. **generateCtStories_UPGRADED.mjs**
    - Better version of your story generation script
    - Uses category-specific prompts
    - Generates full 500-word articles (not just bullets)
    - Has quality checks (no cliches, requires data)
    - Replace your current `scripts/generateCtStories.mjs` with this

11. **analyze_tweets.py**
    - Alternative tweet analysis script
    - Shows topic clustering and narrative identification
    - Reference for logic (doesn't need to be run)

## 📖 GUIDES & DOCUMENTATION

12. **IMPLEMENTATION_GUIDE_FULL_STORIES.md**
    - Step-by-step integration guide
    - Shows how all pieces fit together
    - Code examples for each step
    - Testing instructions

13. **IMPLEMENTATION_GUIDE.md**
    - Guide for the upgraded story selection scripts (#9, #10)
    - Before/after comparisons
    - Configuration options

14. **PROMPT_COMPARISON.md**
    - Shows Signal Board prompt improvements
    - Before/after examples
    - Implementation instructions

## 📝 STRATEGY & ANALYSIS

15. **TOP_3_STORIES.md**
    - 3 example stories identified from your actual tweet data
    - Shows what good story selection looks like
    - Includes ready-to-use Llama3 prompts for each

16. **premium-story-strategy.md**
    - Full methodology for identifying good stories
    - What to avoid (generic topics)
    - How to cluster tweets effectively
    - Quality checks

## 🗂️ FILE ORGANIZATION

```
/mnt/user-data/outputs/
├── START HERE
│   ├── CURSOR_QUICK_START.md ← Copy to Cursor/Codex
│   └── CODEX_BRIEF.md ← Full requirements
│
├── DESIGN (What to build)
│   ├── card-layout-full-story.jsx ← Target UI
│   └── premium-story-mockups.jsx ← Alternative designs
│
├── AI PROMPTS
│   ├── LLAMA3_FULL_STORY_PROMPT.md ← Story generation
│   └── SIGNAL_BOARD_PROMPT_IMPROVED.md ← Signal Board
│
├── DATA SCRIPTS
│   ├── extract_story_metrics.py ← Needs JS conversion
│   ├── story_metrics.json ← Example output
│   └── analyze_tweets.py ← Reference
│
├── UPGRADED SCRIPTS (Replace yours with these)
│   ├── selectStoryClusters_UPGRADED.mjs
│   └── generateCtStories_UPGRADED.mjs
│
├── GUIDES
│   ├── IMPLEMENTATION_GUIDE_FULL_STORIES.md ← Main guide
│   ├── IMPLEMENTATION_GUIDE.md ← Script upgrades
│   └── PROMPT_COMPARISON.md ← Signal Board
│
└── STRATEGY
    ├── TOP_3_STORIES.md ← Example stories
    └── premium-story-strategy.md ← Methodology
```

## 🎯 QUICK REFERENCE

**Goal:** Premium card-based stories with real data and 500-word articles

**What you have now:**
- Generic titles ("Token Launch Chatter")
- 3 bullet points in monospace
- No metrics, no visuals

**What you're building:**
- Specific titles ("PayPal's Silent Solana Shift")
- 6 beautiful cards with color hierarchy
- Real metrics (148 tweets, 18K engagement)
- 500-word investigative articles
- Actionable takeaways
- Who to follow

**Your data:**
- 148 tweets in `signals_raw.json`
- 18,202 total engagement
- Top tweet: 1,482 (@armaniferrante)
- Top voices: @solana_daily, @gumsays, @armaniferrante

**Tech stack:**
- Node.js scripts
- Ollama (llama3)
- React frontend
- Output: `public/data/validator_stories.json`

## 📋 IMPLEMENTATION ORDER

1. **Read**: `CURSOR_QUICK_START.md` (copy to Cursor)
2. **Read**: `CODEX_BRIEF.md` (full requirements)
3. **Look at**: `card-layout-full-story.jsx` (target design)
4. **Convert**: `extract_story_metrics.py` to JavaScript
5. **Update**: Story selection script (use #9 as reference)
6. **Update**: Story generation script (use #10 as reference)
7. **Create**: Frontend component (copy #3)
8. **Test**: Run pipeline and verify output

## ❓ IF YOU NEED

**Design inspiration?** → `card-layout-full-story.jsx`
**Story examples?** → `TOP_3_STORIES.md`
**Integration help?** → `IMPLEMENTATION_GUIDE_FULL_STORIES.md`
**Script reference?** → `selectStoryClusters_UPGRADED.mjs` & `generateCtStories_UPGRADED.mjs`
**Data format?** → `story_metrics.json`
**Prompt reference?** → `LLAMA3_FULL_STORY_PROMPT.md`

## 🚦 READY TO START?

1. Copy `CURSOR_QUICK_START.md` content to Cursor/Codex
2. Point them to this manifest
3. Let them read the files and ask questions
4. They have everything they need!

---

Total files: 16
All in: `/mnt/user-data/outputs/`
