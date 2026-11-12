import type { CapacitorConfig } from "@capacitor/cli";
import { readFileSync } from "node:fs";

const brand = JSON.parse(readFileSync("./brand.json", "utf8"));

const config: CapacitorConfig = {
  appId: brand.packageId,
  appName: brand.name,
  webDir: "dist",
  // Capacitor bundles this same production build for Android and iOS.
};

export default config;