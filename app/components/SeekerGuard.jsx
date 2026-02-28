"use client";

import React, { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Activity, MessageCircle, TrendingUp, Users } from "lucide-react";
import AnimatedEngagementChart from "./AnimatedEngagementChart";

// Solana Mobile detection (Capacitor runtime, available on-device)
let Capacitor = null;
try { Capacitor = require("@capacitor/core").Capacitor; } catch { /* web build */ }

// Seeker Genesis Token — each holder has a UNIQUE mint address.
// We verify by checking if any of the wallet's Token-2022 NFTs belongs to this group.
const SEEKER_GROUP = "GT22s89nU4iWFkNXj1Bw6uYhJJWDRPpShHt4Bk8f99Te";
const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const TOKEN_2022_ALT = "TokenzQdBNbequW8uyM9nj2HPEC4bsrghF8RTuPMJM"; // common alias
const TOKEN_CLASSIC = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

const fmt = (n) => {
  const num = Number(n) || 0;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return String(num);
};

const compact = (text, max = 120) => {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  return s.length <= max ? s : s.slice(0, max - 1).trimEnd() + "…";
};

/**
 * Renders a locked story card, showing a blurred teaser for premium intelligence.
 * @param {Object} props - The component props
 * @param {Object} props.story - The story data object
 * @param {number} props.idx - The rank index of the story
 * @returns {JSX.Element} The locked card component
 */
function LockedCard({ story, idx }) {
  const cat = String(story?.category || "Intel").toUpperCase();
  const isCrit = /security|risk|breach|exploit|hack/i.test(cat);
  const isAi = /ai|agent/i.test(cat);
  const isGaming = /gaming|game/i.test(cat);
  const kickerCls = isCrit ? "critical" : isAi ? "ai" : isGaming ? "gaming" : "";
  const title = String(story?.title || "Untitled Intelligence");
  const preview = compact(
    story?.content?.signal || story?.summary || story?.hook || story?.narrative || "",
    110,
  );
  const tweets = Number(story?.metrics?.tweets ?? story?.stats?.total_tweets ?? 0);
  const eng = Number(story?.metrics?.engagement ?? story?.stats?.total_engagement ?? 0);

  return (
    <div
      style={{
        background: "rgba(12, 15, 24, 0.72)",
        border: "1px solid rgba(72, 84, 112, 0.28)",
        borderRadius: "14px",
        padding: "14px 16px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "7px" }}>
        <span className={`seeker-mag-kicker ${kickerCls}`} style={{ fontSize: "0.58rem", padding: 0 }}>{cat}</span>
        {idx === 0 && (
          <span style={{
            fontSize: "0.55rem", fontFamily: "JetBrains Mono, monospace", letterSpacing: "0.1em",
            background: "rgba(20,241,149,0.12)", color: "#14f195",
            border: "1px solid rgba(20,241,149,0.28)", borderRadius: "999px", padding: "2px 8px",
            textTransform: "uppercase",
          }}>Top Story</span>
        )}
      </div>
      <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "#f3f6ff", lineHeight: 1.25, marginBottom: "5px" }}>{title}</div>
      {preview && (
        <div style={{ fontSize: "0.82rem", color: "rgba(175,185,215,0.6)", lineHeight: 1.45 }}>{preview}</div>
      )}
      <div style={{ marginTop: "8px", fontSize: "0.6rem", fontFamily: "JetBrains Mono, monospace", color: "rgba(140,152,185,0.5)", letterSpacing: "0.08em" }}>
        {tweets} tweets · {fmt(eng)} eng
      </div>
    </div>
  );
}

/**
 * Displays a placeholder card skeleton while story data is loading.
 * @returns {JSX.Element} The placeholder card
 */
function PlaceholderCard() {
  return (
    <div style={{
      background: "rgba(12, 15, 24, 0.72)", border: "1px solid rgba(72, 84, 112, 0.22)",
      borderRadius: "14px", padding: "14px 16px",
    }}>
      <div style={{ height: "10px", width: "80px", background: "rgba(100,120,160,0.18)", borderRadius: "4px", marginBottom: "10px" }} />
      <div style={{ height: "14px", width: "90%", background: "rgba(100,120,160,0.14)", borderRadius: "4px", marginBottom: "6px" }} />
      <div style={{ height: "10px", width: "70%", background: "rgba(100,120,160,0.10)", borderRadius: "4px" }} />
    </div>
  );
}

