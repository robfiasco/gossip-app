"use client";

import React, { useEffect, useRef, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import MatrixBanner from "./MatrixBanner";
import { getKickerClass, getKickerColor } from "../lib/categories";


import { Capacitor } from "@capacitor/core";

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

const PALETTE_3 = ["accent-purple", "accent-cyan", "accent-pink", "accent-green"];
const ROW_BANNER_COLORS = ["#9945FF", "#00C2FF", "#FF00FF", "#14F195"];

function LockedCard({ story, idx }) {
  let cat = String(story?.category || "Intel").toUpperCase();
  if (cat.includes("/")) cat = cat.split("/")[0].trim();

  const title = String(story?.title || "Untitled Intelligence");
  const preview = compact(
    story?.content?.signal || story?.summary || story?.hook || story?.narrative || "",
    160,
  );

  const kickerCls = getKickerClass(cat);
  const bannerColor = kickerCls ? getKickerColor(cat) : ROW_BANNER_COLORS[idx % 4];

  return (
    <div
      className={`seeker-mag-item ${PALETTE_3[idx % 4]}`}
      style={{ textAlign: "left", width: "100%", padding: 0 }}
    >
      <div className="seeker-mag-item-banner" style={{ overflow: "hidden" }}>
        <MatrixBanner color={bannerColor} />
      </div>

      <div className="seeker-mag-item-head">
        <span className={`seeker-mag-kicker ${kickerCls}`} style={{ padding: 0, fontSize: "0.6rem" }}>
          {cat}
        </span>
      </div>

      <h3 className="seeker-mag-item-title">
        {title}
      </h3>

      {preview && (
        <p className="seeker-mag-item-copy" style={{ filter: "blur(4px)", userSelect: "none", pointerEvents: "none" }}>
          {preview}
        </p>
      )}
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
  const isWrongDevice = variant === "wrong-device";
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
    <section className="morning-open">
      <div className="morning-panel intel-card card--briefing">

        {/* Paywall CTA Block (Placed OVER the blurred stories) */}
        <div style={{
          padding: "24px 18px 24px",
          textAlign: "center"
        }}>
          <p className="gossip-paywall-overline" style={{ color: "#4cbb17" }}>SEEKER INTELLIGENCE</p>
          <h2 className="gossip-paywall-headline" style={{ fontSize: "1.4rem", marginBottom: "12px", color: "var(--text)" }}>
            {isWrongDevice ? "Seeker Device Required" : isNoToken ? "Seeker Token Not Found" : "Seeker Mobile Required"}
          </h2>
          <p className="gossip-paywall-body" style={{ color: "rgba(255,255,255,0.6)", fontSize: "0.85rem", marginBottom: "20px", lineHeight: "1.5" }}>
            {isWrongDevice
              ? "This intelligence terminal is strictly encrypted for the Solana Seeker mobile device. Web and desktop browser access is prohibited."
              : isNoToken
                ? `Wallet ${publicKey?.toBase58().slice(0, 4)}…${publicKey?.toBase58().slice(-4)} doesn't hold the Genesis token.`
                : "This intel is exclusive to Solana Seeker Mobile holders. Connect your wallet to unlock today's full stories."}
          </p>
          <div style={{ display: isWrongDevice ? "none" : "block" }}>
            <button className="gossip-paywall-cta" onClick={onConnect} style={{ width: "100%", maxWidth: "260px", margin: "0 auto" }}>
              {isNoToken ? "Get Seeker Token  ↗" : "Connect Wallet"}
            </button>
          </div>
          <div className="gossip-paywall-secondary-row" style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "8px", alignItems: "center" }}>
            <button className="gossip-paywall-link" style={{ color: "rgba(16, 185, 129, 0.8)", fontWeight: "500", letterSpacing: "0.05em" }} onClick={onBypass}>Hackathon Judge Bypass</button>
            {(isNoToken || isWrongDevice) && (
              <button className="gossip-paywall-link" onClick={onDisconnect}>Disconnect</button>
            )}
          </div>
        </div>

        <div className="briefing-card-stack" style={{ position: "relative" }}>
          <div style={{
            position: "absolute",
            bottom: 0, left: 0, right: 0, height: "120px",
            background: "linear-gradient(to bottom, rgba(12,15,24,0) 0%, var(--surface) 100%)",
            zIndex: 10,
            pointerEvents: "none"
          }} />

          {stories.length > 0
            ? stories.slice(0, 3).map((s, i) => <LockedCard key={i} story={s} idx={i} />)
            : [0, 1, 2].map((i) => <PlaceholderCard key={i} />)
          }
        </div>
      </div>
    </section>
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
  const { publicKey, connected, wallet, disconnect, select, connect: connectWallet } = useWallet();
  const { setVisible } = useWalletModal();
  const mwaConnectPending = useRef(false);

  const [hasSeeker, setHasSeeker] = useState(() => {
    if (typeof window !== "undefined") {
      // Persist across sessions — cleared on explicit disconnect
      if (window.localStorage.getItem("gossip_seeker_verified") === "true") return true;
    }
    return false;
  });
  const [wrongDevice, setWrongDevice] = useState(false);
  const [checking, setChecking] = useState(false);

  // autoConnect only fires when readyState===Installed; MWA may report Loadable in a WebView.
  // Watch for the adapter being set AND for the pending flag, then connect manually.
  // The setTimeout handles the case where MWA is already the selected adapter (select() is a
  // no-op and doesn't trigger a state change, so we can't rely on the dep array alone).
  useEffect(() => {
    if (!mwaConnectPending.current) return;
    if (!wallet?.adapter?.name?.toLowerCase().includes("mobile wallet")) return;
    if (connected) return;
    mwaConnectPending.current = false;
    connectWallet().catch(() => {});
  }, [wallet?.adapter?.name, connected]);

  useEffect(() => {
    const checkOwnership = async () => {
      if (!publicKey || !connected) { setHasSeeker(false); setWrongDevice(false); return; }
      setChecking(true);
      setWrongDevice(false);
      try {
        const adapterName = wallet?.adapter?.name || "";
        const isMWA = adapterName.toLowerCase().includes("mobile wallet") || adapterName.toLowerCase().includes("mwa");

        if (!isMWA) {
          setWrongDevice(true);
          setHasSeeker(false);
          return;
        }

        // Connected via Mobile Wallet Adapter — persist so re-opens don't require reconnect
        window.localStorage.setItem("gossip_seeker_verified", "true");
        setHasSeeker(true);
      } catch (err) {
        setHasSeeker(false);
      } finally {
        setChecking(false);
      }
    };
    checkOwnership();
  }, [publicKey, connected, wallet, connection]);

  const handleConnect = () => {
    // On native Android, skip the wallet selection modal and go straight to MWA
    // — fires the solana-wallet:// intent that triggers the robfiasco.skr bottom sheet
    const isNative = Capacitor?.isNativePlatform?.() && Capacitor?.getPlatform?.() === "android";
    if (isNative) {
      mwaConnectPending.current = true;
      select("Mobile Wallet Adapter");
      // Fallback: if MWA is already selected the dep-array effect won't re-fire,
      // so also attempt connect() after a tick directly.
      setTimeout(() => {
        if (!mwaConnectPending.current) return; // effect already handled it
        mwaConnectPending.current = false;
        connectWallet().catch(() => {});
      }, 100);
    } else {
      setVisible(true);
    }
  };
  const handleDisconnect = () => {
    window.localStorage.removeItem("gossip_seeker_verified");
    setHasSeeker(false);
    disconnect();
  };

  if (!connected && !hasSeeker) {
    return <GossipPaywall variant="not-connected" onConnect={handleConnect} onBypass={() => {
      if (typeof window !== "undefined") {
        window.localStorage.setItem("gossip_seeker_verified", "true");
      }
      setHasSeeker(true);
    }} peekData={peekData} />;
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

  if (wrongDevice) {
    return (
      <GossipPaywall
        variant="wrong-device"
        onConnect={handleConnect}
        publicKey={publicKey}
        onDisconnect={handleDisconnect}
        onBypass={() => { setWrongDevice(false); setHasSeeker(true); }}
        peekData={peekData}
      />
    );
  }

  if (!hasSeeker) {
    return (
      <GossipPaywall
        variant="no-token"
        onConnect={handleConnect}
        publicKey={publicKey}
        onDisconnect={handleDisconnect}
        onBypass={() => setHasSeeker(true)}
        peekData={peekData}
      />
    );
  }

  return children;
}
