"use client";

import { useState, useEffect } from "react";

const TARGET_TEXT = "SOLANA INTELLIGENCE TERMINAL";
const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&*!+=?><";

export default function GossipLoadingScreen({ onFinished, isAppReady }: { onFinished?: () => void, isAppReady?: boolean }) {
    const [text, setText] = useState("");
    const [progress, setProgress] = useState(0);
    const [exiting, setExiting] = useState(false);
    const [introSequenceComplete, setIntroSequenceComplete] = useState(false);

    useEffect(() => {
        let iterations = 0;
        const totalIterations = 35; // Smooth decrypt duration

        const interval = setInterval(() => {
            setText(TARGET_TEXT.split("").map((letter, index) => {
                if (letter === " ") return " ";
                // As iterations progress, reveal the correct letter
                if (index < (iterations / totalIterations) * TARGET_TEXT.length) {
                    return TARGET_TEXT[index];
                }
                return CHARS[Math.floor(Math.random() * CHARS.length)];
            }).join(""));

            iterations += 1;
            setProgress(Math.min(100, (iterations / totalIterations) * 100));

            if (iterations >= totalIterations) {
                clearInterval(interval);
                setText(TARGET_TEXT);
                setIntroSequenceComplete(true);
            }
        }, 40); // 40ms step

        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (introSequenceComplete && isAppReady) {
            setExiting(true);
            const timer = setTimeout(() => onFinished?.(), 800);
            return () => clearTimeout(timer);
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

                {/* Glowing Spinner */}
                <div style={{ position: "relative", width: "64px", height: "64px" }}>
                    <div style={{
                        position: "absolute",
                        inset: 0,
                        borderRadius: "50%",
                        border: "1px solid rgba(139, 92, 246, 0.15)",
                    }} />
                    <div style={{
                        position: "absolute",
                        inset: 0,
                        borderRadius: "50%",
                        borderTop: "2px solid #a78bfa",
                        borderRight: "2px solid transparent",
                        borderBottom: "2px solid transparent",
                        borderLeft: "2px solid transparent",
                        animation: "spin 1.2s cubic-bezier(0.68, -0.55, 0.265, 1.55) infinite",
                        boxShadow: "0 -2px 12px rgba(167, 139, 250, 0.4)"
                    }} />
                    <div style={{
                        position: "absolute",
                        inset: "10px",
                        borderRadius: "50%",
                        borderBottom: "2px solid #818cf8",
                        borderTop: "2px solid transparent",
                        borderRight: "2px solid transparent",
                        borderLeft: "2px solid transparent",
                        animation: "spinReverse 1.8s cubic-bezier(0.68, -0.55, 0.265, 1.55) infinite",
                        opacity: 0.8
                    }} />
                </div>

                {/* Decrypting Text */}
                <div style={{
                    fontFamily: "'JetBrains Mono', 'IBM Plex Mono', monospace",
                    fontSize: "clamp(12px, 3.5vw, 18px)",
                    fontWeight: 500,
                    letterSpacing: "0.4em",
                    color: "rgba(230, 210, 255, 0.9)",
                    textAlign: "center",
                    textTransform: "uppercase",
                    minHeight: "24px",
                    textShadow: "0 0 10px rgba(167, 139, 250, 0.4)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                }}>
                    {text}
                    {!introSequenceComplete && <span style={{ animation: "cursorBlink 0.5s step-end infinite", opacity: 0.8 }}>_</span>}
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
