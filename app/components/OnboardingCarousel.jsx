"use client";
import { useState, useEffect, useCallback, useRef } from "react";

const STORAGE_KEY = "gossip_onboarded";

const SLIDES = [
    {
        img: "/cat-welcome.jpg",
        accent: "#14f195",
        dialogue: "I’m Gossip Cat — your full-time crypto detective. I read news, track wallets, and watch the internet melt down 24/7. You keep your sanity. I keep the tabs open.",
    },
    {
        img: "/cat-market.jpg",
        accent: "#60a5fa",
        dialogue: "Weird airdrop? Suspicious link? “Trust me bro” token launch? Relax. I investigate before you ape.",
    },
    {
        img: "/cat-briefing.jpg",
        accent: "#f59e0b",
        dialogue: "No account. No newsletter. No “smash that follow” energy. Every morning, I’ve already done the reading. You get the signal. Not the noise.",
    },
    {
        img: "/cat-seeker.jpg",
        accent: "#c084fc",
        dialogue: "Deep insights. Hidden flows. Seeker holders only. Not on a Seeker? That’s a hardware issue.",
    },
];

export default function OnboardingCarousel() {
    const [visible, setVisible] = useState(false);
    const [slide, setSlide] = useState(0);
    const [imgFade, setImgFade] = useState(true);
    const [textFade, setTextFade] = useState(true);
    const [exiting, setExiting] = useState(false);

    useEffect(() => {
        try {
            if (!window.localStorage.getItem(STORAGE_KEY)) setVisible(true);
        } catch { /* ignore */ }
    }, []);

    const goTo = useCallback((idx) => {
        setImgFade(false);
        setTextFade(false);
        setTimeout(() => {
            setSlide(idx);
            setImgFade(true);
            setTimeout(() => setTextFade(true), 100);
        }, 180);
    }, []);

    const dismiss = useCallback((permanent = true) => {
        setExiting(true);
        setTimeout(() => setVisible(false), 320);
        if (permanent) {
            try { window.localStorage.setItem(STORAGE_KEY, "1"); } catch { /* ignore */ }
        }
    }, []);

    const next = useCallback(() => {
        if (slide < SLIDES.length - 1) goTo(slide + 1);
        else dismiss(true);
    }, [slide, goTo, dismiss]);

    const touchStartX = useRef(null);

    const handleTouchStart = (e) => {
        touchStartX.current = e.touches[0].clientX;
    };

    const handleTouchEnd = (e) => {
        if (touchStartX.current === null) return;
        const delta = e.changedTouches[0].clientX - touchStartX.current;
        touchStartX.current = null;
        if (Math.abs(delta) < 50) return; // ignore micro-swipes
        if (delta < 0) next(); // swipe left → next
        else if (slide > 0) goTo(slide - 1); // swipe right → prev
    };

    if (!visible) return null;

    const s = SLIDES[slide];
    const isLast = slide === SLIDES.length - 1;

    return (
        /* Backdrop */
        <div
            onClick={() => dismiss(false)}
            style={{
                position: "fixed", inset: 0, zIndex: 9999,
                background: "rgba(2, 4, 10, 0.72)",
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "16px",
                opacity: exiting ? 0 : 1,
                transition: "opacity 0.32s ease",
            }}
        >
            {/* Phone-width card */}
            <div
                onClick={(e) => e.stopPropagation()}
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
                style={{
                    width: "100%",
                    maxWidth: "400px",
                    height: "min(820px, 92vh)",
                    borderRadius: "24px",
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                    background: "#080b14",
                    boxShadow: "0 32px 80px rgba(0,0,0,0.75)",
                    border: "1px solid rgba(255,255,255,0.07)",
                }}
            >
                {/* ── Full-bleed scene image ─── */}
                <div style={{ flex: 1, position: "relative", minHeight: 0, overflow: "hidden" }}>
                    <img
                        key={s.img}
                        src={s.img}
                        alt="Gossip Cat"
                        style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                            objectPosition: "center top",
                            opacity: imgFade ? 1 : 0,
                            transform: imgFade ? "scale(1)" : "scale(1.03)",
                            transition: "opacity 0.22s ease, transform 0.3s ease",
                            display: "block",
                        }}
                    />

                    {/* Skip */}
                    <button
                        onClick={() => dismiss(true)}
                        style={{
                            position: "absolute", top: 14, right: 14,
                            background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.15)",
                            borderRadius: "999px", padding: "5px 14px",
                            fontSize: "0.62rem", fontFamily: "JetBrains Mono, monospace",
                            color: "rgba(220,225,255,0.6)", letterSpacing: "0.1em",
                            cursor: "pointer", textTransform: "uppercase",
                            backdropFilter: "blur(8px)",
                        }}
                    >Skip</button>

                    {/* Gradient fade into dialogue box */}
                    <div style={{
                        position: "absolute", bottom: 0, left: 0, right: 0,
                        height: "80px",
                        background: "linear-gradient(to bottom, transparent, #080b14)",
                        pointerEvents: "none",
                    }} />
                </div>

                {/* ── Dialogue box ─── */}
                <div style={{
                    flexShrink: 0,
                    padding: "16px 20px 22px",
                    background: "#080b14",
                    borderTop: `1px solid ${s.accent}28`,
                    transition: "border-color 0.4s ease",
                }}>
                    {/* Speaker label */}
                    <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "8px" }}>
                        <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: s.accent, flexShrink: 0 }} />
                        <span style={{
                            fontSize: "0.58rem", fontFamily: "JetBrains Mono, monospace",
                            color: s.accent, letterSpacing: "0.15em", fontWeight: 700,
                            textTransform: "uppercase", transition: "color 0.4s ease",
                        }}>Gossip Cat</span>
                    </div>

                    {/* Dialogue */}
                    <p style={{
                        fontSize: "0.95rem", lineHeight: 1.65,
                        color: "rgba(225,232,255,0.88)",
                        marginBottom: "16px",
                        minHeight: "4.7rem",
                        opacity: textFade ? 1 : 0,
                        transform: textFade ? "translateY(0)" : "translateY(5px)",
                        transition: "opacity 0.2s ease, transform 0.2s ease",
                    }}>{s.dialogue}</p>

                    {/* Dots + nav */}
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <div style={{ display: "flex", gap: "5px", flex: 1 }}>
                            {SLIDES.map((_, i) => (
                                <button key={i} onClick={() => goTo(i)} style={{
                                    width: i === slide ? "18px" : "5px", height: "5px",
                                    borderRadius: "999px",
                                    background: i === slide ? s.accent : "rgba(120,140,180,0.2)",
                                    border: "none", cursor: "pointer", padding: 0,
                                    transition: "width 0.22s ease, background 0.3s ease",
                                }} />
                            ))}
                        </div>

                        {slide > 0 && (
                            <button onClick={() => goTo(slide - 1)} style={{
                                padding: "10px 14px", borderRadius: "12px",
                                background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                                color: "rgba(160,175,215,0.65)", fontSize: "0.85rem", fontWeight: 600,
                                cursor: "pointer",
                            }}>←</button>
                        )}

                        <button onClick={next} style={{
                            padding: "10px 22px", borderRadius: "12px",
                            background: isLast ? s.accent : `${s.accent}1a`,
                            border: `1px solid ${isLast ? s.accent : s.accent + "44"}`,
                            color: isLast ? "#000" : s.accent,
                            fontSize: "0.88rem", fontWeight: 700, cursor: "pointer",
                            transition: "all 0.22s",
                        }}>{isLast ? "Let's go 🐾" : "Next →"}</button>
                    </div>

                    <button onClick={() => dismiss(true)} style={{
                        display: "block", width: "100%", marginTop: "10px",
                        background: "none", border: "none", cursor: "pointer",
                        fontSize: "0.75rem", fontFamily: "JetBrains Mono, monospace",
                        color: "rgba(160,175,215,0.60)", letterSpacing: "0.08em",
                        textAlign: "center", padding: "6px 0",
                        textDecoration: "underline",
                    }}>DON'T SHOW AGAIN</button>
                </div>
            </div>
        </div>
    );
}
