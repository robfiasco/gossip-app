"use client";

import { useState, useEffect, useRef } from "react";

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
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        const fontSize = 16;
        const columns = canvas.width / fontSize;
        const drops: number[] = [];
        for (let x = 0; x < columns; x++) {
            drops[x] = 1;
        }

        const draw = () => {
            ctx.fillStyle = 'rgba(10, 6, 18, 0.1)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.fillStyle = '#4cbb17';
            ctx.font = `${fontSize}px "JetBrains Mono", monospace`;

            for (let i = 0; i < drops.length; i++) {
                const text = CHARS[Math.floor(Math.random() * CHARS.length)];
                ctx.fillText(text, i * fontSize, drops[i] * fontSize);

                if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
                    drops[i] = 0;
                }
                drops[i]++;
            }
        };

        const interval = setInterval(draw, 50);

        const handleResize = () => {
            if (canvas) {
                canvas.width = window.innerWidth;
                canvas.height = window.innerHeight;
            }
        };
        window.addEventListener('resize', handleResize);

        return () => {
            clearInterval(interval);
            window.removeEventListener('resize', handleResize);
        };
    }, []);
    useEffect(() => {
        let iterations = 0;
        const totalIterations = 35;

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
        }, 40);

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
            <div style={{
                position: "absolute",
                inset: "-40px -40px 0 -40px",
                backgroundSize: "40px 40px",
                backgroundImage: "linear-gradient(to right, rgba(255, 255, 255, 0.02) 1px, transparent 1px), linear-gradient(to bottom, rgba(255, 255, 255, 0.02) 1px, transparent 1px)",
                opacity: 0.5,
                animation: "gridPan 15s linear infinite"
            }} />

            <canvas
                ref={canvasRef}
                style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%",
                    zIndex: 0,
                    opacity: 0.5
                }}
            />

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
                        justifyContent: "center",
                        textShadow: "0 0 10px rgba(20, 241, 149, 0.5), 0 0 20px rgba(153, 69, 255, 0.4), 0 0 30px rgba(0, 194, 255, 0.3)"
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
