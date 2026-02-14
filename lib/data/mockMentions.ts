export type MockPost = {
  handle: string;
  url: string;
  postedAt: string;
  text: string;
};

export const mockPosts: MockPost[] = [
  {
    handle: "jussy_world",
    url: "https://x.com/jussy_world/status/1888888888888888888",
    postedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    text: "Kamino yield is holding up even as stables rotate. Watching deposit caps closely.",
  },
  {
    handle: "meteoraAG",
    url: "https://x.com/meteoraAG/status/1888888888888888887",
    postedAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    text: "Meteora stables seeing net inflows, liquidity depth improving across pairs.",
  },
  {
    handle: "sol_nxxn",
    url: "https://x.com/sol_nxxn/status/1888888888888888886",
    postedAt: new Date(Date.now() - 9 * 60 * 60 * 1000).toISOString(),
    text: "Validator fee mix is shifting again; restaking incentives need watching.",
  },
  {
    handle: "SolanaSensei",
    url: "https://x.com/SolanaSensei/status/1888888888888888885",
    postedAt: new Date(Date.now() - 14 * 60 * 60 * 1000).toISOString(),
    text: "Jupiter Lend integration could pull real capital back on-chain.",
  },
];
