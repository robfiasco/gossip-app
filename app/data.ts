export type StoryLink = {
  label: string;
  source: string;
};

export type Story = {
  id: string;
  headline: string;
  source: string;
  time: string;
  summary: string;
  why: string;
  links: StoryLink[];
};

export const stories: Story[] = [
  {
    id: "s1",
    headline:
      "Jito restaking program expands validator participation with tighter slashing guardrails",
    source: "Blockworks",
    time: "07:40",
    summary:
      "Jito opened its restaking framework to a broader set of Solana validators, pairing higher cap limits with additional risk controls. Early data shows a modest rise in MEV capture while keeping downtime penalties unchanged. The change signals a push toward capital efficiency without diluting network safety.",
    why: "Signals confidence in validator economics while preserving liveness guarantees.",
    links: [
      { label: "Primary source", source: "Jito Research" },
      { label: "Key X/Twitter thread", source: "@jito_labs" },
      { label: "Developer commentary", source: "Anza Engineering Notes" },
      { label: "Podcast mention", source: "Lightspeed" },
      { label: "Reddit discussion", source: "r/solana" },
      { label: "Research post", source: "Helius Labs" },
    ],
  },
  {
    id: "s2",
    headline: "Firedancer client reaches 10k TPS in public devnet tests",
    source: "Solana Status",
    time: "09:05",
    summary:
      "Engineers reported sustained 10k TPS bursts on a public devnet using the Firedancer validator client. The test emphasized packet handling and leader rotation stability rather than synthetic benchmarks. It suggests real-world throughput gains are within reach ahead of mainnet rollout.",
    why: "Indicates meaningful performance headroom for congestion-heavy periods.",
    links: [
      { label: "Primary source", source: "Firedancer Devnet Report" },
      { label: "Key X/Twitter thread", source: "@jump_firedancer" },
      { label: "Developer commentary", source: "Solana Core Forum" },
      { label: "Podcast mention", source: "Blockworks Empire" },
      { label: "Reddit discussion", source: "r/solana" },
      { label: "Research post", source: "Anza Roadmap" },
    ],
  },
  {
    id: "s3",
    headline:
      "Marinade launches institutional staking dashboard with proof-of-yield reporting",
    source: "The Block",
    time: "10:15",
    summary:
      "Marinade introduced a reporting layer tailored for funds and treasury teams, including validator-level yield proofs and compliance exports. The dashboard aggregates stake distribution and risk exposure by cluster. Early partners include market makers and DAO treasuries.",
    why: "Improves allocators’ confidence in staking as a treasury strategy.",
    links: [
      { label: "Primary source", source: "Marinade Release Notes" },
      { label: "Key X/Twitter thread", source: "@MarinadeFinance" },
      { label: "Developer commentary", source: "Stakewiz Insights" },
      { label: "Podcast mention", source: "Unchained" },
      { label: "Reddit discussion", source: "r/solana" },
      { label: "Research post", source: "Messari" },
    ],
  },
  {
    id: "s4",
    headline: "MEV tipping rates stabilize after a two-week volatility spike",
    source: "Dune Analytics",
    time: "12:30",
    summary:
      "MEV tips on Solana flattened after a mid-month surge tied to memecoin volatility. The median tip rate returned to a narrow band, while high-percentile tips fell sharply. This points to a cooling of opportunistic flow and steadier block economics.",
    why: "Suggests block revenue has normalized after speculative bursts.",
    links: [
      { label: "Primary source", source: "Dune Dashboard" },
      { label: "Key X/Twitter thread", source: "@dune" },
      { label: "Developer commentary", source: "Jito Labs" },
      { label: "Podcast mention", source: "The Chopping Block" },
      { label: "Reddit discussion", source: "r/solana" },
      { label: "Research post", source: "Blockworks Research" },
    ],
  },
  {
    id: "s5",
    headline: "Helius upgrades indexing with lower-latency account diff streams",
    source: "Helius Blog",
    time: "14:10",
    summary:
      "Helius released a new account-diff stream that reduces indexer lag and supports partial replay for missed slots. Early adopters report cleaner downstream analytics for DeFi and NFT activity. The update focuses on reliability for real-time dashboards.",
    why: "Strengthens data quality for teams building on-chain intelligence tools.",
    links: [
      { label: "Primary source", source: "Helius Blog" },
      { label: "Key X/Twitter thread", source: "@heliuslabs" },
      { label: "Developer commentary", source: "Triton One" },
      { label: "Podcast mention", source: "Solana Podcast" },
      { label: "Reddit discussion", source: "r/solana" },
      { label: "Research post", source: "L2Beat" },
    ],
  },
];

export const brief =
  "Network activity cooled from last week’s spike, but validator economics remain steady. Restaking adoption is broadening with tighter safety controls, while client performance testing points to meaningful throughput gains. Institutional staking infrastructure continues to mature, signaling more durable capital flows.";
