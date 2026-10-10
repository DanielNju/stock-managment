// Phone-size end-to-end checks: dashboard numbers, slow stock, offline sales, stock arithmetic, "saved on this device" messaging, no sideways scrolling.
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

const num = (t) => Number(String(t).replace(/[^0-9.]/g, ""));
const dashNum = async (p, label) => { await nav(p, "Dashboard"); await p.getByText(label, { exact: true }).first().waitFor(); return num(await p.getByText(label, { exact: true }).first().locator("xpath=following-sibling::span[1]").textContent()); };
const bodyHas = async (p, needs) => { const t = await p.locator("body").innerText(); const missing = needs.filter((n) => !(n instanceof RegExp ? n.test(t) : t.includes(n))); if (missing.length) throw new Error("missing on screen: " + missing.join(" | ")); return t; };
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

await check("5. dashboard sales and gross profit move by exactly the right amounts, and return after a cancel", async () => {
  const s0 = await dashNum(page, "Today's sales"), p0 = await dashNum(page, "Est. gross profit");
  await sell(page, "Maize Flour 2kg", 3); // 3 x (KES 145 price - KES 120 cost)
  const s1 = await dashNum(page, "Today's sales"), p1 = await dashNum(page, "Est. gross profit");
  if (s1 - s0 !== 435 || p1 - p0 !== 75) throw new Error(`expected sales +435 and profit +75, got +${s1 - s0} and +${p1 - p0}`);
  await nav(page, "Sales"); await page.getByRole("button", { name: "History" }).click();
  await page.locator("ul li").first().locator("button").first().click();
  await page.getByRole("button", { name: "Cancel sale" }).first().click(); await page.getByRole("button", { name: /Yes, cancel/ }).click();
  await page.getByRole("button", { name: /Yes, cancel/ }).waitFor({ state: "hidden", timeout: 5000 });
  const s2 = await dashNum(page, "Today's sales"), p2 = await dashNum(page, "Est. gross profit");
  if (s2 !== s0 || p2 !== p0) throw new Error(`after cancel expected ${s0}/${p0}, got ${s2}/${p2}`);
  return `sales ${s0} -> ${s1} -> ${s2}; profit ${p0} -> ${p1} -> ${p2}`;
});
let flour0, flourReceipt;
await check("3a. a sale reduces stock by exactly the quantity sold", async () => {
  flour0 = await stockOf(page, "Maize Flour 2kg");
  flourReceipt = await sell(page, "Maize Flour 2kg", 3);
  const after = await stockOf(page, "Maize Flour 2kg");
  if (after !== flour0 - 3) throw new Error(`expected ${flour0 - 3}, got ${after}`);
  return `${flour0} -> ${after}`;
});
await check("3b. cancelling that sale returns the stock", async () => {
  await nav(page, "Sales"); await page.getByRole("button", { name: "History" }).click();
  await page.locator("ul li").first().locator("button").first().click();
  await page.getByRole("button", { name: "Cancel sale" }).first().click();
  await page.getByRole("button", { name: /Yes, cancel/ }).click();
  await page.getByRole("button", { name: /Yes, cancel/ }).waitFor({ state: "hidden", timeout: 5000 });
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

await check("6a. summary shows today's sales, estimated gross profit, inventory value and low stock", async () => {
  await nav(page, "Dashboard"); await bodyHas(page, ["Today's sales", "Est. gross profit", "Inventory value", "Low stock"]);
});
await check("6b. needs attention: every kind is visible by default, and Show all reveals the rest", async () => {
  await nav(page, "Dashboard");
  await bodyHas(page, ["Low stock", "Count mismatch", "Partly received"]); // one of each kind without expanding
  await bodyHas(page, [/Awaiting delivery|Partly received/]);
  await page.getByRole("button", { name: /^Show all \d+/ }).click();
  await bodyHas(page, ["Milk 500ml", "Sugar 1kg", "Rice 2kg", "Maize Flour 2kg", /2 short/, "50 of 80 units received", "Awaiting delivery", "PO-1002", "PO-1003"]);
  await page.getByRole("button", { name: "Show fewer" }).click();
});
await check("6c. trend chart has a 30-day view; totals and stock losses are right", async () => {
  await nav(page, "Dashboard");
  await need(page.locator('[role="img"][aria-label^="Sales and estimated gross profit"] svg'), "chart drawn");
  const s7 = num(await page.getByText("Sales, 7 days", { exact: true }).locator("xpath=following-sibling::p[1]").textContent());
  await page.getByRole("button", { name: "30 days" }).first().click();
  const s30 = num(await page.getByText("Sales, 30 days", { exact: true }).locator("xpath=following-sibling::p[1]").textContent());
  if (!(s30 > s7)) throw new Error(`30-day sales (${s30}) should exceed 7-day sales (${s7})`);
  const loss = num(await page.getByText("Stock losses", { exact: true }).locator("xpath=following-sibling::p[1]").textContent());
  if (loss !== 2310) throw new Error(`expected stock losses KES 2,310 (sugar 8 x 150 + rice 3 x 290 + flour 2 x 120), got ${loss}`);
  return `sales 7d ${s7}, 30d ${s30}; losses ${loss}`;
});
await check("6d. top products: ranked table with profit and margin", async () => {
  await nav(page, "Dashboard");
  const rows = page.locator("table").first().locator("tbody tr"); const n = await rows.count();
  if (n < 3) throw new Error("fewer than 3 products ranked");
  const sales = []; for (let i = 0; i < n; i++) sales.push(num(await rows.nth(i).locator("td").nth(2).textContent()));
  if (sales.some((v, i) => i && v > sales[i - 1])) throw new Error("not ranked by sales: " + sales.join(","));
  await page.getByRole("button", { name: "By profit" }).click();
  const profit = []; for (let i = 0; i < n; i++) profit.push(num(await rows.nth(i).locator("td").nth(3).textContent()));
  if (profit.some((v, i) => i && v > profit[i - 1])) throw new Error("not ranked by profit: " + profit.join(","));
  return `${n} products; sales ${sales.join(",")}`;
});
await check("6e. stock analysis: restock suggestions, slow-moving, and inventory value that matches the card", async () => {
  await nav(page, "Dashboard");
  const card = num(await page.getByText("Inventory value", { exact: true }).first().locator("xpath=following-sibling::span[1]").textContent());
  const restock = page.locator("table").filter({ hasText: "Suggested" }).first();
  const milk = restock.locator("tbody tr", { hasText: "Milk 500ml" }); await milk.waitFor({ timeout: 4000 });
  const sugg = num(await milk.locator("td").nth(5).textContent()); if (!(sugg > 0)) throw new Error("no suggested quantity for low Milk");
  await bodyHas(page, ["Estimated cost of suggested orders"]);
  await page.getByRole("button", { name: /^Slow-moving \(/ }).click();
  await bodyHas(page, ["Soap Bar", "Biscuits Pack", "Tied up in slow stock", "KES 2,710"]);
  await page.getByRole("button", { name: /^Inventory value/ }).click();
  const total = num(await page.locator("tfoot td").nth(3).textContent());
  if (total !== card) throw new Error(`category total ${total} differs from the Inventory value card ${card}`);
  await bodyHas(page, ["Groceries", "Beverages", "Share"]);
  return `milk suggested ${sugg}; value ${card}`;
});
await check("6f. activity feed: each filter isolates its own kind of event", async () => {
  await nav(page, "Dashboard");
  const pick = (re) => page.getByRole("button", { name: re }).click();
  await pick(/^Sales \(/); await bodyHas(page, [flourReceipt, "Today"]);
  if ((await page.locator("body").innerText()).includes("returned to stock")) throw new Error("Sales filter shows cancellations");
  await pick(/^Cancellations \(/); await bodyHas(page, ["returned to stock", "cancelled"]);
  if ((await page.locator("body").innerText()).includes("Paid in cash")) throw new Error("Cancellations filter shows sales");
  await pick(/^Deliveries \(/); await bodyHas(page, ["received a delivery", "PO-1002", "PO-1001"]);
  await pick(/^Adjustments & counts \(/); await bodyHas(page, ["Sugar 1kg", "adjusted stock", "counted stock", /Maize Flour 2kg: 2 short/, "Damaged"]);
});
await check("7. no screen scrolls sideways on a 390px phone", async () => {
  const bad = [];
  for (const path of ["/", "/sales", "/inventory", "/products", "/purchases", "/settings", "/purchases/new"]) {
    await page.goto(URL + path); await page.getByRole("heading", { level: 1 }).first().waitFor(); await page.waitForTimeout(500);
    const w = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    if (w.sw > w.cw + 1) bad.push(`${path} is ${w.sw}px wide`);
  }
  if (bad.length) throw new Error(bad.join("; "));
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
