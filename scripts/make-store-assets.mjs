// Captures Google Play screenshots (1080x1920) and the feature graphic (1024x500) from the REAL app, loaded with demo data.
// Needs Playwright:  npm i -D playwright && npx playwright install chromium
// Usage:  npm run build && npx vite preview --port 4176 &   then   node scripts/make-store-assets.mjs http://localhost:4176
import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
const { chromium } = await import("playwright").catch(() => import("playwright-core"));
const base = process.argv[2] ?? "http://localhost:4176";
const brand = JSON.parse(readFileSync(new URL("../brand.json", import.meta.url), "utf8"));
const root = new URL("..", import.meta.url).pathname;
mkdirSync(root + "store/phone-screenshots", { recursive: true }); mkdirSync(root + "public/screenshots", { recursive: true });

const opts = { headless: true, ...(process.env.PW_EXECUTABLE ? { executablePath: process.env.PW_EXECUTABLE, args: (process.env.PW_ARGS ?? "").split(" ").filter(Boolean) } : {}) };
const browser = await chromium.launch(opts);
const ctx = await browser.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 3 }); // 360x640 at 3x = 1080x1920
const page = await ctx.newPage();
await page.goto(base);
await page.getByRole("button", { name: "Load demo data" }).click();
await page.getByRole("heading", { level: 1 }).filter({ hasText: /^Good / }).waitFor();
await page.addStyleTag({ content: '[role="note"]{display:none!important} ::-webkit-scrollbar{display:none}' });
const nav = (label) => page.locator('nav[aria-label="Main"]').getByRole("link", { name: label, exact: true }).click();
const top = (heading) => page.getByRole("heading", { name: heading }).first().evaluate((el) => { window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 76); });
const shot = async (file) => { await page.waitForTimeout(500); await page.screenshot({ path: root + "store/phone-screenshots/" + file }); console.log("captured", file); };

await shot("01-dashboard.png");
await top("Sales and profit"); await shot("02-sales-and-profit.png");
await nav("Sales"); await page.getByRole("button", { name: "New sale", exact: true }).click();
for (const n of ["Coca-Cola 500ml", "Coca-Cola 500ml", "Bread 400g", "Milk 500ml"]) await page.getByRole("button", { name: new RegExp("Add " + n) }).first().click();
await page.getByLabel("Customer", { exact: true }).selectOption({ label: "Wanjiru Kamau" }); await page.evaluate(() => window.scrollTo(0, 0));
await shot("03-new-sale.png");
await page.goto(base + "/"); await page.getByRole("heading", { level: 1 }).filter({ hasText: /^Good / }).waitFor(); await top("Stock analysis"); await shot("04-restock.png");
await nav("Products"); await page.getByRole("heading", { name: "Products", level: 1 }).waitFor(); await shot("05-products.png");
await page.goto(base + "/customers"); await page.getByRole("heading", { name: "Customers", level: 1 }).waitFor(); await shot("06-customers.png");
for (const [i, f] of ["01-dashboard", "02-sales-and-profit", "03-new-sale", "04-restock"].entries()) copyFileSync(`${root}store/phone-screenshots/${f}.png`, `${root}public/screenshots/phone-${i + 1}.png`);

// feature graphic 1024x500: brand colours, the name and tagline, and a real screenshot in a phone frame
const shotUrl = "file://" + root + "store/phone-screenshots/01-dashboard.png";
const html = `<html><body style="margin:0;width:1024px;height:500px;overflow:hidden;font-family:system-ui,'DejaVu Sans',sans-serif;background:linear-gradient(135deg,#E83E8C,#C0286B);color:#fff;position:relative">
<div style="position:absolute;left:56px;top:120px;width:430px"><div style="font-size:26px;font-weight:800;opacity:.95">&#10022; ${brand.name}</div>
<div style="font-size:38px;line-height:1.15;font-weight:800;margin-top:16px">${brand.tagline}</div>
<div style="font-size:19px;line-height:1.35;margin-top:20px;opacity:.95">Stock, sales and purchases for your shop. Works without internet.</div></div>
<div style="position:absolute;right:236px;top:84px;width:188px;height:336px;border-radius:24px;background:#111;padding:7px;box-shadow:0 18px 40px rgba(0,0,0,.3);transform:rotate(-5deg);overflow:hidden">
<img src="file://${root}store/phone-screenshots/03-new-sale.png" style="width:174px;height:310px;border-radius:18px;object-fit:cover;object-position:top"></div>
<div style="position:absolute;right:44px;top:56px;width:200px;height:356px;border-radius:26px;background:#111;padding:8px;box-shadow:0 18px 40px rgba(0,0,0,.35);transform:rotate(4deg);overflow:hidden">
<img src="${shotUrl}" style="width:184px;height:328px;border-radius:19px;object-fit:cover;object-position:top"></div></body></html>`;
writeFileSync("/tmp/feature.html", html);
const fp = await (await browser.newContext({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1 })).newPage();
await fp.goto("file:///tmp/feature.html"); await fp.waitForTimeout(500);
await fp.screenshot({ path: root + "store/feature-graphic.png" }); console.log("captured feature-graphic.png");
await browser.close();
