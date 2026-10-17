// Tells you what is still missing before you submit to Google Play:  npm run check:release
import { existsSync, readFileSync, readdirSync } from "node:fs";
const b = JSON.parse(readFileSync("brand.json", "utf8"));
const out = [];
const add = (level, msg) => out.push([level, msg]);
const png = (p) => {
  if (!existsSync(p)) return null;
  const d = readFileSync(p);
  return d.readUInt32BE(16) + "x" + d.readUInt32BE(20);
};

if (/CHANGE-ME/.test(b.packageId))
  add(
    "FAIL",
    "brand.json: packageId is still a placeholder. Choose it once. It can never be changed after upload.",
  );
else if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(b.packageId))
  add(
    "FAIL",
    "brand.json: packageId must look like com.yourname.appname (lowercase letters, digits, underscores, at least two parts).",
  );
else add("PASS", "package id " + b.packageId);
if (/CHANGE-ME/.test(b.developerName))
  add(
    "FAIL",
    "brand.json: developerName is still a placeholder (it appears in the privacy policy).",
  );
if (/CHANGE-ME/.test(b.contactEmail))
  add(
    "FAIL",
    "brand.json: contactEmail is still a placeholder (Google requires a working contact in the privacy policy).",
  );
if (b.name.length > 30)
  add(
    "FAIL",
    `app name "${b.name}" is ${b.name.length} characters. Google Play allows 30.`,
  );
else add("PASS", `app name "${b.name}" (${b.name.length}/30 characters)`);
if (b.name.trim().toLowerCase() === "stockly")
  add(
    "WARN",
    'The name "Stockly" is already used by other inventory apps on Google Play. Pick a distinct name to avoid confusion or a complaint.',
  );
if (!b.siteUrl.startsWith("https://"))
  add("FAIL", "brand.json: siteUrl must be https.");
const dims = {
  "public/icons/icon-192.png": "192x192",
  "public/icons/icon-512.png": "512x512",
  "public/icons/icon-maskable-512.png": "512x512",
  "store/icon-512.png": "512x512",
  "store/feature-graphic.png": "1024x500",
};
for (const [f, want] of Object.entries(dims)) {
  const got = png(f);
  add(
    got === want ? "PASS" : "FAIL",
    `${f} ${got ? got : "is missing"}${got && got !== want ? " (needs " + want + ")" : ""}`,
  );
}
const shots = existsSync("store/phone-screenshots")
  ? readdirSync("store/phone-screenshots").filter((f) => f.endsWith(".png"))
  : [];
add(
  shots.length >= 4 ? "PASS" : "FAIL",
  `${shots.length} phone screenshots (Google needs at least 2, 4 or more is better)`,
);
for (const f of shots) {
  const d = png("store/phone-screenshots/" + f);
  if (d !== "1080x1920")
    add("FAIL", `store/phone-screenshots/${f} is ${d}, expected 1080x1920`);
}
if (!existsSync("public/privacy.html"))
  add("FAIL", "public/privacy.html is missing (run npm run build once)");
else if (!readFileSync("public/privacy.html", "utf8").includes(b.contactEmail))
  add("FAIL", "privacy.html is out of date. Run npm run build.");
else add("PASS", "privacy policy page generated");
add(
  existsSync("dist/index.html") ? "PASS" : "WARN",
  existsSync("dist/index.html")
    ? "production build present"
    : "no production build yet (npm run build)",
);
add(
  "INFO",
  "Not checked here: the live site must serve /privacy.html and, after your first Play upload, /.well-known/assetlinks.json (see store/PLAY-STORE-GUIDE.md).",
);

for (const [l, m] of out) console.log(l.padEnd(5), m);
const fails = out.filter(([l]) => l === "FAIL").length;
console.log(
  `\n${fails ? fails + " thing(s) must be fixed before you submit." : "Nothing blocking."}`,
);
process.exit(fails ? 1 : 0);
