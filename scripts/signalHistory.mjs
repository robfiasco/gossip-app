#!/usr/bin/env node
/**
 * signalHistory.mjs
 *
 * Tracks daily % moves per signal key (protocol or token) across runs so the
 * on-chain story generators can tell a one-off blip from a multi-day trend.
 * Output: data/signal_history.json
 */

import fs from 'fs';
import path from 'path';

const HISTORY_PATH = path.join(process.cwd(), 'data', 'signal_history.json');
const MAX_ENTRIES = 14;

function load() {
  if (!fs.existsSync(HISTORY_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

function save(data) {
  fs.mkdirSync(path.dirname(HISTORY_PATH), { recursive: true });
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(data, null, 2));
}

// Records today's % change for `key` and returns trend context derived from
// the trailing window (including today). One entry per key per day - reruns
// on the same day overwrite rather than duplicate.
export function recordAndAnalyze(key, changePct) {
  const all = load();
  const today = new Date().toISOString().slice(0, 10);

  const entries = (Array.isArray(all[key]) ? all[key] : []).filter((e) => e?.date !== today);
  entries.push({ date: today, change: changePct });
  entries.sort((a, b) => a.date.localeCompare(b.date));
  const trimmed = entries.slice(-MAX_ENTRIES);

  all[key] = trimmed;
  save(all);

  const direction = changePct >= 0 ? 1 : -1;
  let streakDays = 1;
  for (let i = trimmed.length - 2; i >= 0; i--) {
    const entryDirection = trimmed[i].change >= 0 ? 1 : -1;
    if (entryDirection === direction) streakDays += 1;
    else break;
  }

  const priorMoves = trimmed.slice(0, -1).map((e) => Math.abs(e.change));
  const isLargestInWindow = priorMoves.length > 0 && Math.abs(changePct) > Math.max(...priorMoves);

  const cumulativeChange = trimmed.slice(-streakDays).reduce((sum, e) => sum + e.change, 0);

  return {
    streakDays,
    streakDirection: direction >= 0 ? 'up' : 'down',
    cumulativeChange: Math.round(cumulativeChange * 100) / 100,
    isLargestInWindow,
    windowDays: trimmed.length,
  };
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

// Plain-English summary of the trend, meant to be dropped straight into the
// context block the LLM prompt already reads - no new template plumbing needed.
export function describeTrend(trend) {
  if (!trend) return null;
  const parts = [];

  if (trend.streakDays >= 2) {
    parts.push(
      `This is the ${ordinal(trend.streakDays)} consecutive day moving ${trend.streakDirection}, a cumulative ${trend.cumulativeChange >= 0 ? '+' : ''}${trend.cumulativeChange.toFixed(1)}% over that span.`
    );
  }

  if (trend.isLargestInWindow && trend.windowDays >= 3) {
    parts.push(`This is the largest single-day move recorded in the last ${trend.windowDays} days tracked.`);
  }

  if (parts.length === 0) {
    parts.push(`No unusual streak detected - this move is within the recent range tracked over the last ${trend.windowDays} day(s).`);
  }

  return parts.join(' ');
}
