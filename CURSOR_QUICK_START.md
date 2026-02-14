# QUICK START PROMPT FOR CURSOR/CODEX

Copy/paste this to start:

---

I need to upgrade the Seeker-exclusive story section in my Validator app. Currently it shows generic titles with 3 bullet points in monospace font. I need it to show premium card-based stories with real data and 500-word articles.

I have complete reference implementations in `/mnt/user-data/outputs/`:
- `card-layout-full-story.jsx` (target UI - copy this exactly)
- `LLAMA3_FULL_STORY_PROMPT.md` (prompt for 500-word story generation)
- `extract_story_metrics.py` (extracts metrics from tweets - convert to JS)
- `IMPLEMENTATION_GUIDE_FULL_STORIES.md` (detailed integration guide)
- `selectStoryClusters_UPGRADED.mjs` (better story selection)
- `generateCtStories_UPGRADED.mjs` (full story generation)

Full brief with requirements: See `CODEX_BRIEF.md`

Current data:
- 148 tweets in `signals_raw.json`
- 18,202 total engagement
- Top tweet: 1,482 engagement
- Need to extract these metrics and show them in UI

Target output format:
```json
{
  "title": "Specific narrative (not generic)",
  "signal": "One-sentence hook",
  "stats": {"total_tweets": 148, "total_engagement": 18202, "top_engagement": 1482},
  "story": "500-word article",
  "takeaways": ["Action 1", "Action 2", "Action 3"],
  "whoToFollow": [{"handle": "@user", "role": "Community", "engagement": 1204}]
}
```

What needs to be built:
1. Update `scripts/selectStoryClusters.mjs` - extract specific narratives (not "Ecosystem Updates")
2. Create `scripts/extractStoryMetrics.mjs` - calculate engagement metrics
3. Update `scripts/generateCtStories.mjs` - use new Llama3 prompt for full stories
4. Update frontend component - render card layout (reference provided)
5. Change output format in `validator_stories.json`

Start by:
1. Reading `CODEX_BRIEF.md` for full requirements
2. Looking at `card-layout-full-story.jsx` for target UI
3. Converting `extract_story_metrics.py` to JavaScript

Ready to implement?

---

Then let them ask questions and reference the detailed files.
