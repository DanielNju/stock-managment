declare const __APP_VERSION__: string; // injected by vite.config.ts from package.json
export const APP_VERSION =
  typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";
