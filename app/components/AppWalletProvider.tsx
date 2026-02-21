"use client";

import React, { useMemo, useEffect, useState } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { PhantomWalletAdapter, SolflareWalletAdapter } from "@solana/wallet-adapter-wallets";
import { SolanaMobileWalletAdapter, createDefaultAddressSelector, createDefaultAuthorizationResultCache, createDefaultWalletNotFoundHandler } from "@solana-mobile/wallet-adapter-mobile";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { clusterApiUrl } from "@solana/web3.js";
import { Capacitor, registerPlugin } from "@capacitor/core";

const NativeIntent = registerPlugin<any>('NativeIntent');

// Default styles that can be overridden by your app
import "@solana/wallet-adapter-react-ui/styles.css";

// Bypass Chrome's asynchronous intent blockage by proxying the JS string through Capacitor's native layer
if (typeof window !== "undefined") {
    (window as any).__openSolanaIntentUrl = (url: URL) => {
        console.log(`Attempting to open Intent URL: ${url.toString()}`);
        if (Capacitor.isNativePlatform()) {
            console.log(`Native Platform Detected. Triggering NativeIntent bridge...`);
            NativeIntent.openUrl({ url: url.toString() }).then(() => {
                console.log(`NativeIntent successfully fired!`);
            }).catch((err: any) => {
                console.error(`NativeIntent failed:`, err);
            });
        } else {
            console.log(`Web environment detected. Assigning location...`);
            window.location.assign(url);
        }
    };
}

export default function AppWalletProvider({ children }) {
    const network = WalletAdapterNetwork.Mainnet;
    const endpoint = useMemo(() => clusterApiUrl(network), [network]);
    const [wallets, setWallets] = useState<any[]>([]);

    useEffect(() => {
        const setupWallets = async () => {
            const baseWallets = [
                new PhantomWalletAdapter(),
                new SolflareWalletAdapter()
            ];

            if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
                // We are natively on Android (Seeker), use the official Mobile Wallet Adapter
                // This triggers the native Android intents for the Seed Vault natively via our patch
                setWallets([
                    new SolanaMobileWalletAdapter({
                        addressSelector: createDefaultAddressSelector(),
                        appIdentity: {
                            name: "Gossip Intelligence",
                            uri: "https://validator-solana-intelligence.vercel.app",
                            icon: "https://validator-solana-intelligence.vercel.app/icon.png",
                        },
                        authorizationResultCache: createDefaultAuthorizationResultCache(),
                        cluster: WalletAdapterNetwork.Mainnet,
                        onWalletNotFound: createDefaultWalletNotFoundHandler(),
                    }),
                    ...baseWallets
                ]);
            } else {
                // We are in the web browser preview
                setWallets(baseWallets);
            }
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
