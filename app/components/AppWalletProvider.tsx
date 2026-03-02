"use client";

import React, { useMemo, useEffect, useState } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { PhantomWalletAdapter, SolflareWalletAdapter } from "@solana/wallet-adapter-wallets";
import { SolanaMobileWalletAdapter, createDefaultAddressSelector, createDefaultAuthorizationResultCache, createDefaultWalletNotFoundHandler } from "@solana-mobile/wallet-adapter-mobile";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { clusterApiUrl } from "@solana/web3.js";
import { Capacitor, registerPlugin } from "@capacitor/core";
import type { Adapter } from "@solana/wallet-adapter-base";

const NativeIntent = registerPlugin<{ openUrl: (opts: { url: string }) => Promise<void> }>('NativeIntent');

import "@solana/wallet-adapter-react-ui/styles.css";

// Chrome blocks asynchronous intent URLs — proxy through Capacitor's native layer instead
if (typeof window !== "undefined") {
    (window as Window & { __openSolanaIntentUrl?: (url: URL) => void }).__openSolanaIntentUrl = (url: URL) => {
        if (Capacitor.isNativePlatform()) {
            NativeIntent.openUrl({ url: url.toString() }).catch(() => {
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
                    uri: "https://validator-solana-intelligence.vercel.app",
                    icon: "https://validator-solana-intelligence.vercel.app/icon.png",
                },
                authorizationResultCache: createDefaultAuthorizationResultCache(),
                cluster: WalletAdapterNetwork.Mainnet,
                onWalletNotFound: createDefaultWalletNotFoundHandler(),
            });

            // MWA shows on Seeker/mobile browsers; Phantom and Solflare show when their extension/app is detected
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
