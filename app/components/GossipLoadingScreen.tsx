"use client";

import { useState, useEffect } from "react";

const TARGET_TITLE = "GOSSIP";
const TARGET_SUBTITLE = "SOLANA INTELLIGENCE TERMINAL";
const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export default function GossipLoadingScreen({ onFinished, isAppReady }: { onFinished?: () => void, isAppReady?: boolean }) {
    const [titleText, setTitleText] = useState("");
    const [subtitleText, setSubtitleText] = useState("");
    const [progress, setProgress] = useState(0);
    const [exiting, setExiting] = useState(false);
    const [introSequenceComplete, setIntroSequenceComplete] = useState(false);
    const [isGlitching, setIsGlitching] = useState(false);

    useEffect(() => {
        let iterations = 0;
        const totalIterations = 35; // Smooth decrypt duration

        const interval = setInterval(() => {
            setTitleText(TARGET_TITLE.split("").map((letter, index) => {
                if (letter === " ") return " ";
                if (index < (iterations / totalIterations) * TARGET_TITLE.length) {
                    return TARGET_TITLE[index];
                }
                return CHARS[Math.floor(Math.random() * CHARS.length)];
            }).join(""));

            setSubtitleText(TARGET_SUBTITLE.split("").map((letter, index) => {
                if (letter === " ") return " ";
                if (index < (iterations / totalIterations) * TARGET_SUBTITLE.length) {
                    return TARGET_SUBTITLE[index];
                }
                return CHARS[Math.floor(Math.random() * CHARS.length)];
            }).join(""));

            iterations += 1;
            setProgress(Math.min(100, (iterations / totalIterations) * 100));

            if (iterations >= totalIterations) {
                clearInterval(interval);
                setTitleText(TARGET_TITLE);
                setSubtitleText(TARGET_SUBTITLE);
                setIntroSequenceComplete(true);
            }
        }, 40); // 40ms step

        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (introSequenceComplete && isAppReady) {
            const glitchTimer = setTimeout(() => {
                setIsGlitching(true);
            }, 2000);

            const delayTimer = setTimeout(() => {
                setIsGlitching(false);
                setExiting(true);
                setTimeout(() => onFinished?.(), 800);
            }, 3000);

            return () => {
                clearTimeout(glitchTimer);
                clearTimeout(delayTimer);
            };
        }
    }, [introSequenceComplete, isAppReady, onFinished]);

    return (
        <div
            style={{
                position: "absolute",
                inset: 0,
                zIndex: 9999,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
                background: "#0a0612",
                opacity: exiting ? 0 : 1,
                transition: "opacity 800ms ease-in-out, transform 800ms ease-in-out",
                transform: exiting ? "scale(1.05)" : "scale(1)",
                pointerEvents: exiting ? "none" : "auto",
            }}
        >
            {/* Grid overlay */}
            <div style={{
                position: "absolute",
                inset: "-40px -40px 0 -40px",
                backgroundSize: "40px 40px",
                backgroundImage: "linear-gradient(to right, rgba(255, 255, 255, 0.02) 1px, transparent 1px), linear-gradient(to bottom, rgba(255, 255, 255, 0.02) 1px, transparent 1px)",
                opacity: 0.5,
                animation: "gridPan 15s linear infinite"
            }} />

            {/* Glowing Aura */}
            <div style={{
                position: "absolute",
                width: "60vh",
                height: "60vh",
                borderRadius: "50%",
                background: "radial-gradient(circle, rgba(139, 92, 246, 0.15) 0%, rgba(79, 70, 229, 0.05) 40%, transparent 70%)",
                filter: "blur(40px)",
                animation: "auraPulse 3s ease-in-out infinite alternate"
            }} />

            <div style={{ zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "32px", width: "100%", padding: "0 24px" }}>

                {/* Terminal Decryption Block */}
                <div style={{
                    position: "relative",
                    width: "48px",
                    height: "48px",
                    border: "1px solid rgba(76, 187, 23, 0.3)",
                    background: "rgba(10, 6, 18, 0.8)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 0 15px rgba(76, 187, 23, 0.1) inset",
                    overflow: "hidden"
                }}>
                    {/* Corner accents */}
                    <div style={{ position: "absolute", top: -1, left: -1, width: 6, height: 6, borderTop: "2px solid #4cbb17", borderLeft: "2px solid #4cbb17" }} />
                    <div style={{ position: "absolute", top: -1, right: -1, width: 6, height: 6, borderTop: "2px solid #4cbb17", borderRight: "2px solid #4cbb17" }} />
                    <div style={{ position: "absolute", bottom: -1, left: -1, width: 6, height: 6, borderBottom: "2px solid #4cbb17", borderLeft: "2px solid #4cbb17" }} />
                    <div style={{ position: "absolute", bottom: -1, right: -1, width: 6, height: 6, borderBottom: "2px solid #4cbb17", borderRight: "2px solid #4cbb17" }} />

                    {/* Scanline */}
                    <div style={{
                        position: "absolute",
                        top: 0, left: 0, right: 0, height: "100%",
                        background: "linear-gradient(to bottom, transparent 0%, rgba(76, 187, 23, 0.4) 50%, transparent 100%)",
                        animation: "loading-scanline 1.5s linear infinite",
                        opacity: 0.8
                    }} />

                    {/* Blinking decoding node */}
                    <div style={{
                        width: "12px", height: "12px",
                        background: "#4cbb17",
                        animation: "fast-blink 0.6s steps(2, start) infinite",
                        boxShadow: "0 0 10px #4cbb17"
                    }} />
                </div>

                {/* Decrypting Text */}
                <div style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "8px"
                }}>
                    <div className={`title-logo ${isGlitching ? 'loading-glitch-active' : ''}`} style={{
                        animationDelay: "0s",
                        fontFamily: "'JetBrains Mono', 'IBM Plex Mono', monospace",
                        fontSize: "clamp(24px, 5vw, 36px)",
                        fontWeight: 700,
                        letterSpacing: "0.4em",
                        textAlign: "center",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center"
                    }}>
                        {titleText}
                    </div>
                    <div style={{
                        fontFamily: "'JetBrains Mono', 'IBM Plex Mono', monospace",
                        fontSize: "clamp(10px, 3.5vw, 14px)",
                        fontWeight: 500,
                        letterSpacing: "0.3em",
                        color: "rgba(230, 210, 255, 0.7)",
                        textAlign: "center",
                        textTransform: "uppercase",
                        minHeight: "24px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center"
                    }}>
                        {subtitleText}
                        {!introSequenceComplete && <span style={{ animation: "cursorBlink 0.5s step-end infinite", opacity: 0.8 }}>_</span>}
                    </div>
                </div>

                {/* Progress Bar Container */}
                <div style={{
                    width: "min(240px, 60vw)",
                    height: "1px",
                    background: "rgba(255, 255, 255, 0.05)",
                    position: "relative",
                    overflow: "hidden"
                }}>
                    <div style={{
                        position: "absolute",
                        top: 0, left: 0, bottom: 0,
                        width: `${progress}%`,
                        background: "linear-gradient(90deg, transparent, #a78bfa)",
                        transition: "width 0.1s linear",
                        boxShadow: "0 0 8px #a78bfa",
                    }} />
                </div>

                {/* Status Text */}
                <div style={{
                    fontFamily: "'JetBrains Mono', 'IBM Plex Mono', monospace",
                    fontSize: "10px",
                    color: "rgba(255, 255, 255, 0.3)",
                    letterSpacing: "0.1em",
                    opacity: isAppReady && introSequenceComplete ? 1 : 0.6,
                    transition: "opacity 0.3s ease"
                }}>
                    {isAppReady && introSequenceComplete ? "SYSTEM READY" : "ESTABLISHING CONNECTION..."}
                </div>
            </div>

            <style>{`
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                @keyframes spinReverse {
                    0% { transform: rotate(360deg); }
                    100% { transform: rotate(0deg); }
                }
                @keyframes auraPulse {
                    from { transform: scale(0.9); opacity: 0.6; }
                    to { transform: scale(1.1); opacity: 1; }
                }
                @keyframes gridPan {
                    0% { transform: translateY(0); }
                    100% { transform: translateY(40px); }
                }
                @keyframes cursorBlink {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0; }
                }
            `}</style>
        </div>
    );
}
