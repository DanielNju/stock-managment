// Phone-size end-to-end checks: slow stock, offline sales, stock arithmetic, "saved on this device" messaging.
// Run:  npm i -D playwright && npx playwright install chromium && npm run build
//       npx vite preview --port 4173 &   then   node e2e/phone-checks.mjs
import { chromium as pw } from "playwright";
import os from "node:os";
import path from "node:path";

const URL = "http://localhost:4173";
const PROFILE = path.join(os.tmpdir(), "stockly-e2e-" + Date.now());
const results = [];
const check = async (name, fn) => {
  try { const note = await fn(); results.push(["PASS", name, note ?? ""]); }
  catch (e) { results.push(["FAIL", name, String(e.message).split("\n")[0].slice(0, 230)]); }
};
const launch = async () => pw.launchPersistentContext(PROFILE, { headless: true, viewport: { width: 390, height: 844 } });
const nav = (p, label) => p.locator('nav[aria-label="Main"]').getByRole("link", { name: label, exact: true }).click();
const need = async (l, what) => { await l.first().waitFor({ timeout: 5000 }).catch(() => { throw new Error("not visible: " + what); }); };
const stockOf = async (p, name) => { await nav(p, "Inventory"); const row = p.locator("li", { hasText: name }).first(); await row.waitFor(); return Number((await row.locator("span.text-xl").first().textContent()).trim()); };
const sell = async (p, name, qty, pay = "Cash") => {
  await nav(p, "Sales"); await p.getByRole("button", { name: "New sale", exact: true }).click();
  await p.getByLabel("Search products").fill(name);
  for (let i = 0; i < qty; i++) await p.getByRole("button", { name: new RegExp("Add " + name) }).first().click();
  await p.getByRole("button", { name: pay, exact: true }).click();
  await p.getByRole("button", { name: "Complete sale" }).click();
  await p.getByText("Sale recorded").waitFor({ timeout: 8000 });
  return (await p.locator("text=/Receipt SL-\\d+/").first().textContent()).match(/SL-\d+/)[0];
};

let ctx = await launch(); let page = await ctx.newPage();
const errors = []; page.on("pageerror", (e) => errors.push(e.message));
await page.goto(URL); await page.getByRole("heading", { level: 1 }).first().waitFor();
await page.evaluate(() => navigator.serviceWorker.ready); await page.reload(); await page.getByRole("heading", { level: 1 }).first().waitFor();

await check("service worker controls the page (needed to start offline)", async () => { if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) throw new Error("no controller"); });

await check("4a. dashboard says data is on this device only and not synced/backed up", async () => {
  const txt = (await page.locator("body").innerText()).toLowerCase();
  if (!/(not (synced|backed up|synchronised|shared))|only on this device|this device only|isn.t (synced|backed up)/.test(txt)) throw new Error("no 'not synced / device only' wording. Header says: " + (await page.locator("header").innerText()).replace(/\s+/g, " ").slice(0, 100));
});

await check("1. slow-moving products can be found (dashboard row leads to the list of which ones)", async () => {
  await nav(page, "Dashboard");
  const row = page.locator("li", { hasText: "haven't sold in 30+ days" }).first();
  await row.waitFor();
  await row.click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(400);
  const body = await page.locator("body").innerText();
  if (!/Soap Bar/.test(body) || !/Biscuits Pack/.test(body)) throw new Error("tapping the slow-stock row doesn't show which products");
  if (/Coca-Cola 500ml/.test(body)) throw new Error("the slow-moving list is not filtered (it also shows Coca-Cola, which sells daily)");
  if (!/Last sold \d+ days ago/.test(body)) throw new Error("rows don't say how long since the last sale");
  return "lists Soap Bar and Biscuits Pack only, with days since last sale";
});
await check("1b. a product added just now is NOT flagged slow", async () => {
  await page.goto(URL + "/products/new"); await page.getByRole("heading", { level: 1 }).first().waitFor();
  await page.getByLabel("Product name").fill("Blue Band 250g"); await page.getByLabel("SKU").fill("BB250");
  await page.getByLabel("Cost price (KES)").fill("90"); await page.getByLabel("Selling price (KES)").fill("110"); await page.getByLabel("Opening stock (optional)").fill("12");
  await page.getByRole("button", { name: "Save product" }).click(); await page.getByText("Blue Band 250g").first().waitFor({ timeout: 6000 });
  await page.goto(URL + "/inventory?filter=slow"); await page.getByRole("heading", { level: 1 }).first().waitFor();
  const body = await page.locator("body").innerText();
  if (/Blue Band/.test(body)) throw new Error("brand-new product shows as slow-moving"); return "not listed";
});
await check("4b. Settings explains: not synced, not backed up, other phones cannot see it", async () => {
  await page.goto(URL + "/settings"); await page.getByRole("heading", { level: 1 }).first().waitFor();
  const t = (await page.locator("body").innerText()).toLowerCase();
  for (const need of ["not synced", "not backed up", "can't see it", "erases it"]) if (!t.includes(need)) throw new Error("missing wording: " + need);
});
await check("4c. Reset demo data asks for confirmation first", async () => {
  await page.getByRole("button", { name: "Reset demo data" }).click();
  await need(page.getByRole("button", { name: "Keep my data" }), "confirmation prompt");
  await page.getByRole("button", { name: "Keep my data" }).click();
});

