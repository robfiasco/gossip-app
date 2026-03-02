"use client";

import { useEffect, useRef, useState } from "react";

type ChartItem = {
    label: string;
    value: number;
    formattedValue?: string;
};

type AnimatedEngagementChartProps = {
    title: string;
    items: ChartItem[];
    maxValue?: number;
    colors?: string[];
};

export default function AnimatedEngagementChart({ title, items, maxValue, colors }: AnimatedEngagementChartProps) {
    const [isVisible, setIsVisible] = useState(false);
    const chartRef = useRef<HTMLDivElement>(null);

    // Auto-calculate max value if not provided
    const computedMax = maxValue ?? Math.max(...items.map((item) => item.value), 1);

    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    // Double RAF ensures the browser paints width:0% first,
                    // so the CSS transition actually plays
                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => setIsVisible(true));
                    });
                    observer.disconnect();
                }
            },
            { threshold: 0.1 }
        );

        if (chartRef.current) {
            observer.observe(chartRef.current);
        }

        return () => observer.disconnect();
    }, []);

    const formatNumber = (num: number) => {
        if (num >= 1000000) return (num / 1000000).toFixed(2) + "M";
        if (num >= 1000) return (num / 1000).toFixed(1) + "K";
        return num.toString();
    };

    return (
        <div ref={chartRef} className="engagement-chart-container">
            <h3 className="engagement-chart-title">{title}</h3>

            <div className="engagement-chart-grid">
                {items.map((item, index) => {
                    const widthPercent = Math.min(100, Math.max(2, (item.value / computedMax) * 100));

                    return (
                        <div key={index} className="engagement-chart-row">
                            <div className="engagement-chart-label">
                                {item.label}
                            </div>
                            <div className="engagement-chart-bar-container">
                                <div
                                    className={`engagement-chart-bar ${isVisible ? 'visible' : ''}`}
                                    style={{
                                        width: isVisible ? `${widthPercent}%` : '0%',
                                        transitionDelay: `${index * 150}ms`,
                                        ...(colors && colors[index] ? {
                                            background: colors[index],
                                            boxShadow: `0 0 10px ${colors[index]}4D`
                                        } : {})
                                    }}
                                />
                                <span
                                    className={`engagement-chart-value ${isVisible ? 'visible' : ''}`}
                                    style={{ transitionDelay: `${index * 150 + 300}ms` }}
                                >
                                    {item.formattedValue || formatNumber(item.value)}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
