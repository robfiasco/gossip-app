"use client";

import React, { useEffect, useState, useRef } from "react";
import MatrixBanner from "./MatrixBanner";

export default function ScrollMatrixBackground({ color = "#14F195" }: { color?: string }) {
    const [isScrolling, setIsScrolling] = useState(false);
    const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        const handleScroll = () => {
            setIsScrolling(true);

            if (scrollTimeoutRef.current) {
                clearTimeout(scrollTimeoutRef.current);
            }

            // Wait a short time after scrolling stops to fade out
            scrollTimeoutRef.current = setTimeout(() => {
                setIsScrolling(false);
            }, 300);
        };

        // Story detail lives inside .panel-slide-scroll; fall back to .seeker-page then window
        const container = document.querySelector('.panel-slide-scroll') || document.querySelector('.seeker-page') || window;
        container.addEventListener('scroll', handleScroll, { passive: true });

        return () => {
            container.removeEventListener('scroll', handleScroll);
            if (scrollTimeoutRef.current) {
                clearTimeout(scrollTimeoutRef.current);
            }
        };
    }, []);

    return (
        <div
            style={{
                position: "fixed",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                pointerEvents: "none",
                zIndex: -1,
                opacity: isScrolling ? 0.4 : 0, // Opacity increases only on scroll
                transition: "opacity 0.5s ease-in-out",
                overflow: "hidden"
            }}
            aria-hidden="true"
        >
            <MatrixBanner color={color} />
        </div>
    );
}
