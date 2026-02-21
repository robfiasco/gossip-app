"use client";

import { useState, useEffect } from "react";

const LETTERS = ["G", "O", "S", "S", "I", "P"];

// Each letter gets a unique "whisper origin" — a direction it drifts in from
const WHISPER_ORIGINS = [
    { x: -180, y: -60, rotate: -18 },   // G — from upper left
    { x: 80, y: -140, rotate: 12 },    // O — from above
    { x: -60, y: 100, rotate: -8 },    // S — from lower left
    { x: 140, y: -80, rotate: 20 },    // S — from upper right
    { x: -120, y: 40, rotate: -14 },   // I — from the left
    { x: 100, y: 120, rotate: 10 },    // P — from lower right
];

const STAGGER_MS = 160;
const DRIFT_DURATION = 680;
const WOBBLE_DURATION = 340;

function Letter({ char, origin, index, onComplete }: { char: string, origin: { x: number, y: number, rotate: number }, index: number, onComplete: () => void }) {
    const [phase, setPhase] = useState<"hidden" | "drifting" | "wobble" | "settled">("hidden");

    useEffect(() => {
        const enterDelay = setTimeout(() => {
            setPhase("drifting");

            const snapDelay = setTimeout(() => {
                setPhase("wobble");

                const settleDelay = setTimeout(() => {
                    setPhase("settled");
                    if (index === LETTERS.length - 1) {
                        setTimeout(onComplete, 400);
                    }
                }, WOBBLE_DURATION);

                return () => clearTimeout(settleDelay);
            }, DRIFT_DURATION);

            return () => clearTimeout(snapDelay);
        }, index * STAGGER_MS);

        return () => clearTimeout(enterDelay);
    }, [index, onComplete]);

    const styles: Record<string, React.CSSProperties> = {
        hidden: {
            opacity: 0,
            transform: `translate(${origin.x}px, ${origin.y}px) rotate(${origin.rotate}deg) scale(0.6)`,
            filter: "blur(8px)",
        },
        drifting: {
            opacity: 1,
            transform: "translate(0px, 0px) rotate(0deg) scale(1)",
            filter: "blur(0px)",
            transition: `opacity ${DRIFT_DURATION}ms cubic-bezier(0.22, 1, 0.36, 1),
                   transform ${DRIFT_DURATION}ms cubic-bezier(0.22, 1, 0.36, 1),
                   filter ${DRIFT_DURATION * 0.7}ms ease`,
        },
        wobble: {
            opacity: 1,
            transform: `translate(0px, 0px) rotate(${origin.rotate * 0.15}deg) scale(1.04)`,
            filter: "blur(0px)",
            transition: `transform ${WOBBLE_DURATION * 0.4}ms cubic-bezier(0.34, 1.56, 0.64, 1)`,
        },
        settled: {
            opacity: 1,
            transform: "translate(0px, 0px) rotate(0deg) scale(1)",
            filter: "blur(0px)",
            transition: `transform ${WOBBLE_DURATION * 0.6}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`,
        },
    };

    return (
        <span
            className="title-logo"
            style={{
                display: "inline-block",
                willChange: "transform, opacity, filter",
                ...styles[phase],
            }}
        >
            {char}
        </span>
    );
}

function GrainOverlay() {
    return (
        <svg
            style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                opacity: 0.045,
                pointerEvents: "none",
                mixBlendMode: "overlay",
            }}
        >
            <filter id="grain">
                <feTurbulence
                    type="fractalNoise"
                    baseFrequency="0.75"
                    numOctaves="4"
                    stitchTiles="stitch"
                />
                <feColorMatrix type="saturate" values="0" />
            </filter>
            <rect width="100%" height="100%" filter="url(#grain)" />
        </svg>
    );
}

function Tagline({ visible }: { visible: boolean }) {
    return (
        <p
            style={{
                margin: "28px 0 0",
                fontFamily: "'Cormorant Garamond', Georgia, serif",
                fontWeight: 300,
                fontStyle: "italic",
                fontSize: "clamp(12px, 3vw, 15px)",
                letterSpacing: "0.32em",
                color: "rgba(230, 210, 255, 0.55)",
                opacity: visible ? 1 : 0,
                transform: visible ? "translateY(0)" : "translateY(10px)",
                transition: "opacity 900ms ease, transform 900ms ease",
                textTransform: "lowercase",
            }}
        >
            Solana Intelligence Terminal
        </p>
    );
}

