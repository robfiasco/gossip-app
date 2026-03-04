"use client";

import { useEffect } from "react";

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        // Log to an error reporting service in production; console in dev
        if (process.env.NODE_ENV !== "production") {
            console.error("Unhandled app error:", error);
        }
    }, [error]);

    return (
        <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            minHeight: "100vh", background: "#0c0f18", color: "#e2e8f0", textAlign: "center", padding: "32px",
        }}>
            <p style={{ color: "#14F195", fontSize: "0.75rem", letterSpacing: "0.12em", marginBottom: "12px" }}>
                SYSTEM ERROR
            </p>
            <h2 style={{ fontSize: "1.2rem", marginBottom: "8px" }}>Something went wrong</h2>
            <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.85rem", marginBottom: "24px" }}>
                {error?.message || "An unexpected error occurred. Please try again."}
            </p>
            <button
                type="button"
                onClick={reset}
                style={{
                    background: "rgba(20, 241, 149, 0.1)", border: "1px solid #14F195",
                    color: "#14F195", padding: "10px 24px", borderRadius: "8px",
                    fontSize: "0.85rem", cursor: "pointer",
                }}
            >
                Try Again
            </button>
        </div>
    );
}
