import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const cwd = process.cwd();
const MEMORY_24H_PATH = path.join(cwd, "data", "stories_shown_last_24h.json");
const MEMORY_48H_PATH = path.join(cwd, "data", "stories_shown_last_48h.json");

const readArray = (filePath) => {
  if (!fs.existsSync(filePath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeArray = (filePath, value) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf-8");
};

const normalizeText = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const canonicalizeUrl = (rawUrl) => {
  if (!rawUrl) return "";
  try {
    const url = new URL(rawUrl);
    url.hash = "";
    const keys = [...url.searchParams.keys()];
    for (const key of keys) {
      if (key.startsWith("utm_") || key === "ref" || key === "source" || key === "s") {
        url.searchParams.delete(key);
      }
    }
    const search = url.searchParams.toString();
    const normalized = `${url.origin}${url.pathname}`.replace(/\/+$/, "");
    return `${normalized}${search ? `?${search}` : ""}`.toLowerCase();
  } catch {
    return String(rawUrl || "").split("#")[0].replace(/\/+$/, "").toLowerCase();
  }
};

const sha1 = (value) => crypto.createHash("sha1").update(value).digest("hex");

export const extractEntities = (value) => {
  const tokens = normalizeText(value)
    .split(/\s+/)
    .filter((token) => token.length >= 4);
  const keep = [];
  const seen = new Set();
  for (const token of tokens) {
    if (seen.has(token)) continue;
    seen.add(token);
    keep.push(token);
    if (keep.length >= 8) break;
  }
  return keep;
};

export const createStoryFingerprint = ({
  url,
  title,
  source,
  entities = [],
  dateBucket,
}) => {
  const canonicalUrl = canonicalizeUrl(url);
  if (canonicalUrl) return sha1(`url:${canonicalUrl}`);
  const normalizedTitle = normalizeText(title);
  const normalizedSource = normalizeText(source);
  const bucket = dateBucket || new Date().toISOString().slice(0, 10);
  const entityPart = entities.map((item) => normalizeText(item)).join("|");
  return sha1(`title:${normalizedTitle}|source:${normalizedSource}|entities:${entityPart}|bucket:${bucket}`);
};

const toMs = (iso) => {
  const ts = Date.parse(String(iso || ""));
  return Number.isNaN(ts) ? 0 : ts;
};

const pruneByHours = (entries, hours, nowMs) =>
  entries.filter((entry) => {
    const ts = toMs(entry?.lastSeenAt || entry?.firstSeenAt);
    return ts > 0 && nowMs - ts <= hours * 60 * 60 * 1000;
  });

const tokenOverlapRatio = (a, b) => {
  if (!a.size || !b.size) return 0;
  let overlap = 0;
  for (const token of a) {
    if (b.has(token)) overlap += 1;
  }
  return overlap / Math.min(a.size, b.size);
};

export const loadMemory = () => ({
  last24h: readArray(MEMORY_24H_PATH),
  last48h: readArray(MEMORY_48H_PATH),
});

export const hydrateMemory = () => {
  const nowMs = Date.now();
  const loaded = loadMemory();
  const pruned24 = pruneByHours(loaded.last24h, 24, nowMs);
  const pruned48 = pruneByHours(loaded.last48h, 48, nowMs);
  writeArray(MEMORY_24H_PATH, pruned24);
  writeArray(MEMORY_48H_PATH, pruned48);
  return { last24h: pruned24, last48h: pruned48 };
};

export const canUseStory = (candidate, memoryState, runSet) => {
  const allRecent = [...memoryState.last24h, ...memoryState.last48h];
  const canonicalUrl = canonicalizeUrl(candidate.url);
  const entities = candidate.topicTags || extractEntities(`${candidate.title || ""} ${candidate.summary || ""}`);
  const fingerprint = candidate.id || createStoryFingerprint({
    url: candidate.url,
    title: candidate.title,
    source: candidate.source,
    entities,
    dateBucket: candidate.dateBucket,
  });

  if (runSet?.has(fingerprint)) {
    return { allowed: false, reason: "Already selected in this run", fingerprint };
  }

  const normalizedTitleTokens = new Set(
    normalizeText(candidate.title || "")
      .split(/\s+/)
      .filter((token) => token.length >= 4),
  );

  for (const item of allRecent) {
    if (!item) continue;
    if (item.id === fingerprint) {
      if (candidate.majorUpdate === true) {
        return { allowed: true, reason: "Major update override", fingerprint };
      }
      return { allowed: false, reason: "Seen in memory window", fingerprint };
    }
    if (canonicalUrl && canonicalizeUrl(item.url) === canonicalUrl) {
      if (candidate.majorUpdate === true) {
        return { allowed: true, reason: "Major update override", fingerprint };
      }
      return { allowed: false, reason: "Canonical URL already shown", fingerprint };
    }
    const existingTokens = new Set(
      normalizeText(item.title || "")
        .split(/\s+/)
        .filter((token) => token.length >= 4),
    );
    const ratio = tokenOverlapRatio(normalizedTitleTokens, existingTokens);
    if (ratio >= 0.7) {
      return { allowed: false, reason: "Near-duplicate title in memory", fingerprint };
    }
  }

  return { allowed: true, reason: "Fresh", fingerprint };
};

export const buildMemoryEntry = (candidate, fingerprint, sectionShown) => {
  const nowIso = new Date().toISOString();
  const topicTags = candidate.topicTags || extractEntities(`${candidate.title || ""} ${candidate.summary || ""}`);
  return {
    id: fingerprint,
    title: candidate.title || "",
    url: canonicalizeUrl(candidate.url || ""),
    source: candidate.source || "",
    firstSeenAt: candidate.firstSeenAt || nowIso,
    lastSeenAt: nowIso,
    sectionShown,
    topicTags: topicTags.slice(0, 8),
    majorUpdate: Boolean(candidate.majorUpdate),
    updateReason: candidate.updateReason || null,
  };
};

const mergeEntry = (existing, incoming) => ({
  ...existing,
  ...incoming,
  firstSeenAt: existing.firstSeenAt || incoming.firstSeenAt,
  lastSeenAt: incoming.lastSeenAt,
});

export const writeMemory = (memoryState, newEntries) => {
  const byId = new Map();
  for (const entry of [...memoryState.last48h, ...memoryState.last24h]) {
    if (entry?.id) byId.set(entry.id, entry);
  }
  for (const entry of newEntries) {
    if (!entry?.id) continue;
    if (byId.has(entry.id)) {
      byId.set(entry.id, mergeEntry(byId.get(entry.id), entry));
    } else {
      byId.set(entry.id, entry);
    }
  }

  const nowMs = Date.now();
  const merged = [...byId.values()].sort((a, b) => toMs(b.lastSeenAt) - toMs(a.lastSeenAt));
  const for24 = pruneByHours(merged, 24, nowMs);
  const for48 = pruneByHours(merged, 48, nowMs);
  writeArray(MEMORY_24H_PATH, for24);
  writeArray(MEMORY_48H_PATH, for48);
  return { last24h: for24, last48h: for48 };
};

export const createRunSet = () => new Set();

// Backward-compatible helper exports used by older scripts.
export const isStoryShown = (storyUrl) => {
  const canonical = canonicalizeUrl(storyUrl);
  if (!canonical) return false;
  const { last24h, last48h } = hydrateMemory();
  return [...last24h, ...last48h].some((entry) => canonicalizeUrl(entry?.url) === canonical);
};

export const isStoryDuplicate = (candidate) => {
  const memoryState = hydrateMemory();
  const result = canUseStory(candidate, memoryState, createRunSet(memoryState));
  return result.allowed
    ? { isDuplicate: false }
    : { isDuplicate: true, reason: result.reason };
};

export const commitStoriesToMemory = (stories) => {
  const memoryState = hydrateMemory();
  const entries = stories.map((story) => {
    const fingerprint = createStoryFingerprint({
      url: story.url,
      title: story.title || story.titleDraft,
      source: story.source || story.category || "unknown",
      entities: story.topicTags || extractEntities(story.title || story.titleDraft || ""),
      dateBucket: new Date().toISOString().slice(0, 10),
    });
    return buildMemoryEntry(story, fingerprint, story.sectionShown || "seeker");
  });
  const next = writeMemory(memoryState, entries);
  console.log(`[Memory] Updated memory: 24h=${next.last24h.length}, 48h=${next.last48h.length}`);
};

export const MEMORY_PATHS = {
  MEMORY_24H_PATH,
  MEMORY_48H_PATH,
};
