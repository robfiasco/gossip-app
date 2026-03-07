"use client";

import { useState, useRef, useCallback } from "react";

type PipelineStatus = "idle" | "uploading" | "queued" | "in_progress" | "completed" | "failure" | "error";

const STATUS_LABELS: Record<PipelineStatus, string> = {
  idle: "Ready",
  uploading: "Uploading signals...",
  queued: "Pipeline queued — waiting for runner...",
  in_progress: "Pipeline running...",
  completed: "Pipeline complete",
  failure: "Pipeline failed",
  error: "Error",
};

const MAX_FILE_BYTES = 900 * 1024; // 900 KB

export default function AdminPage() {
  const [secret, setSecret] = useState(() =>
    typeof window !== "undefined" ? sessionStorage.getItem("admin_secret") ?? "" : ""
  );
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<PipelineStatus>("idle");
  const [message, setMessage] = useState("");
  const [runUrl, setRunUrl] = useState("");
  const [completedAt, setCompletedAt] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const pollStatus = useCallback((since: string, adminSecret: string) => {
    stopPolling();
    // Give GitHub a few seconds before first poll
    setTimeout(() => {
      pollRef.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/admin/pipeline-status?since=${encodeURIComponent(since)}`, {
            headers: { Authorization: `Bearer ${adminSecret}` },
          });
          if (!res.ok) {
            setStatus("error");
            setMessage("Status check failed");
            stopPolling();
            return;
          }
          const data = await res.json();

          if (data.status === "not_found") {
            setStatus("queued");
            return;
          }

          if (data.status === "queued" || data.status === "waiting") {
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
        } catch {
          // Keep polling on transient errors
        }
      }, 5000);
    }, 4000);
  }, []);

  const handleFileChange = (selected: File | null) => {
    if (!selected) return;
    if (selected.size > MAX_FILE_BYTES) {
      setMessage(`File too large (${(selected.size / 1024).toFixed(0)} KB). Max is 900 KB.`);
      setStatus("error");
      return;
    }
    setFile(selected);
    setMessage("");
    if (status === "error") setStatus("idle");
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) handleFileChange(dropped);
  }, []);

  const handleSubmit = async () => {
    if (!secret) { setMessage("Enter the admin secret first."); return; }
    if (!file) { setMessage("Select a signals_raw.json file first."); return; }

    // Persist secret for session
    sessionStorage.setItem("admin_secret", secret);

    setStatus("uploading");
    setMessage("");
    setRunUrl("");
    setCompletedAt("");

    let signals: unknown;
    try {
      const text = await file.text();
      signals = JSON.parse(text);
    } catch {
      setStatus("error");
      setMessage("Invalid JSON — could not parse file.");
      return;
    }

    // Basic sanity check: must be array or object
    if (typeof signals !== "object" || signals === null) {
      setStatus("error");
      setMessage("File must contain a JSON object or array.");
      return;
    }

    try {
      const res = await fetch("/api/admin/upload-signals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret, signals }),
      });

      if (res.status === 401) {
        setStatus("error");
        setMessage("Wrong secret.");
        return;
      }
      if (!res.ok) {
        setStatus("error");
        setMessage(`Upload failed (${res.status}).`);
        return;
      }

      const data = await res.json();
      setStatus("queued");
      pollStatus(data.triggeredAt, secret);
    } catch {
      setStatus("error");
      setMessage("Network error — check your connection.");
    }
  };

  const statusColor: Record<PipelineStatus, string> = {
    idle: "text-zinc-400",
    uploading: "text-yellow-400",
    queued: "text-yellow-400",
    in_progress: "text-blue-400",
    completed: "text-green-400",
    failure: "text-red-400",
    error: "text-red-400",
  };

  const busy = status === "uploading" || status === "queued" || status === "in_progress";

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">CT Stories Pipeline</h1>
          <p className="text-sm text-zinc-500 mt-1">Upload signals_raw.json to trigger story generation.</p>
        </div>

        {/* Secret input */}
        <div className="space-y-1">
          <label className="text-xs text-zinc-400 uppercase tracking-wider">Admin Secret</label>
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="••••••••"
            className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500"
            disabled={busy}
          />
        </div>

        {/* File drop zone */}
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
            dragging ? "border-blue-500 bg-blue-950/20" : "border-zinc-700 hover:border-zinc-500"
          }`}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
            disabled={busy}
          />
          {file ? (
            <div>
              <p className="text-sm font-medium text-zinc-200">{file.name}</p>
              <p className="text-xs text-zinc-500 mt-1">{(file.size / 1024).toFixed(1)} KB</p>
            </div>
          ) : (
            <div>
              <p className="text-sm text-zinc-400">Drop signals_raw.json here</p>
              <p className="text-xs text-zinc-600 mt-1">or click to browse · max 900 KB</p>
            </div>
          )}
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={busy || !file || !secret}
          className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-500 disabled:cursor-not-allowed rounded px-4 py-2.5 text-sm font-medium transition-colors"
        >
          {busy ? "Working..." : "Upload & Generate Stories"}
        </button>

        {/* Status */}
        {status !== "idle" && (
          <div className="rounded-lg bg-zinc-900 border border-zinc-800 px-4 py-3 space-y-1">
            <p className={`text-sm font-medium ${statusColor[status]}`}>
              {STATUS_LABELS[status]}
              {(status === "queued" || status === "in_progress") && (
                <span className="ml-2 animate-pulse">...</span>
              )}
            </p>
            {message && <p className="text-xs text-zinc-400">{message}</p>}
            {completedAt && (
              <p className="text-xs text-zinc-500">Completed at {completedAt}</p>
            )}
            {runUrl && (
              <a
                href={runUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-400 hover:underline block mt-1"
              >
                View run on GitHub →
              </a>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
