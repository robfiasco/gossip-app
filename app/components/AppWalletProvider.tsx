"use client";

/**
 * AppWalletProvider
 * 
 * Configures the Solana Wallet Adapter for the application.
 * 
 * ARCHITECTURE NOTE:
 * This app is wrapped in Capacitor for Android. The Mobile Wallet Adapter (MWA)
 * protocol relies on Android Intents which cannot be triggered directly from
 * a Capacitor WebView without a native plugin bridge.
 * 
 * For this reason, we explicitly support Phantom and Solflare standard adapters
 * which function correctly via deep linking/universal links in this environment.
 */

import React, { useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletAdapterNetwork, BaseMessageSignerWalletAdapter } from "@solana/wallet-adapter-base";
import { PhantomWalletAdapter, SolflareWalletAdapter } from "@solana/wallet-adapter-wallets";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { clusterApiUrl } from "@solana/web3.js";

// Default styles that can be overridden by your app
import "@solana/wallet-adapter-react-ui/styles.css";

export default function AppWalletProvider({ children }) {
    const network = WalletAdapterNetwork.Mainnet;
    const endpoint = useMemo(() => clusterApiUrl(network), [network]);

    const wallets = useMemo(
        () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
        // Note: Jupiter wallet is auto-detected via Wallet Standard if available
        [network]
    );

    return (
        <ConnectionProvider endpoint={endpoint}>
            <WalletProvider wallets={wallets} autoConnect>
                <WalletModalProvider>{children}</WalletModalProvider>
            </WalletProvider>
        </ConnectionProvider>
    );
}
