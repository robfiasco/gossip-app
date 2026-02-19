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
const MODEL = process.env.OLLAMA_MODEL || "llama3";
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

const callOpenAI = async (payload) => {
  if (!process.env.OPENAI_API_KEY) throw new Error("No OPENAI_API_KEY");

  const systemPrompt = `You rewrite briefing narratives for Solana readers.
Rules:
- Use plain English.
- 1 sentence only per item.
- 18-28 words per sentence.
- Be specific and concrete.
- Explain why the story matters for SOL positioning, liquidity, or ecosystem usage.
- No filler and no buzzwords.
- Do not repeat the headline.
- Do not mention that this is AI generated.

Return JSON ONLY:
{
  "items": [
    { "index": 0, "whyYouShouldCare": "..." }
  ]
}`;

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
      temperature: 0.2,
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

const callOllama = async (payload) => {
  const prompt = `
You rewrite briefing narratives for Solana readers.

Rules:
- Use plain English.
- 1 sentence only per item.
- 18-28 words per sentence.
- Be specific and concrete.
- Explain why the story matters for SOL positioning, liquidity, or ecosystem usage.
- No filler and no buzzwords.
- Do not repeat the headline.
- Do not mention that this is AI generated.

Return JSON ONLY:
{
  "items": [
    { "index": 0, "whyYouShouldCare": "..." }
  ]
}

INPUT:
${JSON.stringify(payload)}
`;

  const res = await fetch("http://localhost:11434/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      stream: false,
      prompt,
      options: {
        temperature: 0.2,
      },
      format: "json",
    }),
  });

  if (!res.ok) {
    throw new Error(`Ollama HTTP ${res.status}`);
  }

  const data = await res.json();
  const content = String(data?.response || "").trim();
  if (!content) {
    throw new Error("Empty Ollama response");
  }
  return extractJson(content);
};

const main = async () => {
  const briefing = BRIEFING_PATHS.map((p) => loadJson(p)).find(Boolean);
  if (!briefing || !Array.isArray(briefing.items) || briefing.items.length === 0) {
    console.log("No briefing items found; skipping AI enhancement.");
    return;
  }

  const promptItems = briefing.items.slice(0, 3).map((item, index) => ({
    index,
    title: item.title,
    source: item.source,
    category: item.category || item.type,
    date: item.date,
  }));

  try {
    let rewritten;
    if (process.env.OPENAI_API_KEY) {
      console.log("Enhancing briefing with OpenAI (gpt-4o-mini)...");
      rewritten = await callOpenAI({ items: promptItems });
    } else {
      console.log(`Enhancing briefing with local Ollama model: ${MODEL}`);
      rewritten = await callOllama({ items: promptItems });
    }

    const updates = new Map(
      (rewritten?.items || [])
        .filter((row) => Number.isInteger(row?.index) && typeof row?.whyYouShouldCare === "string")
        .map((row) => [row.index, row.whyYouShouldCare.trim()]),
    );

    const next = {
      ...briefing,
      items: briefing.items.map((item, index) => ({
        ...item,
        whyYouShouldCare: updates.get(index) || item.whyYouShouldCare,
      })),
    };

    saveJson(path.join(cwd, "briefing.json"), next);
    saveJson(path.join(cwd, "data", "briefing.json"), next);
    saveJson(path.join(cwd, "public", "briefing.json"), next);
    console.log(`Briefing enhanced: ${updates.size}/${briefing.items.length} items updated.`);
  } catch (err) {
    console.log(`Briefing enhancement skipped: ${err?.message || err}`);
  }
};

main();