function LoadingDots({ visible }: { visible: boolean }) {
    return (
        <div
            style={{
                position: "absolute",
                bottom: "12%",
                display: "flex",
                gap: "8px",
                opacity: visible ? 1 : 0,
                transition: "opacity 600ms ease",
            }}
        >
            {[0, 1, 2].map((i) => (
                <span
                    key={i}
                    style={{
                        width: 5,
                        height: 5,
                        borderRadius: "50%",
                        background: "rgba(167, 139, 250, 0.7)",
                        animation: visible ? `dotPulse 1.4s ease-in-out ${i * 0.22}s infinite` : "none",
                    }}
                />
            ))}
        </div>
    );
}

export default function GossipLoadingScreen({ onFinished, isAppReady }: { onFinished?: () => void, isAppReady?: boolean }) {
    const [taglineVisible, setTaglineVisible] = useState(false);
    const [dotsVisible, setDotsVisible] = useState(false);
    const [exiting, setExiting] = useState(false);
    const [introSequenceComplete, setIntroSequenceComplete] = useState(false);

    useEffect(() => {
        // Dots appear early while letters are still drifting in
        const dotTimer = setTimeout(() => setDotsVisible(true), 200);
        return () => clearTimeout(dotTimer);
    }, []);

    useEffect(() => {
        if (introSequenceComplete && isAppReady) {
            setExiting(true);
            const timer = setTimeout(() => onFinished?.(), 800);
            return () => clearTimeout(timer);
        }
    }, [introSequenceComplete, isAppReady, onFinished]);

    function handleLettersComplete() {
        setTaglineVisible(true);
        setTimeout(() => {
            setIntroSequenceComplete(true);
        }, 1400); // Wait for the tagline to finish showing
    }

    return (
        <div
            style={{
                position: "absolute",
                inset: 0,
                zIndex: 9999, // Ensure it sits above absolutely everything else
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
                background: "#0a0612",
                opacity: exiting ? 0 : 1,
                transition: exiting ? "opacity 700ms ease" : "none",
                // Do not let background elements intercept pointer events while loading screen is present, exception: when fading out
                pointerEvents: exiting ? "none" : "auto",
            }}
        >
            <style>{`
        @keyframes dotPulse {
          0%, 80%, 100% { opacity: 0.2; transform: scale(0.85); }
          40%            { opacity: 1;   transform: scale(1.2); }
        }

        @keyframes meshShift {
          0%   { background-position: 0% 50%; }
          50%  { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }

        @keyframes auraBreath {
          0%, 100% { opacity: 0.55; transform: scale(1); }
          50%       { opacity: 0.75; transform: scale(1.08); }
        }
      `}</style>
            {/* Animated gradient mesh background */}
            <div
                style={{
                    position: "absolute",
                    inset: 0,
                    background:
                        "radial-gradient(ellipse 80% 60% at 30% 40%, #1a0a2e 0%, transparent 60%)," +
                        "radial-gradient(ellipse 60% 80% at 75% 70%, #0d1a3a 0%, transparent 55%)," +
                        "radial-gradient(ellipse 50% 50% at 50% 20%, #200830 0%, transparent 50%)",
                }}
            />

            {/* Glow aura behind the word */}
            <div
                style={{
                    position: "absolute",
                    width: "420px",
                    height: "160px",
                    borderRadius: "50%",
                    background:
                        "radial-gradient(ellipse, rgba(139, 92, 246, 0.28) 0%, rgba(79, 70, 229, 0.12) 50%, transparent 72%)",
                    filter: "blur(32px)",
                    animation: "auraBreath 3.2s ease-in-out infinite",
                }}
            />

            <GrainOverlay />

            {/* The word mark */}
            <div
                style={{
                    position: "relative",
                    display: "flex",
                    width: "min(360px, 90vw)",
                    justifyContent: "space-between",
                    padding: "0 10px",
                    fontFamily: "'JetBrains Mono', 'IBM Plex Mono', monospace",
                    fontWeight: 800,
                    fontSize: "clamp(48px, 12vw, 82px)",
                    letterSpacing: "-0.02em",
                    userSelect: "none",
                }}
            >
                {LETTERS.map((char, i) => (
                    <Letter
                        key={i}
                        char={char}
                        origin={WHISPER_ORIGINS[i]}
                        index={i}
                        onComplete={handleLettersComplete}
                    />
                ))}
            </div>

            <Tagline visible={taglineVisible} />
            <LoadingDots visible={dotsVisible} />
        </div>
    );
}