/**
 * Renders the paywall component, prompting the user to connect their wallet
 * or acquire a Seeker Token to access premium content.
 * @param {Object} props - The component props
 * @param {Function} props.onConnect - Callback to initiate wallet connection
 * @param {"not-connected"|"no-token"} props.variant - The current state of the user's access
 * @param {Object} [props.publicKey] - The connected user's public key
 * @param {Function} [props.onDisconnect] - Callback to disconnect wallet
 * @param {Function} [props.onBypass] - Callback to bypass in development mode
 * @param {Object} [props.peekData] - Teaser data shown on the paywall
 * @returns {JSX.Element} The paywall component
 */
function GossipPaywall({ onConnect, variant = "not-connected", publicKey, onDisconnect, onBypass, peekData }) {
  const isNoToken = variant === "no-token";
  const lead = peekData?.lead;
  const stories = peekData?.stories || [];
  const leadCategory = String(lead?.category || "TODAY'S TOP STORY");
  const kicker = leadCategory.toUpperCase();
  const leadIsCritical = /security|risk|breach|exploit|hack/i.test(leadCategory);
  const leadIsAi = /ai|agent/i.test(leadCategory);
  const leadIsGaming = /gaming|game/i.test(leadCategory);
  const peekBody =
    lead?.content?.signal || lead?.summary || lead?.hook ||
    lead?.narrative || lead?.title ||
    "Today's intelligence covers the dominant narratives moving the Solana ecosystem, ranked by on-chain signal and crypto-twitter engagement.";

  return (
    <div>

      {/* ── SECTION 1: Fully visible content ──────────────────── */}
      <div className="seeker-peek-shell">
        <div className="seeker-mag-stats">
          <div className="seeker-mag-stat">
            <i><MessageCircle size={16} strokeWidth={1.8} /></i>
            <strong>{peekData?.tweets || "—"}</strong>
            <span>Tweets Analyzed</span>
          </div>
          <div className="seeker-mag-stat">
            <i className="is-green"><TrendingUp size={16} strokeWidth={1.8} /></i>
            <strong className="is-green">{fmt(peekData?.eng)}</strong>
            <span>Total Engagement</span>
          </div>
          <div className="seeker-mag-stat">
            <i><Users size={16} strokeWidth={1.8} /></i>
            <strong>{peekData?.voices || "—"}</strong>
            <span>Unique Voices</span>
          </div>
          <div className="seeker-mag-stat">
            <i className="is-purple"><Activity size={16} strokeWidth={1.8} /></i>
            <strong className="is-purple">{fmt(peekData?.topTweet)}</strong>
            <span>Top Tweet</span>
          </div>
        </div>

        {stories.length > 0 && (
          <div style={{ marginTop: "16px", marginBottom: "16px", padding: "0 4px" }}>
            <AnimatedEngagementChart
              title="TOP SIGNALS BY NETWORK ENGAGEMENT"
              items={stories.map(s => ({
                label: s?.title || "Unknown Signal",
                value: Number(s?.metrics?.engagement ?? s?.stats?.total_engagement ?? 0)
              })).sort((a, b) => b.value - a.value).slice(0, 5)}
            />
          </div>
        )}

        <div className="seeker-mag-divider" />

        <div className="seeker-mag-kicker-row">
          <span className={`seeker-mag-kicker ${leadIsCritical ? "critical" : leadIsAi ? "ai" : leadIsGaming ? "gaming" : ""}`}>
            {kicker}
          </span>
        </div>
        <h2 className="seeker-mag-title">
          {lead?.title || "Solana's daily intelligence brief — curated from CT"}
        </h2>
        <div className="seeker-mag-meta"><span>By AI Gossip News Desk</span></div>
        <p className="seeker-mag-preview">{peekBody}</p>
      </div>

      {/* ── SECTION 2: Blurred story cards — show 2 as teaser ───── */}
      <div style={{
        padding: "0 18px 20px",
        display: "grid",
        gap: "10px",
        filter: "blur(4px)",
        userSelect: "none",
        pointerEvents: "none",
        opacity: 0.85,
      }}>
        {stories.length > 0
          ? stories.slice(0, 2).map((s, i) => <LockedCard key={i} story={s} idx={i} />)
          : [0, 1].map((i) => <PlaceholderCard key={i} />)
        }
      </div>

      {/* ── SECTION 3: Solid paywall CTA — below the blurred cards */}
      <div style={{
        padding: "4px 18px 28px",
        borderTop: "1px solid rgba(72,84,112,0.28)",
        background: "var(--surface, #0d1117)",
      }}>
        <div style={{ paddingTop: "20px" }}>
          <div className="gossip-paywall-rule" />
          <p className="gossip-paywall-overline">SEEKER INTELLIGENCE</p>
          <h2 className="gossip-paywall-headline">
            {isNoToken ? "Seeker Token Not Found" : "Seeker Mobile Required"}
          </h2>
          <p className="gossip-paywall-body">
            {isNoToken
              ? `Wallet ${publicKey?.toBase58().slice(0, 4)}…${publicKey?.toBase58().slice(-4)} doesn't hold the Genesis token.`
              : "This intel is exclusive to Solana Seeker Mobile holders. Connect your wallet to unlock today's full stories."}
          </p>
          <button className="gossip-paywall-cta" onClick={onConnect}>
            {isNoToken ? "Get Seeker Token  ↗" : "Connect Wallet"}
          </button>
          {isNoToken && (
            <div className="gossip-paywall-secondary-row">
              {process.env.NODE_ENV === "development" && (
                <button className="gossip-paywall-link" onClick={onBypass}>Dev Bypass</button>
              )}
              <button className="gossip-paywall-link" onClick={onDisconnect}>Disconnect</button>
            </div>
          )}
          {!isNoToken && (
            <p className="gossip-paywall-sub">
              ALREADY HOLDING?{" "}
              <button className="gossip-paywall-link" onClick={onConnect}>CONNECT NOW</button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * A higher-order component that acts as a guard for premium content.
 * Validates whether the connected wallet holds a Seeker Genesis Token.
 * @param {Object} props - The component props
 * @param {React.ReactNode} props.children - The protected content to render if authorized
 * @param {Object} [props.peekData] - Content preview data to display on the paywall
 * @returns {JSX.Element} The original content if authorized, or the paywall otherwise
 */
export default function SeekerGuard({ children, peekData = null }) {
  const { connection } = useConnection();
  const { publicKey, connected, wallet, disconnect } = useWallet();
  const { setVisible } = useWalletModal();
  const [hasSeeker, setHasSeeker] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const checkOwnership = async () => {
      if (!publicKey || !connected) { setHasSeeker(false); return; }
      setChecking(true);
      try {
        // ── Tier 1: Running as native Capacitor app ON the Seeker device ──
        if (Capacitor?.isNativePlatform?.() && Capacitor?.getPlatform?.() === "android") {
          console.log("[SeekerGuard] Native Android detected — granting access");
          setHasSeeker(true);
          return;
        }

        // ── Tier 2: Connected via Solana Mobile Wallet Adapter (MWA) ──
        const adapterName = wallet?.adapter?.name || "";
        if (adapterName.toLowerCase().includes("mobile wallet") || adapterName.toLowerCase().includes("mwa")) {
          console.log("[SeekerGuard] Mobile Wallet Adapter detected — granting access");
          setHasSeeker(true);
          return;
        }

        // ── Tier 3: Server-side check (reliable, no browser rate limits) ──
        const res = await fetch(`/api/verify-seeker?wallet=${encodeURIComponent(publicKey.toBase58())}`);
        if (!res.ok) { setHasSeeker(false); return; }
        const { hasSeeker: found } = await res.json();
        console.log("[SeekerGuard] Server verify result:", found);
        setHasSeeker(!!found);

      } catch (err) {
        console.error("Error checking Seeker ownership:", err);
        setHasSeeker(false);
      } finally {
        setChecking(false);
      }
    };
    checkOwnership();
  }, [publicKey, connected, wallet, connection]);

  const handleConnect = () => setVisible(true);

  if (!connected) {
    return <GossipPaywall variant="not-connected" onConnect={handleConnect} peekData={peekData} />;
  }

  if (checking) {
    return (
      <div style={{ position: "relative" }}>
        {children}
        <div style={{
          position: "absolute", top: "50%", left: "50%",
          transform: "translate(-50%, -50%)", zIndex: 50,
          background: "rgba(24,24,27,0.95)", border: "1px solid rgba(16,185,129,0.4)",
          borderRadius: "12px", padding: "16px 24px", backdropFilter: "blur(12px)",
        }}>
          <div style={{ color: "#10b981", fontSize: "14px" }}>Verifying Seeker token…</div>
        </div>
      </div>
    );
  }

  if (!hasSeeker) {
    return (
      <GossipPaywall
        variant="no-token"
        onConnect={handleConnect}
        publicKey={publicKey}
        onDisconnect={disconnect}
        onBypass={() => setHasSeeker(true)}
        peekData={peekData}
      />
    );
  }

  return children;
}
