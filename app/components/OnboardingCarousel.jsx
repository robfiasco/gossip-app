"use client";
import { useState, useEffect } from "react";

const STORAGE_KEY = "gossip_onboarded";

const SLIDES = [
    {
        icon: "◈",
        iconColor: "#14f195",
        overline: "WELCOME",
        title: "Gossip Intelligence",
        body: "The Solana intelligence terminal. Real-time market signals, AI-curated daily briefings, and exclusive deep-dives — all built for the on-chain edge.",
        hint: null,
    },
    {
        icon: "⬡",
        iconColor: "#7c3aed",
        overline: "PANEL 1 — SIGNAL BOARD",
        title: "Market Pulse",
        body: "Track Solana live. SOL price, 7-day delta, market cap, Fear & Greed index, BTC dominance, and the week's dominant CT narratives ranked by engagement.",
        hint: "Swipe left to reach it",
    },
    {
        icon: "◉",
        iconColor: "#f59e0b",
        overline: "PANEL 2 — BRIEFING",
        title: "Daily Intelligence",
        body: "AI-curated briefs from Crypto Twitter. Every morning the pipeline filters thousands of tweets, clusters narratives, and drafts readable intel reports.",
        hint: "Refreshes daily at 7am UTC",
    },
    {
        icon: "◆",
        iconColor: "#14f195",
        overline: "PANEL 3 — SEEKER STORIES",
        title: "Exclusive Access",
        body: "Deep-dive analysis for Solana Seeker Genesis holders. Connect your wallet to verify your token and unlock today's full intelligence reports.",
        hint: "Requires Seeker Genesis Token",
    },
];

export default function OnboardingCarousel() {
    const [visible, setVisible] = useState(false);
    const [slide, setSlide] = useState(0);
    const [exiting, setExiting] = useState(false);

    useEffect(() => {
        try {
            const seen = window.localStorage.getItem(STORAGE_KEY);
            if (!seen) setVisible(true);
        } catch { /* ignore */ }
    }, []);

    const dismiss = (permanent = true) => {
        setExiting(true);
        setTimeout(() => {
            setVisible(false);
            setExiting(false);
        }, 280);
        if (permanent) {
            try { window.localStorage.setItem(STORAGE_KEY, "1"); } catch { /* ignore */ }
        }
    };

    const next = () => {
        if (slide < SLIDES.length - 1) setSlide(slide + 1);
        else dismiss(true);
    };

    const prev = () => { if (slide > 0) setSlide(slide - 1); };

    if (!visible) return null;

    const s = SLIDES[slide];
    const isLast = slide === SLIDES.length - 1;

    return (
        /* ── Backdrop ─────────────────────────────────────────────── */
        <div
            onClick={() => dismiss(false)}
            style={{
                position: "fixed", inset: 0, zIndex: 9999,
                background: "rgba(5, 7, 14, 0.88)",
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
                display: "flex", alignItems: "center", justifyContent: "center",
                padding: "24px",
                opacity: exiting ? 0 : 1,
                transition: "opacity 0.28s ease",
            }}
        >
            {/* ── Card ─────────────────────────────────────────────── */}
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    width: "100%", maxWidth: "360px",
                    background: "rgba(12, 16, 26, 0.97)",
                    border: "1px solid rgba(72, 84, 112, 0.4)",
                    borderRadius: "22px",
                    padding: "36px 28px 28px",
                    boxShadow: "0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(20,241,149,0.06)",
                    transform: exiting ? "scale(0.96) translateY(8px)" : "scale(1) translateY(0)",
                    transition: "transform 0.28s ease",
                }}
            >
                {/* Icon */}
                <div style={{ fontSize: "2.6rem", color: s.iconColor, marginBottom: "20px", lineHeight: 1, transition: "color 0.25s" }}>
                    {s.icon}
                </div>

                {/* Overline */}
                <p style={{
                    fontSize: "0.6rem", fontFamily: "JetBrains Mono, monospace",
                    letterSpacing: "0.14em", color: "rgba(140,155,190,0.7)",
                    textTransform: "uppercase", marginBottom: "8px",
                }}>{s.overline}</p>

                {/* Title */}
                <h2 style={{
                    fontSize: "1.45rem", fontWeight: 800, color: "#f0f4ff",
                    lineHeight: 1.2, marginBottom: "14px",
                    letterSpacing: "-0.01em",
                }}>{s.title}</h2>

                {/* Body */}
                <p style={{
                    fontSize: "0.92rem", color: "rgba(175,188,220,0.8)",
                    lineHeight: 1.65, marginBottom: s.hint ? "10px" : "32px",
                }}>{s.body}</p>

                {/* Hint pill */}
                {s.hint && (
                    <div style={{
                        display: "inline-flex", alignItems: "center", gap: "6px",
                        background: "rgba(20,241,149,0.08)", border: "1px solid rgba(20,241,149,0.22)",
                        borderRadius: "999px", padding: "4px 12px", marginBottom: "28px",
                    }}>
                        <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#14f195", flexShrink: 0 }} />
                        <span style={{ fontSize: "0.68rem", fontFamily: "JetBrains Mono, monospace", color: "#14f195", letterSpacing: "0.06em" }}>
                            {s.hint}
                        </span>
                    </div>
                )}

                {/* Dot indicators */}
                <div style={{ display: "flex", gap: "6px", alignItems: "center", marginBottom: "24px" }}>
                    {SLIDES.map((_, i) => (
                        <button
                            key={i}
                            onClick={() => setSlide(i)}
                            style={{
                                width: i === slide ? "20px" : "6px",
                                height: "6px",
                                borderRadius: "999px",
                                background: i === slide ? "#14f195" : "rgba(100,120,160,0.3)",
                                border: "none", cursor: "pointer", padding: 0,
                                transition: "width 0.25s ease, background 0.25s ease",
                            }}
                        />
                    ))}
                </div>

                {/* Buttons */}
                <div style={{ display: "flex", gap: "10px" }}>
                    {slide > 0 && (
                        <button
                            onClick={prev}
                            style={{
                                flex: 1, padding: "12px", borderRadius: "12px",
                                background: "rgba(255,255,255,0.05)", border: "1px solid rgba(72,84,112,0.35)",
                                color: "rgba(175,188,220,0.8)", fontSize: "0.9rem", fontWeight: 600,
                                cursor: "pointer",
                            }}
                        >← Back</button>
                    )}
                    <button
                        onClick={next}
                        style={{
                            flex: 2, padding: "12px", borderRadius: "12px",
                            background: isLast ? "#14f195" : "rgba(20,241,149,0.12)",
                            border: `1px solid ${isLast ? "#14f195" : "rgba(20,241,149,0.32)"}`,
                            color: isLast ? "#000" : "#14f195",
                            fontSize: "0.9rem", fontWeight: 700,
                            cursor: "pointer", transition: "all 0.2s",
                        }}
                    >
                        {isLast ? "Get Started" : "Next →"}
                    </button>
                </div>

                {/* Skip / Don't show again */}
                <button
                    onClick={() => dismiss(true)}
                    style={{
                        display: "block", width: "100%", marginTop: "14px",
                        background: "none", border: "none", cursor: "pointer",
                        fontSize: "0.72rem", color: "rgba(120,135,170,0.6)",
                        fontFamily: "JetBrains Mono, monospace", letterSpacing: "0.08em",
                        textAlign: "center", padding: "4px",
                    }}
                >
                    DON'T SHOW AGAIN
                </button>
            </div>
        </div>
    );
}
