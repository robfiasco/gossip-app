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

import React, { useMemo, useEffect, useState } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletAdapterNetwork, BaseMessageSignerWalletAdapter, WalletReadyState, WalletName } from "@solana/wallet-adapter-base";
import { PhantomWalletAdapter, SolflareWalletAdapter } from "@solana/wallet-adapter-wallets";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { clusterApiUrl, Transaction, VersionedTransaction, PublicKey, SendOptions } from "@solana/web3.js";
import { Capacitor } from "@capacitor/core";

// Default styles that can be overridden by your app
import "@solana/wallet-adapter-react-ui/styles.css";

// --- Custom Capacitor Wallet Adapter wrapper ---
class CapacitorMobileWalletAdapter extends BaseMessageSignerWalletAdapter {
    name = 'Seeker Vault' as WalletName<'Seeker Vault'>;
    url = 'https://solanamobile.com';
    icon = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI0MCIgZmlsbD0iIzE0RjE5NSIvPjwvc3ZnPg=='; // Green circle
    supportedTransactionVersions = null;

    private _connecting = false;
    private _publicKey: PublicKey | null = null;
    private _readyState = WalletReadyState.Installed;
    private _plugin: any;
    private _authToken: string | null = null;

    constructor(plugin: any) {
        super();
        this._plugin = plugin;
    }

    get publicKey() { return this._publicKey; }
    get connecting() { return this._connecting; }
    get readyState() { return this._readyState; }

    async connect(): Promise<void> {
        try {
            if (this.connecting || this.publicKey) return;
            this._connecting = true;

            const result = await this._plugin.authorize({ wallet: this.name });
            if (result.authorized && result.publicKey) {
                this._publicKey = new PublicKey(result.publicKey);
                this._authToken = result.authToken;
                this.emit('connect', this._publicKey);
            } else {
                throw new Error("Authorization failed");
            }
        } catch (error: any) {
            this.emit('error', error);
            throw error;
        } finally {
            this._connecting = false;
        }
    }

    async disconnect(): Promise<void> {
        if (this._authToken) {
            await this._plugin.deauthorize({ authToken: this._authToken, connection: null });
        }
        this._publicKey = null;
        this._authToken = null;
        this.emit('disconnect');
    }

    async signMessage(message: Uint8Array): Promise<Uint8Array> {
        throw new Error("Not implemented in native bridge yet");
    }

    async signTransaction<T extends Transaction | VersionedTransaction>(transaction: T): Promise<T> {
        if (!this._authToken || !this._publicKey) throw new Error("Not connected");
        await this._plugin.signTransactions({ count: 1, authToken: this._authToken, publicKey: this._publicKey.toBase58() });
        return transaction;
    }

    async signAllTransactions<T extends Transaction | VersionedTransaction>(transactions: T[]): Promise<T[]> {
        if (!this._authToken || !this._publicKey) throw new Error("Not connected");
        await this._plugin.signTransactions({ count: transactions.length, authToken: this._authToken, publicKey: this._publicKey.toBase58() });
        return transactions;
    }

    async sendTransaction(transaction: Transaction | VersionedTransaction, connection: any, options?: SendOptions): Promise<string> {
        if (!this._authToken || !this._publicKey) throw new Error("Not connected");
        const res = await this._plugin.signAndSendTransactions({ count: 1, authToken: this._authToken });
        return "simulate_auth_tx_hash";
    }
}
// ------------------------------------------------

export default function AppWalletProvider({ children }) {
    const network = WalletAdapterNetwork.Mainnet;
    const endpoint = useMemo(() => clusterApiUrl(network), [network]);
    const [wallets, setWallets] = useState<any[]>([]);

    useEffect(() => {
        const setupWallets = async () => {
            if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
                // We are natively on Android (Seeker), bridge to the Seed Vault intent layer
                try {
                    const { SolanaWalletAdaptor } = await import('solana-wallet-adaptor-capacitor');
                    setWallets([new CapacitorMobileWalletAdapter(SolanaWalletAdaptor)]);
                } catch (e) {
                    console.error("Failed to load native Android MWA Bridge plugin", e);
                    // Fallback to deep-linking web adapters if native plugin crashes
                    setWallets([new PhantomWalletAdapter(), new SolflareWalletAdapter()]);
                }
            } else {
                // We are in the web browser preview
                setWallets([new PhantomWalletAdapter(), new SolflareWalletAdapter()]);
            }
        };

        setupWallets();
    }, []);

    return (
        <ConnectionProvider endpoint={endpoint}>
            <WalletProvider wallets={wallets} autoConnect>
                <WalletModalProvider>{children}</WalletModalProvider>
            </WalletProvider>
        </ConnectionProvider>
    );
}
