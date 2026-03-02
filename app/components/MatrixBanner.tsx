"use client";

import { useEffect, useRef } from "react";

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export default function MatrixBanner({ color }: { color: string }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let columns = 0;
        let drops: number[] = [];

        const resize = () => {
            const parent = canvas.parentElement;
            if (parent) {
                const rect = parent.getBoundingClientRect();
                canvas.width = rect.width;
                canvas.height = rect.height;
            } else {
                canvas.width = 400;
                canvas.height = 28;
            }

            const fontSize = 10;
            columns = Math.ceil(canvas.width / fontSize);
            drops = [];
            for (let x = 0; x < columns; x++) {
                drops[x] = Math.random() * (canvas.height / fontSize);
            }
        };

        resize();

        const draw = () => {
            ctx.fillStyle = 'rgba(10, 11, 14, 0.2)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.fillStyle = color;
            ctx.font = '10px "JetBrains Mono", monospace';
            ctx.textAlign = "center";

            const fontSize = 10;
            for (let i = 0; i < drops.length; i++) {
                if (Math.random() > 0.3) {
                    const text = CHARS[Math.floor(Math.random() * CHARS.length)];
                    ctx.shadowBlur = 4;
                    ctx.shadowColor = color;
                    ctx.fillText(text, i * fontSize + (fontSize / 2), drops[i] * fontSize);
                    ctx.shadowBlur = 0;
                }

                if (drops[i] * fontSize > canvas.height && Math.random() > 0.95) {
                    drops[i] = 0;
                }

                drops[i] += 0.5;
            }
        };

        const interval = setInterval(draw, 60);
        window.addEventListener('resize', resize);

        return () => {
            clearInterval(interval);
            window.removeEventListener('resize', resize);
        };
    }, [color]);

    return (
        <canvas
            ref={canvasRef}
            style={{
                width: "100%",
                height: "100%",
                display: "block",
                opacity: 0.8,
                mixBlendMode: "screen",
                borderRadius: "4px",
            }}
        />
    );
}
