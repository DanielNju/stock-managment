// Phone-size end-to-end checks. Part 1 uses demo data; part 2 is the real-user path on a clean install:
// setup, backup and restore, erase, installability, manifest, privacy page, and no requests to other sites.
// Run:  npm i -D playwright && npx playwright install chromium && npm run build
//       npx vite preview --port 4173 &   then   node e2e/phone-checks.mjs
import { chromium as pw } from "playwright";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

const URL = "http://localhost:4173";
const PROFILE = path.join(os.tmpdir(), "stockly-e2e-" + Date.now());
const results = [];
const check = async (name, fn) => {
  try { const note = await fn(); results.push(["PASS", name, note ?? ""]); }
  catch (e) { results.push(["FAIL", name, String(e.message).split("\n").filter(Boolean).slice(0, 4).join(" | ").slice(0, 600)]); }
};
const launch = async (profile = PROFILE) => pw.launchPersistentContext(profile, { headless: true, viewport: { width: 390, height: 844 } });
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
const seen = async (p, text) => { await p.getByText(text).first().waitFor({ timeout: 5000 }).catch(() => { throw new Error("never appeared: " + text); }); };
const bodyHas = async (p, needs) => { const t = await p.locator("body").innerText(); const missing = needs.filter((n) => !(n instanceof RegExp ? n.test(t) : t.includes(n))); if (missing.length) throw new Error("missing on screen: " + missing.join(" | ")); return t; };
let ctx = await launch(); let page = await ctx.newPage();
const errors = []; page.on("pageerror", (e) => errors.push(e.message));
const foreign = []; ctx.on("request", (r) => { const u = r.url(); if (!u.startsWith(URL) && !u.startsWith("data:") && !u.startsWith("blob:") && !u.startsWith("chrome")) foreign.push(u); });
await page.goto(URL); await page.getByRole("heading", { name: "Set up your shop" }).waitFor(); // a fresh install starts at setup, not with demo data
await page.getByRole("button", { name: "Load demo data" }).click(); await page.getByRole("heading", { level: 1 }).filter({ hasText: /^Good / }).waitFor();
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
  for (const path of ["/", "/sales", "/inventory", "/products", "/purchases", "/settings", "/purchases/new", "/customers", "/customers/new"]) {
    await page.goto(URL + path); await page.getByRole("heading", { level: 1 }).first().waitFor(); await page.waitForTimeout(500);
    const w = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    if (w.sw > w.cw + 1) bad.push(`${path} is ${w.sw}px wide`);
  }
  if (bad.length) throw new Error(bad.join("; "));
});
await check("8. text contrast is at least 4.5:1 on rendered elements, in light AND dark mode", async () => {
  await nav(page, "Dashboard"); await page.getByText("Needs attention").first().waitFor();
  const targets = [["header avatar", 'header button[aria-haspopup="menu"]'], ["active nav item", 'nav[aria-label="Main"] a[aria-current="page"]'], ["primary button", 'main button[class*="bg-pdark"]'],
    ["activity avatar", 'section[aria-label] li span[aria-hidden="true"]'], ["selected toggle", 'button[aria-pressed="true"]'], ["status badge", 'span[class*="text-bad"]'], ["demo banner", '[role="note"]'], ["secondary text", "p.text-muted"]];
  const measure = (sel) => page.evaluate((q) => {
    const el = document.querySelector(q); if (!el) return null;
    const g = Object.assign(document.createElement("canvas"), { width: 1, height: 1 }).getContext("2d", { willReadFrequently: true });
    const px = (c) => { g.clearRect(0, 0, 1, 1); g.fillStyle = "#000"; g.fillStyle = c; g.fillRect(0, 0, 1, 1); return [...g.getImageData(0, 0, 1, 1).data]; };
    const lum = ([r, gg, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(gg) + 0.0722 * f(b); };
    const fg = px(getComputedStyle(el).color); let n = el, bg = null;
    while (n) { const c = px(getComputedStyle(n).backgroundColor); if (c[3] === 255) { bg = c; break; } n = n.parentElement; }
    bg = bg || px(getComputedStyle(document.body).backgroundColor);
    const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x); return (a + 0.05) / (b + 0.05);
  }, sel);
  const bad = [], seen = [];
  for (const scheme of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme: scheme }); await page.waitForTimeout(200);
    for (const [name, sel] of targets) { const r = await measure(sel); if (r === null) { bad.push(`${scheme}: could not find ${name}`); continue; } seen.push(`${scheme}/${name} ${r.toFixed(1)}`); if (r < 4.5) bad.push(`${scheme}: ${name} is ${r.toFixed(2)}:1`); }
  }
  await page.emulateMedia({ colorScheme: "light" });
  if (bad.length) throw new Error(bad.join("; "));
  return `${seen.length} measurements, lowest ${Math.min(...seen.map((x) => Number(x.split(" ").pop()))).toFixed(1)}:1`;
});
await check("9. Customers and Settings are real screens, not placeholders", async () => {
  await page.goto(URL + "/customers"); await page.getByRole("heading", { name: "Customers", level: 1 }).waitFor();
  let t = await bodyHas(page, ["Wanjiru Kamau", "John Otieno", "spent"]); if (/built next|same engine/i.test(t)) throw new Error("Customers still shows placeholder text");
  await page.goto(URL + "/settings"); await page.getByRole("heading", { name: "Settings", level: 1 }).waitFor();
  t = await bodyHas(page, ["Your business", "Staff", "Where your data is", "This device"]); if ((await page.getByLabel("Business name").inputValue()) !== "Demo Shop") throw new Error("business name field is not filled in"); if (/built next|same engine/i.test(t)) throw new Error("Settings still shows placeholder text");
});
let custTotal;
await check("10. a sale to a customer appears in their history and totals; a cancelled sale drops out", async () => {
  await page.goto(URL + "/customers/new"); await page.getByRole("heading", { level: 1 }).first().waitFor();
  await page.getByLabel("Name", { exact: true }).fill("E2E Customer"); await page.getByLabel("Phone (optional)").fill("0799 000 111");
  await page.getByRole("button", { name: "Save customer" }).click(); await page.getByRole("heading", { name: "E2E Customer" }).waitFor({ timeout: 6000 });
  await page.getByRole("link", { name: /New sale for E2E/ }).click(); await page.getByRole("heading", { name: "Sales", level: 1 }).waitFor();
  await page.getByLabel("Search products").fill("Tea Leaves 250g"); await page.getByRole("button", { name: /Add Tea Leaves 250g/ }).first().click();
  if ((await page.getByLabel("Customer", { exact: true }).inputValue()) === "") throw new Error("the customer was not pre-selected on the sale");
  await page.getByRole("button", { name: "Complete sale" }).click(); await page.getByText("Sale recorded").waitFor({ timeout: 8000 });
  await bodyHas(page, ["E2E Customer"]); // named on the receipt
  await page.goto(URL + "/customers"); await page.getByRole("heading", { name: "Customers", level: 1 }).waitFor();
  await page.getByRole("link", { name: /E2E Customer/ }).click(); await page.getByRole("heading", { name: "E2E Customer" }).waitFor();
  const card = async (k) => (await page.getByText(k, { exact: true }).locator("xpath=following-sibling::p[1]").textContent()).trim();
  custTotal = num(await card("Total spent")); const n1 = num(await card("Purchases"));
  if (custTotal !== 120 || n1 !== 1) throw new Error(`expected spent 120 over 1 purchase, got ${custTotal} over ${n1}`);
  const hasDelete = await page.getByRole("button", { name: "Delete", exact: true }).count();
  if (hasDelete) throw new Error("a customer with purchases offers Delete");
  await bodyHas(page, ["Has purchases on record", "Tea Leaves 250g × 1"]);
  await nav(page, "Sales").catch(() => {}); await page.goto(URL + "/sales?tab=history"); await page.getByRole("button", { name: "History" }).waitFor();
  await page.locator("ul li").first().locator("button").first().click();
  await page.getByRole("button", { name: "Cancel sale" }).first().click(); await page.getByRole("button", { name: /Yes, cancel/ }).click();
  await page.getByRole("button", { name: /Yes, cancel/ }).waitFor({ state: "hidden", timeout: 5000 });
  await page.goto(URL + "/customers"); await page.getByRole("link", { name: /E2E Customer/ }).click(); await page.getByRole("heading", { name: "E2E Customer" }).waitFor();
  const after = num(await card("Total spent")), n2 = num(await card("Purchases"));
  if (after !== 0 || n2 !== 0) throw new Error(`after cancelling expected 0 spent over 0 purchases, got ${after} over ${n2}`);
  await bodyHas(page, ["Cancelled"]);
  return "spent 120 -> 0 after the cancel";
});
await check("10b. the same phone number written another way is rejected", async () => {
  await page.goto(URL + "/customers/new"); await page.getByLabel("Name", { exact: true }).fill("Someone Else"); await page.getByLabel("Phone (optional)").fill("+254 799 000 111");
  await page.getByRole("button", { name: "Save customer" }).click();
  await seen(page, "E2E Customer already has that phone number");
});
await check("11. staff: add a person, switch the device to them, and new sales are recorded under their name", async () => {
  await page.goto(URL + "/settings"); await page.getByRole("heading", { name: "Settings", level: 1 }).waitFor();
  await page.getByLabel("New staff name").fill("Wanjiku"); await page.getByRole("button", { name: "Add person" }).click();
  await page.getByRole("button", { name: "Use this device as Wanjiku" }).waitFor({ timeout: 5000 });
  await page.getByRole("button", { name: "Use this device as Wanjiku" }).click();
  await page.locator('header button[aria-label="Account menu, recording as Wanjiku"]').waitFor({ timeout: 5000 });
  await page.getByLabel("New staff name").fill("Wanjiku"); await page.getByRole("button", { name: "Add person" }).click(); await seen(page, "Wanjiku is already on the list");
  await page.locator("li").filter({ has: page.getByText("This device", { exact: true }) }).getByRole("button", { name: "Archive" }).click(); // the row for whoever is using the device
  await seen(page, "This device is set to Wanjiku"); // can't archive the person using the device
  await page.goto(URL + "/"); await page.getByRole("heading", { level: 1 }).first().waitFor(); await bodyHas(page, [/Good (morning|afternoon|evening), Wanjiku/]);
  await sell(page, "Tea Leaves 250g", 1);
  await page.goto(URL + "/"); await page.getByRole("button", { name: /^Sales \(/ }).click(); await bodyHas(page, ["Wanjiku", "sold"]);
});
await check("11b. the avatar opens a menu: who is recording, switch person, settings, back up, privacy; Escape and outside taps close it", async () => {
  await page.goto(URL + "/"); await page.getByRole("heading", { level: 1 }).first().waitFor();
  const btn = page.locator('header button[aria-haspopup="menu"]');
  if ((await btn.getAttribute("aria-expanded")) !== "false") throw new Error("menu should start closed");
  await btn.click(); const menu = page.getByRole("menu", { name: "Account" }); await menu.waitFor({ timeout: 3000 });
  if ((await btn.getAttribute("aria-expanded")) !== "true") throw new Error("aria-expanded not set");
  const t = await menu.innerText(); for (const need of ["Wanjiku", "Recording on this phone", "Switch person", "James", "Mary", "Settings", "Back up your data", "Privacy policy", "no passwords yet"]) if (!t.toLowerCase().includes(need.toLowerCase())) throw new Error("menu is missing: " + need);
  if ((await menu.getByRole("menuitemradio", { name: /Wanjiku/ }).getAttribute("aria-checked")) !== "true") throw new Error("current person is not marked");
  await page.keyboard.press("Escape"); await menu.waitFor({ state: "hidden", timeout: 3000 });
  await btn.click(); await menu.waitFor(); await page.getByRole("heading", { level: 1 }).first().click({ position: { x: 5, y: 5 } }); await menu.waitFor({ state: "hidden", timeout: 3000 });
  await btn.click(); await menu.getByRole("menuitemradio", { name: /James/ }).click(); await menu.waitFor({ state: "hidden", timeout: 3000 });
  await page.locator('header button[aria-label="Account menu, recording as James"]').waitFor({ timeout: 4000 });
  await page.getByRole("heading", { level: 1 }).filter({ hasText: /^Good .*James/ }).waitFor({ timeout: 4000 });
  await page.locator('header button[aria-haspopup="menu"]').click(); await page.getByRole("menuitem", { name: "Back up your data" }).click();
  await page.waitForURL(/\/settings#backup/); await page.getByRole("heading", { name: "Back up your data" }).waitFor();
  await page.locator('header button[aria-haspopup="menu"]').click(); await page.getByRole("menuitem", { name: "Settings" }).click(); await page.waitForURL(/\/settings$/);
  await page.locator('header button[aria-haspopup="menu"]').click(); const href = await page.getByRole("menuitem", { name: "Privacy policy" }).getAttribute("href"); if (href !== "/privacy.html") throw new Error("privacy link is " + href);
  await page.keyboard.press("Escape");
});
await check("12. business name can be changed and shows on the dashboard", async () => {
  await page.goto(URL + "/settings"); await page.getByLabel("Business name").fill("E2E Duka"); await page.getByRole("button", { name: "Save business details" }).click();
  await page.getByText("Saved", { exact: true }).waitFor({ timeout: 5000 });
  await page.goto(URL + "/"); await page.getByRole("heading", { level: 1 }).first().waitFor(); await bodyHas(page, ["at E2E Duka today"]);
  await page.goto(URL + "/settings"); await page.getByLabel("Business name").fill(""); await page.getByRole("button", { name: "Save business details" }).click();
  await seen(page, "Business name is required");
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


// ================= part 2: the real-user path on a clean install =================
const PROFILE2 = path.join(os.tmpdir(), "stockly-e2e2-" + Date.now());
let c2 = await launch(PROFILE2); let p2 = await c2.newPage(); const errors2 = [];
p2.on("pageerror", (e) => errors2.push(e.message));
c2.on("request", (r) => { const u = r.url(); if (!u.startsWith(URL) && !u.startsWith("data:") && !u.startsWith("blob:") && !u.startsWith("chrome")) foreign.push(u); });
const tmp = (name, text) => { const f = path.join(os.tmpdir(), name); fs.writeFileSync(f, text); return f; };
await p2.goto(URL); await p2.getByRole("heading", { name: "Set up your shop" }).waitFor();
await p2.evaluate(() => navigator.serviceWorker.ready);
await check("R1. a fresh install shows setup with a privacy note, and no demo data", async () => {
  await bodyHas(p2, ["Your data stays on this phone", "Privacy policy", "Load demo data", "Restore from a backup", "Already have a backup file?"]);
  const t = await p2.locator("body").innerText(); if (/Coca-Cola|Demo Shop|Wanjiru/.test(t)) throw new Error("demo data is visible on a fresh install");
});
await check("R2. setup asks for both names", async () => {
  await p2.getByRole("button", { name: "Start", exact: true }).click(); await seen(p2, "Enter the name of your shop.");
  await p2.getByPlaceholder(/Njeri's Duka/).fill("E2E Duka"); await p2.getByRole("button", { name: "Start", exact: true }).click(); await seen(p2, "Enter your name.");
});
await check("R3. finishing setup gives an empty, real-mode dashboard with a backup reminder", async () => {
  await p2.getByPlaceholder("e.g. Njeri").fill("Njeri"); await p2.getByRole("button", { name: "Start", exact: true }).click();
  await p2.getByRole("heading", { level: 1 }).filter({ hasText: /^Good .*Njeri/ }).waitFor({ timeout: 6000 });
  const t = await bodyHas(p2, ["at E2E Duka today", "Saved on this device only", "No backup yet"]); if (/Demo data/.test(t)) throw new Error("the demo banner is showing on real data");
  await p2.goto(URL + "/products"); await seen(p2, "No products yet");
  await p2.goto(URL + "/settings"); await p2.getByRole("heading", { name: "Settings", level: 1 }).waitFor();
  await bodyHas(p2, ["Erase all data", "Back up your data", "Last backup: never"]); if ((await p2.getByRole("button", { name: "Reset demo data" }).count()) > 0) throw new Error("real data shows the demo reset button");
});
await check("R4. add a product with opening stock and sell it", async () => {
  await p2.goto(URL + "/products/new"); await p2.getByRole("heading", { level: 1 }).first().waitFor();
  await p2.getByLabel("Product name").fill("Unga 2kg"); await p2.getByLabel("SKU").fill("UNGA2"); await p2.getByLabel("Cost price (KES)").fill("120"); await p2.getByLabel("Selling price (KES)").fill("150"); await p2.getByLabel("Opening stock (optional)").fill("30");
  await p2.getByRole("button", { name: "Save product" }).click(); await p2.getByRole("heading", { name: "Unga 2kg" }).waitFor({ timeout: 6000 });
  await sell(p2, "Unga 2kg", 4, "M-Pesa");
  const st = await stockOf(p2, "Unga 2kg"); if (st !== 26) throw new Error("expected stock 26, got " + st);
});
let backupPath, backupJson;
await check("R5. Download backup saves a named file with all the records, and the banner updates", async () => {
  await p2.goto(URL + "/settings"); await p2.getByRole("heading", { name: "Settings", level: 1 }).waitFor();
  const [dl] = await Promise.all([p2.waitForEvent("download", { timeout: 8000 }), p2.getByRole("button", { name: "Download backup" }).click()]);
  if (!/^e2e-duka-backup-\d{4}-\d{2}-\d{2}\.json$/.test(dl.suggestedFilename())) throw new Error("unexpected file name " + dl.suggestedFilename());
  backupPath = path.join(os.tmpdir(), "e2e-backup.json"); await dl.saveAs(backupPath); backupJson = JSON.parse(fs.readFileSync(backupPath, "utf8"));
  if (backupJson.app !== "stock-app" || backupJson.data.products.length !== 1 || backupJson.data.sales.length !== 1 || backupJson.business.name !== "E2E Duka") throw new Error("backup contents are wrong");
  await seen(p2, "Backup saved as"); await bodyHas(p2, [/Last backup: .*today/]);
  return dl.suggestedFilename() + ", " + (fs.statSync(backupPath).size) + " bytes";
});
await check("R6. restoring a damaged or wrong file is refused and changes nothing", async () => {
  const input = p2.getByLabel("Choose a backup file");
  await input.setInputFiles(tmp("junk.json", "this is not json")); await seen(p2, "isn't a backup");
  await input.setInputFiles(tmp("other.json", JSON.stringify({ app: "something-else", format: 1, data: {} }))); await seen(p2, "isn't a backup made by this app");
  const broken = JSON.parse(JSON.stringify(backupJson)); broken.data.movements[0].productId = "ghost";
  await input.setInputFiles(tmp("broken.json", JSON.stringify(broken))); await seen(p2, /movements/);
  const newer = { ...backupJson, format: 99 }; await input.setInputFiles(tmp("newer.json", JSON.stringify(newer))); await seen(p2, "newer version");
  const st = await stockOf(p2, "Unga 2kg"); if (st !== 26) throw new Error("data changed after refused restores: " + st);
});
await check("R7. restoring over existing data warns first", async () => {
  await p2.goto(URL + "/settings"); await p2.getByLabel("Choose a backup file").setInputFiles(backupPath);
  await seen(p2, "This will replace everything currently on this device"); await bodyHas(p2, ["E2E Duka", "1 products, 1 sales"]);
  await p2.getByRole("button", { name: "Cancel" }).last().click();
});
await check("R8. Erase all data needs the word DELETE, then returns to setup", async () => {
  await p2.goto(URL + "/settings"); await p2.getByRole("button", { name: "Erase all data" }).click();
  const go = p2.getByRole("button", { name: "Erase everything" }); if (!(await go.isDisabled())) throw new Error("erase is enabled before typing DELETE");
  await p2.getByLabel("Type DELETE to confirm").fill("delete"); if (!(await go.isDisabled())) throw new Error("lowercase delete was accepted");
  await p2.getByLabel("Type DELETE to confirm").fill("DELETE"); await go.click();
  await p2.getByRole("heading", { name: "Set up your shop" }).waitFor({ timeout: 6000 });
});
await check("R9. restoring from the setup screen brings everything back", async () => {
  await p2.getByRole("button", { name: "Restore from a backup" }).click();
  await p2.getByLabel("Choose a backup file").setInputFiles(backupPath); await seen(p2, "1 products, 1 sales");
  await p2.getByRole("button", { name: "Restore this backup" }).click();
  await p2.getByRole("heading", { level: 1 }).filter({ hasText: /^Good .*Njeri/ }).waitFor({ timeout: 6000 });
  await bodyHas(p2, ["at E2E Duka today"]); const st = await stockOf(p2, "Unga 2kg"); if (st !== 26) throw new Error("expected stock 26 after restore, got " + st);
  await p2.goto(URL + "/settings"); await p2.getByRole("heading", { name: "Settings", level: 1 }).waitFor(); const t = await p2.locator("body").innerText(); if (/Last backup: never/.test(t)) throw new Error("last backup time was lost");
});
await check("P1. Chrome considers the app installable, and the manifest is complete", async () => {
  const cdp = await c2.newCDPSession(p2); const r = await cdp.send("Page.getInstallabilityErrors");
  if (r.installabilityErrors.length) throw new Error("installability errors: " + JSON.stringify(r.installabilityErrors));
  const m = await p2.evaluate(async () => (await fetch("/manifest.webmanifest")).json());
  const bad = []; const need = (c, msg) => { if (!c) bad.push(msg); };
  need(m.id && m.scope && m.start_url, "id, scope and start_url"); need(m.display === "standalone", "display standalone"); need(m.name && m.short_name && m.short_name.length <= 12, "name and a short_name of at most 12 characters");
  need(/^#[0-9a-f]{6}$/i.test(m.theme_color) && /^#[0-9a-f]{6}$/i.test(m.background_color), "theme and background colours");
  need(m.icons.some((i) => i.sizes === "192x192" && i.type === "image/png"), "192 icon"); need(m.icons.some((i) => i.sizes === "512x512" && (i.purpose || "any").includes("any")), "512 any icon"); need(m.icons.some((i) => i.purpose === "maskable" && i.sizes === "512x512"), "512 maskable icon");
  need((m.screenshots || []).filter((x) => x.form_factor === "narrow").length >= 2, "at least 2 phone screenshots"); need((m.shortcuts || []).length >= 1, "shortcuts");
  for (const i of [...m.icons, ...m.screenshots]) { const d = await p2.evaluate(async (u) => { const r = await fetch(u); if (!r.ok || !(r.headers.get("content-type") || "").includes("image/png")) return "bad response " + r.status; const b = await createImageBitmap(await r.blob()); return b.width + "x" + b.height; }, "/" + i.src); if (d !== i.sizes) bad.push(`${i.src} is ${d}, manifest says ${i.sizes}`); }
  if (bad.length) throw new Error(bad.join("; "));
  return `installable; ${m.icons.length} icons, ${m.screenshots.length} screenshots verified`;
});
await check("P2. the privacy policy is a real page, not the app, and works offline", async () => {
  await p2.goto(URL + "/privacy.html"); await p2.getByRole("heading", { name: "Privacy policy" }).waitFor();
  if ((await p2.locator("#root").count()) > 0) throw new Error("/privacy.html is serving the app shell instead of the policy");
  await bodyHas(p2, ["does not receive, see or sell", "Deleting your data", "Contact"]);
  await c2.setOffline(true); await p2.goto(URL + "/privacy.html"); await p2.getByRole("heading", { name: "Privacy policy" }).waitFor({ timeout: 6000 }); await c2.setOffline(false);
});
await check("P3. the app made no requests to any other website", async () => { if (foreign.length) throw new Error([...new Set(foreign)].slice(0, 4).join(", ")); });
await check("no uncaught page errors in the real-user path", async () => { if (errors2.length) throw new Error(errors2[0]); });
await c2.close();

const w = Math.max(...results.map((r) => r[1].length));
for (const [s, n, note] of results) console.log(`${s}  ${n.padEnd(w)}  ${note}`);
const failed = results.filter((r) => r[0] === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} passed`);

process.exit(failed ? 1 : 0);
