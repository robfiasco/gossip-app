import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
try {
  require("dotenv").config({ path: ".env.local" });
  require("dotenv").config();
} catch (e) {
  // optionally handle missing dotenv
}

const cwd = process.cwd();
const BRIEFING_PATHS = [
  path.join(cwd, "data", "briefing.json"),
  path.join(cwd, "briefing.json"),
];

const loadJson = (filePath, fallback = null) => {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return fallback;
  }
};

const saveJson = (filePath, payload) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf-8");
};

const extractJson = (raw) => {
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(raw.slice(start, end + 1));
    }
    throw new Error("No valid JSON block found in model response");
  }
};

const callOpenAI = async (payload, isRetry = false) => {
  if (!process.env.OPENAI_API_KEY) throw new Error("No OPENAI_API_KEY");

  let systemPrompt = `You rewrite daily crypto intelligence for Solana readers.
Rules:
- Use plain English with punchy, sharp, and concise framing.
- Be specific, concrete, and analytical.
- Explain why the story or data matters for SOL positioning, liquidity, or ecosystem usage.
- No filler and no buzzwords.
- Do not mention that this is AI generated.
- Ensure the tone is professional, insightful, and strictly objective. Let the data lead the narrative.

### HARD RULES (must follow)
- Do NOT give instructions or financial advice. Avoid verbs like: buy, sell, stake, farm, rotate, ape, short, long, avoid, exit, enter.
- Do NOT say "no action required" or any equivalent.
- Do NOT invent causes, numbers, or claims not supported by the input items.
- Do NOT use generic market filler (e.g. "amid uncertainty", "despite fear sentiment") unless the input explicitly supports it.

For "briefingItems":
- Rewrite each "whyYouShouldCare" into exactly 1 sentence (18-28 words max).
- Do not repeat the headline, just provide the contextual analysis.

Return JSON ONLY matching the exact structure:
{
  "briefingItems": [
    { "index": 0, "whyYouShouldCare": "..." }
  ]
}`;

  if (isRetry) {
    systemPrompt = "Your last answer was too generic or contained banned vocabulary. Break templates, use only the provided facts, remove filler, and be more specific.\n\n" + systemPrompt;
  }

  const userPrompt = JSON.stringify(payload);

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.3,
      response_format: { type: "json_object" }
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI HTTP ${res.status}: ${err}`);
  }

  const data = await res.json();
  const content = String(data?.choices?.[0]?.message?.content || "").trim();
  return extractJson(content);
};

const qualityGateFails = (text, items) => {
  const lower = text.toLowerCase();

  const bannedPhrases = [
    "amid uncertainty",
    "prevailing fear sentiment",
    "market participants",
    "macro headwinds",
  ];
  if (bannedPhrases.some(phrase => lower.includes(phrase))) {
    console.log("Quality Gate Failed: Contains banned filler phrase.");
    return true;
  }

  if (lower.includes("risk-on") || lower.includes("risk-off")) {
    const rssText = JSON.stringify(items).toLowerCase();
    if (!rssText.includes("risk-on") && !rssText.includes("risk-off")) {
      console.log("Quality Gate Failed: Hallucinated 'risk-on/risk-off'.");
      return true;
    }
  }

  const instructionVerbs = ["buy ", "sell ", "stake ", "avoid ", "short ", "long ", "ape ", "rotate "];
  if (instructionVerbs.some(verb => lower.includes(` ${verb}`))) {
    console.log("Quality Gate Failed: Contains instruction verbs.");
    return true;
  }

  if (lower.includes("no action required")) {
    console.log("Quality Gate Failed: Contains 'no action required'.");
    return true;
  }

  return false;
};

const main = async () => {
  const briefing = BRIEFING_PATHS.map((p) => loadJson(p)).find(Boolean);

  if (!briefing || !Array.isArray(briefing.items) || briefing.items.length === 0) {
    console.log("No briefing items found; skipping AI enhancement.");
    return;
  }

  const promptItems = (briefing.items).slice(0, 3).map((item, index) => ({
    index,
    title: item.title,
    source: item.source,
    category: item.category || item.type,
    date: item.date,
  }));

  try {
    console.log("Enhancing briefing with OpenAI (gpt-4o-mini)...");
    let rewritten = await callOpenAI({ briefingItems: promptItems });

    if (qualityGateFails(JSON.stringify(rewritten), promptItems)) {
      console.log("Briefing failed quality gate. Retrying once...");
      rewritten = await callOpenAI({ briefingItems: promptItems }, true);
    }

    if (!rewritten || !rewritten.briefingItems) {
      throw new Error("AI did not return a valid JSON object");
    }

    const updates = new Map(
      (rewritten.briefingItems || [])
        .filter((row) => Number.isInteger(row?.index) && typeof row?.whyYouShouldCare === "string")
        .map((row) => [row.index, row.whyYouShouldCare.trim()]),
    );

    const nextBriefing = {
      ...briefing,
      items: briefing.items.map((item, index) => ({
        ...item,
        whyYouShouldCare: updates.get(index) || item.whyYouShouldCare,
      })),
    };

    saveJson(path.join(cwd, "briefing.json"), nextBriefing);
    saveJson(path.join(cwd, "data", "briefing.json"), nextBriefing);
    saveJson(path.join(cwd, "public", "briefing.json"), nextBriefing);
    console.log(`Briefing enhanced: ${updates.size}/${briefing.items.length} items updated.`);

  } catch (error) {
    console.error("AI enhancement failed:", error);
  }
};

main();
