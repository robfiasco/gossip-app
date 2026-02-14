# Validator v1 Data Sources

This app now pulls live market data and stories from public endpoints. No API keys required (v1).

## Endpoints
- CoinGecko (SOL price + 24h/7d): `https://api.coingecko.com/api/v3/coins/solana`
- CoinGecko Global (market cap + BTC dominance): `https://api.coingecko.com/api/v3/global`
- Alternative.me Fear & Greed: `https://api.alternative.me/fng/?limit=1&format=json`
- DefiLlama Yields: `https://yields.llama.fi/pools`
- RSS sources (daily article cache):
  - The Block: `https://www.theblock.co/rss.xml`
  - CoinDesk: `https://www.coindesk.com/arc/outboundfeeds/rss/`
  - Decrypt: `https://decrypt.co/feed`
  - Cointelegraph: `https://cointelegraph.com/rss`
  - Messari: `https://messari.io/rss`
  - Blockworks: `https://blockworks.co/feed`
  - Galaxy: `https://www.galaxy.com/insights/rss/`
  - VanEck Digital Assets: `https://www.vaneck.com/us/en/blogs/digital-assets/feed/`
  - CryptoSlate: `https://cryptoslate.com/feed/`
  - AMB Crypto: `https://ambcrypto.com/feed/`

## Notes
- Data is cached in-memory for 5 minutes in `lib/data/terminalData.ts`.
- Story URLs are deduped for 3 days using `data/seenStories.json`.
- If any API fails, fields fall back to `—` and the UI continues to render.

## Daily Article Cache
Generate the daily article cache with:

```
npm run articles:build
```

Output is written to:
- `data/articles.json`

Next step: match influencer posts to this cache for daily story selection.

## LLM Daily Digest (local Ollama)
Generate the three app outputs (Signal Board, Briefing, News cards) from local signals + articles:

```
npm run articles:build
npm run digest:llm
```

Outputs:
- `signal_board.json`
- `briefing.json`
- `news_cards.json`

### Debugging digest:llm
- Raw LLM response is saved to: `data/llm_last_response.txt`
- “Backpack seeded” now means the Backpack tokenomics article is guaranteed to be in the **LLM input subset**.
