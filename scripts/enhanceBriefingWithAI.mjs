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

  const systemPrompt = `You rewrite daily crypto intelligence for Solana readers.
Rules:
- Use plain English with punchy, sharp, and concise framing.
- Be specific, concrete, and analytical.
- Explain why the story or data matters for SOL positioning, liquidity, or ecosystem usage.
- No filler and no buzzwords.
- Do not mention that this is AI generated.
- Ensure the tone is professional, insightful, and strictly objective. Let the data lead the narrative.

For "briefingItems":
- Rewrite each "whyYouShouldCare" into exactly 1 sentence (18-28 words max).
- Do not repeat the headline, just provide the contextual analysis.

For "signalBoard":
- You will receive draft template text for \`priceUpdate\` (Market Context), \`pastWeek\`, \`thisWeek\`, and \`nextWeek\`.
- Rewrite each of these fields to feel fluid, native, and analytically sharp.
- CRITICAL RULE: NEVER repeat the exact same protocol name, token, or headline across multiple fields. 
- If you use a specific name (e.g. "tokenized xStocks" or "Jupiter") in \`priceUpdate\`, you MUST abstract it into broader market concepts (e.g. "RWA liquidity", "DEX volumes", "institutional flow", "ecosystem momentum") in \`thisWeek\` and \`nextWeek\` to force vocabulary diversity.
- Keep the hard data points (prices, volumes) but seamlessly rewrite the sentences so they do not sound like a rigid template.
- Do NOT make up new numbers or events. Only rewrite the provided facts.
- **IMPORTANT**: If a field is empty (e.g. \`pastWeek\` is ""), leave it empty in the output.

Return JSON ONLY matching the exact structure:
{
  "briefingItems": [
    { "index": 0, "whyYouShouldCare": "..." }
  ],
  "signalBoard": {
    "priceUpdate": "...",
    "pastWeek": "...",
    "thisWeek": "...",
    "nextWeek": "..."
  }
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

const callOllama = async (payload) => {
  const prompt = `
You rewrite daily crypto intelligence for Solana readers.

Rules:
- Use plain English.
- Be specific, concrete, and analytical.
- Explain why the story or data matters for SOL positioning, liquidity, or ecosystem usage.
- No filler and no buzzwords.
- Do not mention that this is AI generated.

For "briefingItems":
- Rewrite each "whyYouShouldCare" into exactly 1 sentence (18-28 words max).
- Do not repeat the headline, just provide the contextual analysis.

For "signalBoard":
- You will receive draft template text for \`priceUpdate\` (Market Context), \`pastWeek\`, \`thisWeek\`, and \`nextWeek\`.
- Rewrite each of these fields to feel fluid, native, and analytically sharp.
- Keep the exact same data points (prices, themes, headlines) but seamlessly rewrite the sentences so they do not sound like a rigid template.
- Do NOT make up new numbers or events. Only rewrite the provided facts. If a field is empty, leave it empty.

Return JSON ONLY matching the exact structure:
{
  "briefingItems": [
    { "index": 0, "whyYouShouldCare": "..." }
  ],
  "signalBoard": {
    "priceUpdate": "...",
    "pastWeek": "...",
    "thisWeek": "...",
    "nextWeek": "..."
  }
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
        temperature: 0.3,
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

const SIGNAL_PATHS = [
  path.join(cwd, "data", "signal_board.json"),
  path.join(cwd, "signal_board.json"),
];

const main = async () => {
  const briefing = BRIEFING_PATHS.map((p) => loadJson(p)).find(Boolean);
  const signalBoard = SIGNAL_PATHS.map((p) => loadJson(p)).find(Boolean);

  if ((!briefing || !Array.isArray(briefing.items) || briefing.items.length === 0) && !signalBoard) {
    console.log("No briefing items or signal board found; skipping AI enhancement.");
    return;
  }

  const promptItems = (briefing?.items || []).slice(0, 3).map((item, index) => ({
    index,
    title: item.title,
    source: item.source,
    category: item.category || item.type,
    date: item.date,
  }));

  const payload = {
    briefingItems: promptItems,
    signalBoard: signalBoard ? {
      priceUpdate: signalBoard.priceUpdate,
      pastWeek: signalBoard.pastWeek,
      thisWeek: signalBoard.thisWeek,
      nextWeek: signalBoard.nextWeek,
    } : null,
  };

  try {
    let rewritten;
    if (process.env.OPENAI_API_KEY) {
      console.log("Enhancing briefing & signal board with OpenAI (gpt-4o-mini)...");
      rewritten = await callOpenAI(payload);
    } else {
      console.log(`Enhancing briefing & signal board with local Ollama model: ${MODEL}`);
      rewritten = await callOllama(payload);
    }

    if (briefing && Array.isArray(briefing.items)) {
      const updates = new Map(
        (rewritten?.briefingItems || [])
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
    }

    if (signalBoard && rewritten?.signalBoard) {
      const nextSignalBoard = {
        ...signalBoard,
        priceUpdate: rewritten.signalBoard.priceUpdate || signalBoard.priceUpdate,
        pastWeek: rewritten.signalBoard.pastWeek || signalBoard.pastWeek,
        thisWeek: rewritten.signalBoard.thisWeek || signalBoard.thisWeek,
        nextWeek: rewritten.signalBoard.nextWeek || signalBoard.nextWeek,
      };

      saveJson(path.join(cwd, "signal_board.json"), nextSignalBoard);
      saveJson(path.join(cwd, "data", "signal_board.json"), nextSignalBoard);
      saveJson(path.join(cwd, "public", "signal_board.json"), nextSignalBoard);
      console.log("Signal Board natively rewritten by AI.");
    }

  } catch (err) {
    console.log(`Enhancement skipped: ${err?.message || err}`);
  }
};

main();
