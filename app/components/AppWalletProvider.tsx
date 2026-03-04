"use client";

import React, { useMemo, useEffect, useState } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { PhantomWalletAdapter, SolflareWalletAdapter } from "@solana/wallet-adapter-wallets";
import { SolanaMobileWalletAdapter, createDefaultAddressSelector, createDefaultAuthorizationResultCache, createDefaultWalletNotFoundHandler } from "@solana-mobile/wallet-adapter-mobile";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { clusterApiUrl } from "@solana/web3.js";
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import type { Adapter } from "@solana/wallet-adapter-base";

import "@solana/wallet-adapter-react-ui/styles.css";

// Chrome WebView blocks intent:// URLs — route through Capacitor's Browser.open which calls
// startActivity(Intent.ACTION_VIEW) natively, triggering the Seeker wallet bottom sheet
if (typeof window !== "undefined") {
    (window as Window & { __openSolanaIntentUrl?: (url: URL) => void }).__openSolanaIntentUrl = (url: URL) => {
        if (Capacitor.isNativePlatform()) {
            Browser.open({ url: url.toString() }).catch(() => {
                window.location.assign(url);
            });
        } else {
            window.location.assign(url);
        }
    };
}

export default function AppWalletProvider({ children }: { children: React.ReactNode }) {
    const network = WalletAdapterNetwork.Mainnet;
    const endpoint = useMemo(() => clusterApiUrl(network), [network]);
    const [wallets, setWallets] = useState<Adapter[]>([]);

    useEffect(() => {
        const setupWallets = async () => {
            const mobileWalletAdapter = new SolanaMobileWalletAdapter({
                addressSelector: createDefaultAddressSelector(),
                appIdentity: {
                    name: "Gossip Intelligence",
                    // NEXT_PUBLIC_APP_URL is set in next.config.mjs (falls back to the Vercel deployment)
                    uri: process.env.NEXT_PUBLIC_APP_URL ?? "https://gossip-app.vercel.app",
                    icon: `${process.env.NEXT_PUBLIC_APP_URL ?? "https://gossip-app.vercel.app"}/icon.png`,
                },
                authorizationResultCache: createDefaultAuthorizationResultCache(),
                cluster: WalletAdapterNetwork.Mainnet,
                onWalletNotFound: createDefaultWalletNotFoundHandler(),
            });

            setWallets([
                mobileWalletAdapter,
                new PhantomWalletAdapter(),
                new SolflareWalletAdapter(),
            ]);
        };

        setupWallets();
    }, []);

    return (
        <ConnectionProvider endpoint={endpoint}>
            <WalletProvider wallets={wallets} autoConnect={true}>
                <WalletModalProvider>{children}</WalletModalProvider>
            </WalletProvider>
        </ConnectionProvider>
    );
}