let flour0;
await check("3a. a sale reduces stock by exactly the quantity sold", async () => {
  flour0 = await stockOf(page, "Maize Flour 2kg");
  await sell(page, "Maize Flour 2kg", 3);
  const after = await stockOf(page, "Maize Flour 2kg");
  if (after !== flour0 - 3) throw new Error(`expected ${flour0 - 3}, got ${after}`);
  return `${flour0} -> ${after}`;
});
await check("3b. cancelling that sale returns the stock", async () => {
  await nav(page, "Sales"); await page.getByRole("button", { name: "History" }).click();
  await page.locator("ul li").first().locator("button").first().click();
  await page.getByRole("button", { name: "Cancel sale" }).first().click();
  await page.getByRole("button", { name: /Yes, cancel/ }).click();
  await page.getByText("Cancelled").first().waitFor({ timeout: 5000 });
  const after = await stockOf(page, "Maize Flour 2kg");
  if (after !== flour0) throw new Error(`expected ${flour0}, got ${after}`);
  return `back to ${after}`;
});
await check("3c. counting 2 fewer sets stock to exactly that and records the difference", async () => {
  await nav(page, "Inventory");
  await page.locator("li", { hasText: "Maize Flour 2kg" }).first().getByRole("button", { name: "Count" }).click();
  await page.getByLabel("Counted quantity for Maize Flour 2kg").fill(String(flour0 - 2));
  await page.getByLabel("Reason for difference").selectOption("Missing");
  await page.getByRole("button", { name: "Confirm count" }).click();
  await page.getByText(/Stock adjusted by −2/).waitFor({ timeout: 5000 });
  const after = await stockOf(page, "Maize Flour 2kg");
  if (after !== flour0 - 2) throw new Error(`expected ${flour0 - 2}, got ${after}`);
  await need(page.getByText("Check −2"), "recent count shows Check −2");
  return `${flour0} -> ${after}`;
});

let receipt, stockBefore;
await check("2a. offline: a sale completes, and the screen says you are offline", async () => {
  stockBefore = await stockOf(page, "Tea Leaves 250g");
  await ctx.setOffline(true);
  receipt = await sell(page, "Tea Leaves 250g", 1, "M-Pesa");
  const hdr = (await page.locator("header").innerText()).toLowerCase();
  if (!/offline/.test(hdr)) throw new Error("the app never says it is offline. Header says: " + hdr.replace(/\s+/g, " "));
  return "sale " + receipt;
});
await check("2b. offline: reloading still opens the app and the sale is in History", async () => {
  await page.reload(); await page.getByRole("heading", { level: 1 }).first().waitFor({ timeout: 8000 });
  await nav(page, "Sales"); await page.getByRole("button", { name: "History" }).click();
  await need(page.getByText(receipt), "sale " + receipt + " in history");
});
await ctx.close();
ctx = await launch(); page = await ctx.newPage(); await ctx.setOffline(true);
await check("2c. offline: after closing and reopening the browser the sale and stock are still there", async () => {
  await page.goto(URL + "/sales"); await page.getByRole("heading", { level: 1 }).first().waitFor({ timeout: 8000 });
  await page.getByRole("button", { name: "History" }).click();
  await need(page.getByText(receipt), "sale " + receipt + " after reopen");
  const s = await stockOf(page, "Tea Leaves 250g");
  if (s !== stockBefore - 1) throw new Error(`expected ${stockBefore - 1}, got ${s}`);
  return `stock ${stockBefore} -> ${s}`;
});
await ctx.setOffline(false);
await check("no uncaught page errors during the run", async () => { if (errors.length) throw new Error(errors[0]); });
await ctx.close();

const w = Math.max(...results.map((r) => r[1].length));
for (const [s, n, note] of results) console.log(`${s}  ${n.padEnd(w)}  ${note}`);
const failed = results.filter((r) => r[0] === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} passed`);

process.exit(failed ? 1 : 0);
