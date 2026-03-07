"use client";

import { useState, useRef, useCallback } from "react";
import { upload } from "@vercel/blob/client";

type PipelineStatus = "idle" | "uploading" | "queued" | "in_progress" | "completed" | "failure" | "error";

export default function AdminPage() {
    const [secret, setSecret] = useState(() =>
        typeof window !== "undefined" ? (sessionStorage.getItem("admin_secret") ?? "") : ""
    );
    const [file, setFile] = useState<File | null>(null);
    const [status, setStatus] = useState<PipelineStatus>("idle");
    const [message, setMessage] = useState("");
    const [runUrl, setRunUrl] = useState("");
    const [completedAt, setCompletedAt] = useState("");
    const [dragging, setDragging] = useState(false);
    const [progress, setProgress] = useState(0);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const stopPolling = () => {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };

    const pollStatus = useCallback((since: string, adminSecret: string) => {
        stopPolling();
        setTimeout(() => {
            pollRef.current = setInterval(async () => {
                try {
                    const res = await fetch(
                        `/api/admin/pipeline-status?since=${encodeURIComponent(since)}`,
                        { headers: { Authorization: `Bearer ${adminSecret}` } }
                    );
                    if (!res.ok) { setStatus("error"); setMessage("Status check failed."); stopPolling(); return; }
                    const data = await res.json();

                    if (data.status === "not_found" || data.status === "queued" || data.status === "waiting") {
                        setStatus("queued");
                    } else if (data.status === "in_progress") {
                        setStatus("in_progress");
                    } else if (data.conclusion === "success") {
                        setStatus("completed");
                        setCompletedAt(new Date(data.updated_at ?? data.created_at).toLocaleTimeString());
                        setRunUrl(data.html_url ?? "");
                        stopPolling();
                    } else if (data.conclusion === "failure" || data.conclusion === "cancelled") {
                        setStatus("failure");
                        setRunUrl(data.html_url ?? "");
                        stopPolling();
                    }
                } catch { /* keep polling on transient errors */ }
            }, 5000);
        }, 5000);
    }, []);

    const handleFileSelect = (selected: File | null) => {
        if (!selected) return;
        setFile(selected);
        setMessage("");
        setStatus("idle");
    };

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragging(false);
        handleFileSelect(e.dataTransfer.files[0] ?? null);
    }, []);

    const handleSubmit = async () => {
        if (!secret) { setMessage("Enter the admin secret first."); return; }
        if (!file) { setMessage("Select a file first."); return; }

        sessionStorage.setItem("admin_secret", secret);
        setStatus("uploading");
        setMessage("");
        setRunUrl("");
        setCompletedAt("");
        setProgress(0);

        // Validate JSON client-side before uploading
        try {
            const text = await file.text();
            const parsed = JSON.parse(text);
            if (typeof parsed !== "object" || parsed === null) throw new Error("Not an object/array");
        } catch {
            setStatus("error");
            setMessage("Invalid JSON — could not parse file.");
            return;
        }

        let blobUrl: string;
        try {
            // Upload directly to Vercel Blob (bypasses API body size limits)
            const blob = await upload(file.name, file, {
                access: "public",
                handleUploadUrl: "/api/admin/blob-upload",
                clientPayload: JSON.stringify({ secret }),
                onUploadProgress: ({ percentage }) => setProgress(percentage),
            });
            blobUrl = blob.url;
        } catch (err) {
            setStatus("error");
            const msg = err instanceof Error ? err.message : "Upload failed";
            setMessage(msg.includes("Unauthorized") ? "Wrong secret." : `Upload failed: ${msg}`);
            return;
        }

        // Store URL + trigger pipeline
        try {
            const res = await fetch("/api/admin/upload-signals", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ secret, blobUrl }),
            });
            if (res.status === 401) { setStatus("error"); setMessage("Wrong secret."); return; }
            if (!res.ok) { setStatus("error"); setMessage(`Trigger failed (${res.status}).`); return; }
            const data = await res.json();
            setStatus("queued");
            pollStatus(data.triggeredAt, secret);
        } catch {
            setStatus("error");
            setMessage("Network error — check your connection.");
        }
    };

    const busy = status === "uploading" || status === "queued" || status === "in_progress";

    const statusConfig: Record<PipelineStatus, { label: string; color: string; dot: string }> = {
        idle: { label: "Ready", color: "text-zinc-400", dot: "bg-zinc-600" },
        uploading: { label: `Uploading… ${progress}%`, color: "text-amber-400", dot: "bg-amber-400 animate-pulse" },
        queued: { label: "Queued — waiting for runner", color: "text-amber-400", dot: "bg-amber-400 animate-pulse" },
        in_progress: { label: "Pipeline running", color: "text-blue-400", dot: "bg-blue-400 animate-pulse" },
        completed: { label: "Complete", color: "text-emerald-400", dot: "bg-emerald-400" },
        failure: { label: "Pipeline failed", color: "text-red-400", dot: "bg-red-500" },
        error: { label: "Error", color: "text-red-400", dot: "bg-red-500" },
    };

    const cfg = statusConfig[status];

    return (
        <main className="font-sans min-h-screen bg-[#0a0f1a] flex items-center justify-center p-6">
            <div className="w-full max-w-sm space-y-5">

                {/* Header */}
                <div className="space-y-1">
                    <h1 className="text-2xl font-bold text-white tracking-tight">Story Pipeline</h1>
                    <p className="text-sm text-zinc-500">Upload <code className="text-zinc-400 text-xs">signals_raw.json</code> to generate CT stories.</p>
                </div>

                {/* Card */}
                <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-5 space-y-4">

                    {/* Secret */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-zinc-400 uppercase tracking-widest">Admin Secret</label>
                        <input
                            type="password"
                            value={secret}
                            onChange={(e) => setSecret(e.target.value)}
                            placeholder="Enter password"
                            disabled={busy}
                            className="w-full bg-zinc-800/60 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors disabled:opacity-50"
                        />
                    </div>

                    {/* Drop zone */}
                    <div
                        onClick={() => !busy && fileInputRef.current?.click()}
                        onDragOver={(e) => { e.preventDefault(); if (!busy) setDragging(true); }}
                        onDragLeave={() => setDragging(false)}
                        onDrop={handleDrop}
                        className={`relative rounded-xl border-2 border-dashed px-4 py-6 text-center cursor-pointer transition-all select-none ${
                            busy ? "opacity-50 cursor-not-allowed" :
                            dragging ? "border-blue-500 bg-blue-500/10" :
                            file ? "border-zinc-600 bg-zinc-800/40 hover:border-zinc-500" :
                            "border-zinc-700 hover:border-zinc-500 hover:bg-zinc-800/30"
                        }`}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".json,application/json"
                            className="hidden"
                            onChange={(e) => handleFileSelect(e.target.files?.[0] ?? null)}
                            disabled={busy}
                        />
                        {file ? (
                            <div className="space-y-0.5">
                                <p className="text-sm font-medium text-white">{file.name}</p>
                                <p className="text-xs text-zinc-500">{(file.size / 1024).toFixed(0)} KB · click to change</p>
                            </div>
                        ) : (
                            <div className="space-y-1">
                                <p className="text-sm text-zinc-400">Drop file here or click to browse</p>
                                <p className="text-xs text-zinc-600">signals_raw.json · any size</p>
                            </div>
                        )}

                        {/* Upload progress bar */}
                        {status === "uploading" && (
                            <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-b-xl bg-zinc-800 overflow-hidden">
                                <div
                                    className="h-full bg-blue-500 transition-all duration-300"
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                        )}
                    </div>

                    {/* Button */}
                    <button
                        onClick={handleSubmit}
                        disabled={busy || !file || !secret}
                        className="w-full rounded-xl py-2.5 text-sm font-semibold transition-all
                            bg-blue-600 hover:bg-blue-500 text-white
                            disabled:bg-zinc-800 disabled:text-zinc-500 disabled:cursor-not-allowed"
                    >
                        {busy ? "Working…" : "Upload & Generate Stories"}
                    </button>
                </div>

                {/* Status */}
                {status !== "idle" && (
                    <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl px-4 py-3 space-y-2">
                        <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
                            <span className={`text-sm font-medium ${cfg.color}`}>{cfg.label}</span>
                        </div>
                        {message && <p className="text-xs text-zinc-400 pl-4">{message}</p>}
                        {completedAt && <p className="text-xs text-zinc-500 pl-4">Finished at {completedAt}</p>}
                        {runUrl && (
                            <a href={runUrl} target="_blank" rel="noopener noreferrer"
                                className="text-xs text-blue-400 hover:text-blue-300 pl-4 block transition-colors">
                                View run on GitHub →
                            </a>
                        )}
                    </div>
                )}
            </div>
        </main>
    );
}
