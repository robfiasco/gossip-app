"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { DailyStory } from "../../../src/lib/dailyStories";

const formatRelative = (iso?: string | null) => {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

export default function StoryDetailPage({ params }: { params: { id: string } }) {
  const [story, setStory] = useState<DailyStory | null>(null);

  useEffect(() => {
    let active = true;
    const loadFromLocal = () => {
      try {
        const raw = window.localStorage.getItem("validator_news_cards");
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return null;
        const rank = Number(params.id);
        const match = parsed.find((item) => item.rank === rank) ?? null;
        return match;
      } catch {
        return null;
      }
    };
    const fetchNewsCards = async () => {
      try {
        const res = await fetch("/news_cards.json");
        if (!res.ok) return null;
        const json = await res.json();
        return Array.isArray(json) ? json : null;
      } catch {
        return null;
      }
    };
    const run = async () => {
      const localStory = loadFromLocal();
      if (localStory && active) {
        setStory(localStory);
        return;
      }
      const cards = await fetchNewsCards();
      if (!active) return;
      if (!cards) {
        setStory(null);
        return;
      }
      const rank = Number(params.id);
      const match = cards.find((item) => item.rank === rank) ?? null;
      setStory(match);
    };
    run();
    return () => {
      active = false;
    };
  }, [params.id]);

  if (!story) {
    return (
      <main className="page terminal-surface">
        <section className="intelligence intel-card card--briefing">
          <Link className="story-back" href="/#top-story-feed">
            Back to news
          </Link>
          <div className="story-detail-title">Loading story...</div>
        </section>
      </main>
    );
  }

  return (
    <main className="page terminal-surface">
      <section className="intelligence intel-card card--briefing">
        <Link className="story-back" href="/#top-story-feed">
          Back to news
        </Link>
        <div className="story-detail-meta">
          <span className="story-detail-source">{story.source}</span>
          <span className="story-detail-time">
            {story.publishedAt ? formatRelative(story.publishedAt) : "—"}
          </span>
        </div>
        <h1 className="story-detail-title">{story.title}</h1>
        {story.whyItMatters ? (
          <p className="story-detail-summary">{story.whyItMatters}</p>
        ) : null}
        {story.excerpt ? (
          <p className="story-detail-summary">{story.excerpt}</p>
        ) : (story as any)?.summary ? (
          <p className="story-detail-summary">{(story as any).summary}</p>
        ) : null}
        <div className="story-detail-actions">
          <a className="story-open" href={story.url} target="_blank" rel="noreferrer">
            Read full story →
          </a>
        </div>
      </section>
    </main>
  );
}
