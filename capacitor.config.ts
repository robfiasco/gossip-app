import type { CapacitorConfig } from "@capacitor/cli";

/**
 * WARNING: server.url points to the Vercel production deployment.
 * Any change here requires an APK rebuild: npx cap sync android && ./gradlew assembleDebug
 */

const config: CapacitorConfig = {
    appName: "Gossip",
    server: {
        url: "https://gossip-app.vercel.app",
        cleartext: false,
    },
    webDir: "out", // Required by Capacitor even when using a remote server URL
    android: {
        allowMixedContent: false,
    },
};

export default config;
