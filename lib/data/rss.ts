type RssItem = {
  title: string;
  link: string;
  pubDate: string;
  description: string;
};

const stripCdata = (value: string) =>
  value.replace("<![CDATA[", "").replace("]]>", "").trim();

const decodeHtml = (value: string) =>
  value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

const stripTags = (value: string) => value.replace(/<[^>]*>/g, "").trim();

const readTag = (block: string, tag: string) => {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  if (!match) return "";
  return stripCdata(match[1]);
};

export const parseRss = (xml: string): RssItem[] => {
  const items: RssItem[] = [];
  const blocks = xml.split(/<item>|<entry>/i).slice(1);
  for (const block of blocks) {
    const rawTitle = readTag(block, "title");
    const rawLink =
      readTag(block, "link") ||
      (block.match(/<link[^>]*href=["']([^"']+)["']/i)?.[1] ?? "");
    const rawDate = readTag(block, "pubDate") || readTag(block, "updated");
    const rawDesc =
      readTag(block, "description") || readTag(block, "summary") || "";
    if (!rawTitle || !rawLink) continue;
    items.push({
      title: decodeHtml(stripTags(rawTitle)),
      link: rawLink.trim(),
      pubDate: rawDate.trim(),
      description: decodeHtml(stripTags(rawDesc)),
    });
  }
  return items;
};

export const fetchRss = async (url: string): Promise<RssItem[]> => {
  try {
    // Helius feed is large (>4MB), skip cache to avoid "over 2MB" error
    const isLarge = url.includes("helius");
    const options: RequestInit = isLarge
      ? { cache: "no-store" }
      : { next: { revalidate: 300 } };

    if (isLarge) {
      console.log(`[RSS] Fetching large feed (no-store): ${url}`);
    }

    const res = await fetch(url, options);
    if (!res.ok) {
      console.error(`RSS fetch failed: ${url} (${res.status})`);
      return [];
    }
    const xml = await res.text();
    return parseRss(xml);
  } catch (err) {
    console.error(`RSS fetch error for ${url}:`, err);
    return [];
  }
};
