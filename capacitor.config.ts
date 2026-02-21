import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor Configuration
 * 
 * Configures the native Android wrapper.
 * WARNING: The server.url matches the Vercel production deployment.
 * Any changes here require an APK rebuild (npx cap sync android && ./gradlew assembleDebug).
 */

const config: CapacitorConfig = {
    appName: "Gossip",
    // Point to the Vercel deployment so server-side API routes work
    server: {
        url: "https://validator-solana-intelligence.vercel.app",
        cleartext: false,
    },
    webDir: "out", // Required by Capacitor even when using remote URL
    android: {
        allowMixedContent: false,
    },
};

export default config;
