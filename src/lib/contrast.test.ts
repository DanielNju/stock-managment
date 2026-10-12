/// <reference types="node" />
// Checks the colour tokens in src/index.css meet WCAG AA (4.5:1) for every text/background pair the app uses,
// in both light and dark mode. This is what would have caught low-contrast avatars and unreadable dark-mode buttons.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../index.css", import.meta.url), "utf8");
const vars = (block: string) => Object.fromEntries([...block.matchAll(/--([a-z-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]));
const light = vars(css.match(/:root\s*{([^}]*)}/)![1]);
const dark = { ...light, ...vars(css.match(/prefers-color-scheme:\s*dark\)\s*{\s*:root\s*{([^}]*)}/)![1]) };

const lum = (hex: string) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// [text token, background token, where it is used]
const PAIRS: [string, string, string][] = [
  ["text", "bg", "body text"], ["text", "surface", "card text"], ["text", "primary-soft", "demo banner"],
  ["muted", "bg", "secondary text on page"], ["muted", "surface", "secondary text in cards"],
  ["primary-dark", "surface", "links, selected chips"], ["primary-dark", "bg", "links on the page"],
  ["primary-dark", "primary-soft", "avatars, active nav item, selected toggles"],
  ["on-primary", "primary-dark", "primary buttons"],
  ["success", "surface", "ok badge"], ["warning", "surface", "warning badge"], ["danger", "surface", "danger badge"],
  ["success", "bg", "status message"], ["warning", "bg", "warning text on page"], ["danger", "bg", "error text on page"],
];

for (const [mode, t] of [["light", light], ["dark", dark]] as const)
  describe(`contrast: ${mode} mode`, () => {
    for (const [fg, bg, use] of PAIRS) it(`${fg} on ${bg} (${use}) is at least 4.5:1`, () => {
      expect(t[fg], `token --${fg}`).toBeTruthy(); expect(t[bg], `token --${bg}`).toBeTruthy();
      expect(ratio(t[fg], t[bg])).toBeGreaterThanOrEqual(4.5);
    });
  });
