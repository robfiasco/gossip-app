"use client";
import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "gossip_onboarded";

const SLIDES = [
    {
        img: "/cat-welcome.png",
        // Deep terminal-green scene
        sceneBg: "linear-gradient(to bottom, #050f0a 0%, #071a10 40%, #040c09 100%)",
        spotlightColor: "rgba(20, 241, 149, 0.12)",
        accent: "#14f195",
        dialogue: "Hey! I'm Gossip Cat — an AI agent who never sleeps. I scour CT, news, and on-chain data 24/7 so you don't have to spend 12 hours a day on X. You're welcome.",
    },
    {
        img: "/cat-market.png",
        sceneBg: "linear-gradient(to bottom, #050a14 0%, #071428 40%, #040810 100%)",
        spotlightColor: "rgba(96, 165, 250, 0.14)",
        accent: "#60a5fa",
        dialogue: "Can't tell if that crypto email is legit? Not sure if those airdrop instructions are real or a rug? That's my department. I dig up the truth so you don't get got.",
    },
    {
        img: "/cat-briefing.png",
        sceneBg: "linear-gradient(to bottom, #0f0a03 0%, #1a1004 40%, #0c0802 100%)",
        spotlightColor: "rgba(245, 158, 11, 0.14)",
        accent: "#f59e0b",
        dialogue: "No X account needed. No newsletter. No sign-up. Every morning at 7am UTC, I've already read the internet and left your daily briefing at the door.",
    },
    {
        img: "/cat-seeker.png",
        sceneBg: "linear-gradient(to bottom, #060310 0%, #0f0520 40%, #050210 100%)",
        spotlightColor: "rgba(192, 132, 252, 0.14)",
        accent: "#c084fc",
        dialogue: "Seeker Genesis holders get the VIP tier — full AI intelligence reports, the deep analytical stuff CT won't break down for you. Connect your wallet and I'll let you in.",
    },
];

export default function OnboardingCarousel() {
    const [visible, setVisible] = useState(false);
    const [slide, setSlide] = useState(0);
    const [catFade, setCatFade] = useState(true);
    const [textFade, setTextFade] = useState(true);
    const [exiting, setExiting] = useState(false);

    useEffect(() => {
        try {
            if (!window.localStorage.getItem(STORAGE_KEY)) setVisible(true);
        } catch { /* ignore */ }
    }, []);

    const goTo = useCallback((idx) => {
        setCatFade(false);
        setTextFade(false);
        setTimeout(() => {
            setSlide(idx);
            setCatFade(true);
            setTimeout(() => setTextFade(true), 80);
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

    if (!visible) return null;

    const s = SLIDES[slide];
    const isLast = slide === SLIDES.length - 1;

    return (
        /* Full-screen backdrop */
        <div
            onClick={() => dismiss(false)}
            style={{
                position: "fixed", inset: 0, zIndex: 9999,
                background: "rgba(2, 4, 10, 0.75)",
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                opacity: exiting ? 0 : 1,
                transition: "opacity 0.32s ease",
            }}
        >
            {/* ── Phone-width card ────────────────────────────────── */}
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    width: "100%",
                    maxWidth: "430px",
                    height: "min(860px, 95vh)",
                    borderRadius: "28px",
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                    background: s.sceneBg,
                    transition: "background 0.5s ease",
                    boxShadow: "0 32px 80px rgba(0,0,0,0.7)",
                    border: "1px solid rgba(255,255,255,0.07)",
                    position: "relative",
                }}
            >
                {/* Skip */}
                <button
                    onClick={() => dismiss(true)}
                    style={{
                        position: "absolute", top: 18, right: 18, zIndex: 10,
                        background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: "999px", padding: "5px 14px",
                        fontSize: "0.62rem", fontFamily: "JetBrains Mono, monospace",
                        color: "rgba(180,190,220,0.45)", letterSpacing: "0.1em",
                        cursor: "pointer", textTransform: "uppercase",
                    }}
                >Skip</button>

                {/* ── Scene area with cat ─────────────────────────── */}
                <div style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "flex-end",
                    position: "relative",
                    overflow: "hidden",
                    minHeight: 0,
                }}>
                    {/* Grid / noise texture */}
                    <div style={{
                        position: "absolute", inset: 0, pointerEvents: "none",
                        backgroundImage:
                            "linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px)," +
                            "linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)",
                        backgroundSize: "40px 40px",
                    }} />

                    {/* Spotlight — warm oval behind cat, absorbs white bg naturally */}
                    <div style={{
                        position: "absolute",
                        bottom: "-10%",
                        left: "50%",
                        transform: "translateX(-50%)",
                        width: "110%",
                        height: "85%",
                        borderRadius: "50%",
                        background: `radial-gradient(ellipse at 50% 90%, ${s.spotlightColor} 0%, rgba(255,255,255,0.04) 40%, transparent 70%)`,
                        pointerEvents: "none",
                        transition: "background 0.5s ease",
                    }} />

                    {/* Ground glow line */}
                    <div style={{
                        position: "absolute",
                        bottom: 0,
                        left: "5%", right: "5%",
                        height: "2px",
                        background: `linear-gradient(to right, transparent, ${s.accent}55, transparent)`,
                        borderRadius: "999px",
                        transition: "background 0.5s ease",
                    }} />

                    {/* Gossip Cat */}
                    <img
                        key={s.img}
                        src={s.img}
                        alt="Gossip Cat"
                        style={{
                            height: "min(58vh, 420px)",
                            width: "auto",
                            maxWidth: "88%",
                            objectFit: "contain",
                            objectPosition: "bottom",
                            opacity: catFade ? 1 : 0,
                            transform: catFade ? "translateY(0) scale(1)" : "translateY(16px) scale(0.96)",
                            transition: "opacity 0.2s ease, transform 0.28s cubic-bezier(0.34,1.56,0.64,1)",
                            position: "relative", zIndex: 2,
                            marginBottom: "-2px",
                            mixBlendMode: "multiply",
                        }}
                    />
                </div>

                {/* ── Dialogue box ────────────────────────────────── */}
                <div style={{
                    flexShrink: 0,
                    padding: "18px 20px 24px",
                    background: "rgba(6, 8, 18, 0.92)",
                    borderTop: `1px solid ${s.accent}33`,
                    transition: "border-color 0.5s ease",
                }}>
                    {/* Speaker */}
                    <div style={{
                        display: "flex", alignItems: "center", gap: "7px",
                        marginBottom: "9px",
                    }}>
                        <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: s.accent, flexShrink: 0 }} />
                        <span style={{
                            fontSize: "0.58rem", fontFamily: "JetBrains Mono, monospace",
                            color: s.accent, letterSpacing: "0.15em", fontWeight: 700,
                            textTransform: "uppercase",
                        }}>Gossip Cat</span>
                    </div>

                    {/* Dialogue */}
                    <p style={{
                        fontSize: "1rem", lineHeight: 1.65,
                        color: "rgba(225,232,255,0.9)",
                        marginBottom: "16px",
                        fontWeight: 400,
                        minHeight: "4.9rem",
                        opacity: textFade ? 1 : 0,
                        transform: textFade ? "translateY(0)" : "translateY(5px)",
                        transition: "opacity 0.18s ease, transform 0.18s ease",
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
                        fontSize: "0.6rem", fontFamily: "JetBrains Mono, monospace",
                        color: "rgba(100,115,155,0.38)", letterSpacing: "0.08em",
                        textAlign: "center", padding: "2px",
                    }}>DON'T SHOW AGAIN</button>
                </div>
            </div>
        </div>
    );
}
