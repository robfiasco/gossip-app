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

/* ─── Paywall component ──────────────────────────────────────────────── */
function GossipPaywall({ onConnect, variant = "not-connected", publicKey, onDisconnect, onBypass, peekData }) {
  const isNoToken = variant === "no-token";
  const lead = peekData?.lead;
  const leadCategory = String(lead?.category || "TODAY'S TOP STORY");
  const kicker = leadCategory.toUpperCase();
  const leadIsCritical = /security|risk|breach|exploit|hack/i.test(leadCategory);
  const leadIsAi = /ai|agent/i.test(leadCategory);
  const leadIsGaming = /gaming|game/i.test(leadCategory);
  const peekBody =
    lead?.content?.signal ||
    lead?.summary ||
    lead?.hook ||
    lead?.narrative ||
    lead?.title ||
    "Today's intelligence covers the dominant narratives moving the Solana ecosystem, ranked by on-chain signal and crypto-twitter engagement.";

  return (
    <div style={{ position: "relative", overflow: "hidden" }}>

      {/* ── Readable content peek — fades out mid-paragraph ─── */}
      <div
        style={{
          WebkitMaskImage: "linear-gradient(to bottom, black 0%, black 55%, transparent 82%)",
          maskImage: "linear-gradient(to bottom, black 0%, black 55%, transparent 82%)",
          pointerEvents: "none",
          userSelect: "none",
          paddingBottom: "120px",
        }}
      >
        <div className="seeker-peek-shell">

          {/* Real stats bar — same classes as full content */}
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

          {/* Real story — kicker + title + byline + body */}
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
      </div>

      {/* ── Progressive blur overlay — sits on top of the lower peek zone ── */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          bottom: "120px", /* align with where the paywall panel starts */
          left: 0,
          right: 0,
          height: "160px",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 70%)",
          maskImage: "linear-gradient(to bottom, transparent 0%, black 70%)",
          pointerEvents: "none",
          zIndex: 4,
        }}
      />


      {/* ── Solid paywall panel ────────────────────────────── */}
      <div className="gossip-paywall-panel">
        <div className="gossip-paywall-gradient" />
        <div className="gossip-paywall-card">
          <div className="gossip-paywall-rule" />
          <p className="gossip-paywall-overline">SEEKER INTELLIGENCE</p>
          <h2 className="gossip-paywall-headline">
            {isNoToken ? "Seeker Token Not Found" : "Seeker Mobile Required"}
          </h2>
          <p className="gossip-paywall-body">
            {isNoToken
              ? `Wallet ${publicKey?.toBase58().slice(0, 4)}…${publicKey?.toBase58().slice(-4)} doesn't hold the Genesis token. Get access to daily alpha, CT narratives, and deep positioning intel.`
              : "This intel is exclusive to Solana Seeker Mobile holders. Connect your wallet to verify and unlock today's full stories."}
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
    </div >
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
          <div style={{ color: "#10b981", fontSize: "14px" }}>Verifying…</div>
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
