import crypto from "crypto";
import fs from "fs";
import path from "path";
import { getCachedImage, setCachedImage } from "./imageCache";

const IMAGE_DIR = path.join(process.cwd(), "public", "story-images");
const USER_AGENT =
  "ValidatorBot/1.0 (+https://validator.local; image fetcher)";

const withTimeout = async (input: string, timeoutMs: number) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(input, { signal: controller.signal, headers: { "User-Agent": USER_AGENT } });
    return res;
  } finally {
    clearTimeout(timeout);
  }
};

const extractMeta = (html: string, selector: RegExp) => {
  const match = html.match(selector);
  return match?.[1]?.trim() ?? null;
};

const resolveUrl = (base: string, value: string | null) => {
  if (!value) return null;
  try {
    return new URL(value, base).toString();
  } catch {
    return null;
  }
};

const getImageFromHtml = (html: string, baseUrl: string) => {
  const og = extractMeta(html, /property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
  const twitter = extractMeta(html, /name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i);
  const imageSrc = extractMeta(html, /rel=["']image_src["'][^>]*href=["']([^"']+)["']/i);
  const icon = extractMeta(html, /rel=["']icon["'][^>]*href=["']([^"']+)["']/i);
  if (og) return { url: resolveUrl(baseUrl, og), source: "og" as const };
  if (twitter) return { url: resolveUrl(baseUrl, twitter), source: "twitter" as const };
  if (imageSrc) return { url: resolveUrl(baseUrl, imageSrc), source: "image_src" as const };
  if (icon) return { url: resolveUrl(baseUrl, icon), source: "favicon" as const };
  return { url: null, source: null };
};

const ensureDir = () => {
  if (!fs.existsSync(IMAGE_DIR)) {
    fs.mkdirSync(IMAGE_DIR, { recursive: true });
  }
};

export const getStoryImage = async (storyUrl: string) => {
  const cached = getCachedImage(storyUrl);
  if (cached) return cached;

  try {
    const res = await withTimeout(storyUrl, 6000);
    if (!res.ok) {
      setCachedImage({ storyUrl, imageUrl: null, imageSource: null, cachedAt: new Date().toISOString() });
      return { storyUrl, imageUrl: null, imageSource: null, cachedAt: new Date().toISOString() };
    }
    const html = await res.text();
    const { url: imageUrl, source } = getImageFromHtml(html, storyUrl);
    if (!imageUrl) {
      const entry = { storyUrl, imageUrl: null, imageSource: null, cachedAt: new Date().toISOString() };
      setCachedImage(entry);
      return entry;
    }

    const imageRes = await withTimeout(imageUrl, 8000);
    if (!imageRes.ok) {
      const entry = { storyUrl, imageUrl: null, imageSource: null, cachedAt: new Date().toISOString() };
      setCachedImage(entry);
      return entry;
    }

    const contentType = imageRes.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      const entry = { storyUrl, imageUrl: null, imageSource: null, cachedAt: new Date().toISOString() };
      setCachedImage(entry);
      return entry;
    }
    const buffer = Buffer.from(await imageRes.arrayBuffer());
    if (buffer.length > 5_000_000) {
      const entry = { storyUrl, imageUrl: null, imageSource: null, cachedAt: new Date().toISOString() };
      setCachedImage(entry);
      return entry;
    }
    ensureDir();
    const hash = crypto.createHash("sha1").update(imageUrl).digest("hex").slice(0, 16);
    const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
    const fileName = `${hash}.${ext}`;
    const filePath = path.join(IMAGE_DIR, fileName);
    fs.writeFileSync(filePath, buffer);
    const entry = {
      storyUrl,
      imageUrl: `/story-images/${fileName}`,
      imageSource: source ?? "og",
      cachedAt: new Date().toISOString(),
    };
    setCachedImage(entry);
    return entry;
  } catch {
    const entry = { storyUrl, imageUrl: null, imageSource: null, cachedAt: new Date().toISOString() };
    setCachedImage(entry);
    return entry;
  }
};
