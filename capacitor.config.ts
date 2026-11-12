import type { CapacitorConfig } from "@capacitor/cli";
import { readFileSync } from "node:fs";

const brand = JSON.parse(readFileSync("./brand.json", "utf8"));

const config: CapacitorConfig = {
  appId: brand.packageId,
  appName: brand.name,
  webDir: "dist",
  // Keep the existing PWA service worker and manifest working inside the
  // bundled shell. Capacitor serves files from webDir, so the same build
  // output works for web, Android and iOS.
  plugins: {
    // No extra Capacitor plugins are needed yet: the app stores data in
    // IndexedDB (which works in the bundled web view) and the existing
    // service worker handles offline caching.
  },
  // Android: full-screen Trusted Web Activity (no browser chrome).
  android: {
    buildOptions: {
      keystorePath: undefined,
      keystorePassword: undefined,
    },
  },
  // iOS: full-screen WKWebView, no Safari chrome.
  ios: {
    contentPath: "public",
  },
};

export default config;