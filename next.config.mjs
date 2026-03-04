import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const { version } = require("./package.json");

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    // Force Next to use this repo as root (prevents wrong root inference from parent lockfiles).
    root: __dirname,
  },
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
    // Override via Vercel env var to decouple app URL from the project URL
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? "https://gossip-app.vercel.app",
  },
};

export default nextConfig;
