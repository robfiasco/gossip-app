/**
 * Ingest Sources Script
 * 
 * Fetches, parses, and normalizes news from configured RSS/Atom feeds
 * and HTML sources. Runs as a scheduled task to populate the raw data pool
 * used by the AI summarization pipeline.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import * as cheerio from "cheerio";
import { XMLParser } from "fast-xml-parser";

type SourceDef = {
  name: string;
  type: "rss" | "atom" | "html";
  url: string;
  domain: string;
  weight?: number;
  topics?: string[];
};

type NormalizedItem = {
  source: string;
  publisher: string;
  title: string;
  url: string;
  publishedAt: string | null;
  summary: string | null;
  tags?: string[];
  raw?: Record<string, unknown>;
};

const SOURCES_PATH = new URL("../data/news_sources.json", import.meta.url);
const OUTPUT_PATH = new URL("../data/source_pool_", import.meta.url);
const parser = new XMLParser({ ignoreAttributes: false });

const toAbsolute = (url: string, base: string) => {
  if (!url) return null;
  if (url.startsWith("http")) return url;
  if (url.startsWith("//")) return `https:${url}`;
  if (url.startsWith("/")) return `${base}${url}`;
  return url;
};

const cleanText = (text?: string) =>
  (text ?? "").replace(/\s+/g, " ").trim() || null;

const withinHours = (publishedAt: string | null, hours = 72) => {
  if (!publishedAt) return false;
  const date = new Date(publishedAt);
  if (Number.isNaN(date.getTime())) return false;
  return Date.now() - date.getTime() <= hours * 60 * 60 * 1000;
};

const normalizeRssItems = (xml: string, source: SourceDef): NormalizedItem[] => {
  const json = parser.parse(xml);
  const items = json?.rss?.channel?.item ?? json?.feed?.entry ?? [];
  const list = Array.isArray(items) ? items : [items];
  return list.map((item: any) => {
    const title = cleanText(item.title?.["#text"] ?? item.title) ?? "";
    const url =
      toAbsolute(item.link?.["@_href"] ?? item.link, `https://${source.domain}`) ??
      toAbsolute(item.guid?.["#text"] ?? item.guid, `https://${source.domain}`);
    const summary = cleanText(item.description ?? item.summary);
    const publishedAt =
      item.pubDate ?? item.published ?? item.updated ?? null;
    return {
      source: source.name,
      publisher: source.name,
      title,
      url: url || "",
      publishedAt,
      summary,
      tags: source.topics,
      raw: {},
    };
  });
};

const normalizeHtmlItems = (html: string, source: SourceDef): NormalizedItem[] => {
  const $ = cheerio.load(html);
  const items: NormalizedItem[] = [];
  $("article").each((_, el) => {
    const link = $(el).find("a[href]").first();
    const url = toAbsolute(link.attr("href") ?? "", `https://${source.domain}`);
    const title =
      cleanText(link.find("h3, h2").first().text()) ??
      cleanText($(el).find("h3, h2").first().text()) ??
      "";
    const summary = cleanText($(el).find("p").first().text());
    if (!title || !url) return;
    items.push({
      source: source.name,
      publisher: source.name,
      title,
      url,
      publishedAt: null,
      summary,
      tags: source.topics,
      raw: {},
    });
  });
  return items;
};

const fetchSource = async (source: SourceDef) => {
  const res = await fetch(source.url, {
    headers: { "user-agent": "ValidatorBot/1.0 (+https://validator.local)" },
  });
  if (!res.ok) throw new Error(`Fetch failed for ${source.name}`);
  const content = await res.text();
  if (source.type === "html") return normalizeHtmlItems(content, source);
  return normalizeRssItems(content, source);
};

const main = async () => {
  const raw = await readFile(SOURCES_PATH, "utf-8");
  const sources: SourceDef[] = JSON.parse(raw);

  const allItems: NormalizedItem[] = [];
  for (const source of sources) {
    try {
      const items = await fetchSource(source);
      allItems.push(...items);
    } catch (err) {
      console.error(`Failed source ${source.name}:`, err);
    }
  }

  const seen = new Set<string>();
  const filtered = allItems.filter((item) => {
    if (!item.url || !item.title) return false;
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    if (item.publishedAt && !withinHours(item.publishedAt, 72)) return false;
    return true;
  });

  const date = new Date().toISOString().slice(0, 10);
  const output = new URL(`../data/source_pool_${date}.json`, import.meta.url);
  await mkdir(dirname(output.pathname), { recursive: true });
  await writeFile(output, JSON.stringify(filtered, null, 2), "utf-8");
  console.log(`Saved ${filtered.length} items to ${output.pathname}`);
};

main();
