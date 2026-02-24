"use client";

import React, { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { PublicKey } from "@solana/web3.js";
import { Activity, MessageCircle, TrendingUp, Users } from "lucide-react";

const SEEKER_MINT_ADDRESS = "2DMMamkkxQ6zDMBtkFp8KH7FoWzBMBA1CGTYwom4QH6Z";

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

/* ─── Locked story card (blurred teaser) ──────────────────────────── */
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

/* ─── Placeholder card when no story data yet ──────────────────────── */
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

/* ─── Paywall component ──────────────────────────────────────────────── */
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
    <div style={{ position: "relative" }}>

      {/* ── SECTION 1: Fully visible content ──────────────────── */}
      <div className="seeker-peek-shell">

        {/* Stats bar */}
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

        <div className="seeker-mag-divider" />

        {/* Lead story: kicker + title + byline */}
        <div className="seeker-mag-kicker-row">
          <span className={`seeker-mag-kicker ${leadIsCritical ? "critical" : leadIsAi ? "ai" : leadIsGaming ? "gaming" : ""}`}>
            {kicker}
          </span>
        </div>
        <h2 className="seeker-mag-title">
          {lead?.title || "Solana's daily intelligence brief — curated from CT"}
        </h2>
        <div className="seeker-mag-meta">
          <span>By AI Gossip News Desk</span>
        </div>
        <p className="seeker-mag-preview">{peekBody}</p>
      </div>

      {/* ── SECTION 2: Blurred story cards + paywall overlay ───── */}
      <div style={{ position: "relative" }}>

        {/* Gradient bridge from visible content into blurred zone */}
        <div style={{
          height: "36px",
          background: "linear-gradient(to bottom, transparent, rgba(10,13,20,0.82))",
          pointerEvents: "none",
        }} />

        {/* Story cards — rendered but blurred */}
        <div
          aria-hidden="true"
          style={{
            filter: "blur(5px)",
            userSelect: "none",
            pointerEvents: "none",
            padding: "0 18px 24px",
            display: "grid",
            gap: "10px",
          }}
        >
          {stories.length > 0
            ? stories.map((s, i) => <LockedCard key={i} story={s} idx={i} />)
            : [0, 1, 2].map((i) => <PlaceholderCard key={i} />)
          }
        </div>

        {/* Paywall overlay — sits on top of the blurred cards */}
        <div style={{
          position: "absolute",
          top: 0, left: 0, right: 0, bottom: 0,
          background: "linear-gradient(to bottom, rgba(10,13,20,0.7) 0%, rgba(10,13,20,0.94) 35%, rgba(10,13,20,0.98) 100%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
          justifyContent: "flex-start",
          padding: "28px 20px 28px",
        }}>
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

/* ─── Main guard ─────────────────────────────────────────────────────── */
export default function SeekerGuard({ children, peekData = null }) {
  const { connection } = useConnection();
  const { publicKey, connected, disconnect } = useWallet();
  const { setVisible } = useWalletModal();
  const [hasSeeker, setHasSeeker] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const checkOwnership = async () => {
      if (!publicKey || !connected) { setHasSeeker(false); return; }
      setChecking(true);
      try {
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
          programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
        });
        const seekerToken = tokenAccounts.value.find((account) => {
          const info = account.account.data.parsed.info;
          return info.mint === SEEKER_MINT_ADDRESS && info.tokenAmount.uiAmount > 0;
        });
        setHasSeeker(!!seekerToken);
      } catch (err) {
        console.error("Error checking Seeker ownership:", err);
        setHasSeeker(false);
      } finally {
        setChecking(false);
      }
    };
    checkOwnership();
  }, [publicKey, connected, connection]);

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
