// Business analysis from the actual records. Pure functions: no UI, no storage.
// Profit is estimated: sales minus the cost price saved on each sale item when it was sold.
import { DAY, inventory, purchaseLines, purchaseStatus, startOfDay, type Category, type Movement, type Product, type Purchase, type PurchaseItem, type Receipt, type ReceiptItem, type Sale, type SaleItem, type StockCount, type StockItem, type Supplier } from "./engine";

export interface Books { P: Product[]; CAT: Category[]; M: Movement[]; S: Sale[]; SI: SaleItem[]; C: StockCount[]; SUP: Supplier[]; PU: Purchase[]; PI: PurchaseItem[]; RC: Receipt[]; RI: ReceiptItem[] }
const completed = (S: Sale[]) => new Map(S.filter((s) => s.status === "completed").map((s) => [s.id, s] as const));
const voidedIds = (S: Sale[]) => new Set(S.filter((s) => s.status === "cancelled").map((s) => s.id));
const pct = (profit: number, sales: number) => (sales > 0 ? (profit / sales) * 100 : null);
const nameOf = (P: Product[]) => { const m = new Map(P.map((p) => [p.id, p.name])); return (id: string) => m.get(id) ?? "Unknown product"; };

/** Totals for completed sales in [from, to). Cancelled sales never count. */
export function totalsBetween(b: Books, from: number, to: number) {
  const ok = completed(b.S); let sales = 0, profit = 0, units = 0;
  for (const i of b.SI) { const s = ok.get(i.saleId); if (s && s.ts >= from && s.ts < to) { sales += i.qty * i.unitPrice; profit += i.qty * (i.unitPrice - i.unitCost); units += i.qty; } }
  return { sales, profit, units, margin: pct(profit, sales) };
}

/** One point per day for the last `days` days, ending today. */
export function trend(b: Books, days: number, now = Date.now()) {
  const t0 = startOfDay(now), start = t0 - (days - 1) * DAY, ok = completed(b.S);
  const fmt: Intl.DateTimeFormatOptions = days <= 7 ? { weekday: "short" } : { day: "numeric", month: "short" };
  const points = Array.from({ length: days }, (_, i) => ({ ts: start + i * DAY, label: new Date(start + i * DAY).toLocaleDateString("en-KE", fmt), sales: 0, profit: 0 }));
  for (const i of b.SI) {
    const s = ok.get(i.saleId); if (!s || s.ts < start || s.ts >= t0 + DAY) continue;
    const p = points[Math.round((startOfDay(s.ts) - start) / DAY)];
    if (p) { p.sales += i.qty * i.unitPrice; p.profit += i.qty * (i.unitPrice - i.unitCost); }
  }
  const sales = points.reduce((a, p) => a + p.sales, 0), profit = points.reduce((a, p) => a + p.profit, 0);
  return { points, totals: { sales, profit, margin: pct(profit, sales) } };
}

export interface ProductSales { id: string; name: string; units: number; sales: number; profit: number; margin: number | null }
export function topProducts(b: Books, days: number, now = Date.now()): ProductSales[] {
  const start = startOfDay(now) - (days - 1) * DAY, ok = completed(b.S), nm = nameOf(b.P), by = new Map<string, ProductSales>();
  for (const i of b.SI) {
    const s = ok.get(i.saleId); if (!s || s.ts < start) continue;
    const r = by.get(i.productId) ?? { id: i.productId, name: nm(i.productId), units: 0, sales: 0, profit: 0, margin: null };
    r.units += i.qty; r.sales += i.qty * i.unitPrice; r.profit += i.qty * (i.unitPrice - i.unitCost); by.set(i.productId, r);
  }
  return [...by.values()].map((r) => ({ ...r, margin: pct(r.profit, r.sales) })).sort((a, b2) => b2.sales - a.sales);
}

/** Stock removed by counts, adjustments and damage in the period, valued at current cost. */
export function stockLosses(b: Books, days: number, now = Date.now()) {
  const start = startOfDay(now) - (days - 1) * DAY, cost = new Map(b.P.map((p) => [p.id, p.cost]));
  let units = 0, value = 0;
  for (const m of b.M) if ((m.type === "count" || m.type === "adjustment" || m.type === "damage") && m.qty < 0 && m.ts >= start) { units += -m.qty; value += -m.qty * (cost.get(m.productId) ?? 0); }
  return { units, value };
}

/** Average units sold per day over the last `window` days (shorter for products added more recently). */
export function unitsPerDay(b: Books, now = Date.now(), window = 14) {
  const from = now - window * DAY, ok = completed(b.S), made = new Map(b.P.map((p) => [p.id, p.createdAt])), sold = new Map<string, number>();
  for (const i of b.SI) { const s = ok.get(i.saleId); if (s && s.ts >= from) sold.set(i.productId, (sold.get(i.productId) ?? 0) + i.qty); }
  const out = new Map<string, number>();
  for (const [id, q] of sold) { const days = Math.min(window, Math.max(1, Math.ceil((now - Math.max(from, made.get(id) ?? from)) / DAY))); out.set(id, q / days); }
  return out;
}

/** Units ordered but not yet delivered, per product (ordered, not draft or cancelled). */
export function onOrderByProduct(b: Books) {
  const m = new Map<string, number>();
  for (const p of b.PU) {
    const st = purchaseStatus(p, b.PI, b.RC, b.RI);
    if (p.status !== "ordered" || (st !== "ordered" && st !== "partial")) continue;
    for (const l of purchaseLines(p, b.PI, b.RC, b.RI)) m.set(l.productId, (m.get(l.productId) ?? 0) + l.outstanding);
  }
  return m;
}

export const COVER_DAYS = 14, WARN_DAYS = 7;
export interface RestockRow { item: StockItem; perDay: number; daysLeft: number | null; onOrder: number; suggested: number; cost: number }
/** Products that are low, out, or on course to run out within a week, with a simple suggested order. */
export function restockPlan(b: Books, now = Date.now()): RestockRow[] {
  const per = unitsPerDay(b, now), oo = onOrderByProduct(b);
  return inventory(b.P, b.M, voidedIds(b.S), now).filter((i) => !i.archived).map((item) => {
    const perDay = per.get(item.id) ?? 0, onOrder = oo.get(item.id) ?? 0;
    const suggested = Math.max(0, Math.ceil(perDay * COVER_DAYS + item.min - item.stock - onOrder));
    return { item, perDay, daysLeft: perDay > 0 ? item.stock / perDay : null, onOrder, suggested, cost: suggested * item.cost };
  }).filter((r) => r.item.status !== "ok" || (r.daysLeft !== null && r.daysLeft <= WARN_DAYS))
    .sort((a, c) => (a.item.status === "out" ? 0 : 1) - (c.item.status === "out" ? 0 : 1) || (a.daysLeft ?? 1e9) - (c.daysLeft ?? 1e9) || a.item.name.localeCompare(c.item.name));
}

export function valueByCategory(b: Books, now = Date.now()) {
  const inv = inventory(b.P, b.M, voidedIds(b.S), now).filter((i) => !i.archived), names = new Map(b.CAT.map((c) => [c.id, c.name]));
  const by = new Map<string, { name: string; products: number; units: number; value: number }>();
  for (const i of inv) {
    const key = i.categoryId && names.has(i.categoryId) ? i.categoryId : "none", r = by.get(key) ?? { name: key === "none" ? "No category" : names.get(key)!, products: 0, units: 0, value: 0 };
    r.products++; r.units += Math.max(0, i.stock); r.value += Math.max(0, i.value); by.set(key, r);
  }
  const total = [...by.values()].reduce((a, r) => a + r.value, 0);
  return { total, rows: [...by.values()].sort((a, c) => c.value - a.value).map((r) => ({ ...r, share: total > 0 ? (r.value / total) * 100 : 0 })) };
}

/* ---------------- needs attention ---------------- */
export type AttentionItem =
  | { kind: "out" | "low"; id: string; productId: string; name: string; stock: number; min: number; onOrder: number; perDay: number; daysLeft: number | null }
  | { kind: "count"; id: string; productId: string; name: string; short: number; reason: string; staff: string; ts: number }
  | { kind: "purchase"; id: string; purchaseId: string; ref: string; supplier: string; state: "ordered" | "partial"; received: number; ordered: number; outstandingValue: number; ts: number }
  | { kind: "slow"; id: string; count: number; value: number };

/** Urgent first: out of stock, low stock, count shortages, purchases still waiting, then slow stock. */
export function attention(b: Books, now = Date.now()): AttentionItem[] {
  const per = unitsPerDay(b, now), oo = onOrderByProduct(b), nm = nameOf(b.P), sup = new Map(b.SUP.map((s) => [s.id, s.name]));
  const inv = inventory(b.P, b.M, voidedIds(b.S), now).filter((i) => !i.archived);
  const stockRows = inv.filter((i) => i.status !== "ok").sort((a, c) => a.stock - c.stock || a.name.localeCompare(c.name)).map((i): AttentionItem => {
    const perDay = per.get(i.id) ?? 0;
    return { kind: i.status === "out" ? "out" : "low", id: `s-${i.id}`, productId: i.id, name: i.name, stock: i.stock, min: i.min, onOrder: oo.get(i.id) ?? 0, perDay, daysLeft: perDay > 0 ? i.stock / perDay : null };
  });
  const counts = b.C.filter((c) => c.diff < 0 && now - c.ts < 7 * DAY).sort((a, c) => c.ts - a.ts)
    .map((c): AttentionItem => ({ kind: "count", id: `c-${c.id}`, productId: c.productId, name: nm(c.productId), short: -c.diff, reason: c.reason, staff: c.staff, ts: c.ts }));
  const purchases: AttentionItem[] = [];
  for (const p of [...b.PU].sort((a, c) => a.ts - c.ts)) {
    const st = purchaseStatus(p, b.PI, b.RC, b.RI);
    if (p.status !== "ordered" || (st !== "ordered" && st !== "partial")) continue;
    const l = purchaseLines(p, b.PI, b.RC, b.RI);
    purchases.push({ kind: "purchase", id: `p-${p.id}`, purchaseId: p.id, ref: p.ref, supplier: sup.get(p.supplierId) ?? "Unknown supplier", state: st, received: l.reduce((a, x) => a + x.received, 0), ordered: l.reduce((a, x) => a + x.ordered, 0), outstandingValue: l.reduce((a, x) => a + x.outstanding * x.unitCost, 0), ts: p.ts });
  }
  const slow = inv.filter((i) => i.slow);
  return [...stockRows, ...counts, ...purchases, ...(slow.length ? [{ kind: "slow" as const, id: "slow", count: slow.length, value: slow.reduce((a, i) => a + i.value, 0) }] : [])];
}

/* ---------------- activity feed ---------------- */
export type FeedKind = "sale" | "cancel" | "delivery" | "adjust" | "count";
export interface FeedEvent { id: string; ts: number; staff: string; kind: FeedKind; verb: string; subject: string; detail?: string; amount?: number; href?: string }
const list = (xs: string[], max = 3) => (xs.length <= max ? xs.join(", ") : `${xs.slice(0, max).join(", ")} and ${xs.length - max} more`);

/** Everything that happened, newest first: sales, cancellations, deliveries, adjustments and counts. */
export function activityFeed(b: Books): FeedEvent[] {
  const nm = nameOf(b.P), sale = new Map(b.S.map((s) => [s.id, s])), sup = new Map(b.SUP.map((s) => [s.id, s.name])), po = new Map(b.PU.map((p) => [p.id, p]));
  const itemsOf = (id: string) => b.SI.filter((i) => i.saleId === id), out: FeedEvent[] = [];
  for (const s of b.S) {
    const it = itemsOf(s.id);
    out.push({ id: `sale-${s.id}`, ts: s.ts, staff: s.staff, kind: "sale", verb: "sold", subject: `${s.receiptNo} · ${list(it.map((i) => `${nm(i.productId)} × ${i.qty}`))}`, detail: s.payment === "mpesa" ? "Paid by M-Pesa" : "Paid in cash", amount: s.total, href: "/sales?tab=history" });
  }
  const back = new Map<string, Movement[]>();
  for (const m of b.M) if (m.type === "return" && m.refId && sale.has(m.refId)) back.set(m.refId, [...(back.get(m.refId) ?? []), m]);
  for (const [id, ms] of back) {
    const s = sale.get(id)!, units = ms.reduce((a, m) => a + m.qty, 0);
    out.push({ id: `cancel-${id}`, ts: Math.max(...ms.map((m) => m.ts)), staff: ms[0].staff, kind: "cancel", verb: "cancelled", subject: s.receiptNo, detail: `${units} ${units === 1 ? "unit" : "units"} returned to stock`, amount: s.total, href: "/sales?tab=history" });
  }
  for (const r of b.RC) {
    const p = po.get(r.purchaseId), it = b.RI.filter((i) => i.receiptId === r.id), units = it.reduce((a, i) => a + i.qty, 0);
    out.push({ id: `recv-${r.id}`, ts: r.ts, staff: r.staff, kind: "delivery", verb: "received a delivery", subject: `${p?.ref ?? "Purchase"} · ${sup.get(p?.supplierId ?? "") ?? "Unknown supplier"}`, detail: `${units} ${units === 1 ? "unit" : "units"}: ${list(it.map((i) => `${nm(i.productId)} × ${i.qty}`))}`, href: p ? `/purchases/${p.id}` : undefined });
  }
  for (const m of b.M) if (m.type === "adjustment" || m.type === "damage")
    out.push({ id: `adj-${m.id ?? m.ts}-${m.productId}`, ts: m.ts, staff: m.staff, kind: "adjust", verb: m.type === "damage" ? "reported damage" : "adjusted stock", subject: `${nm(m.productId)} ${m.qty > 0 ? "+" : "−"}${Math.abs(m.qty)}`, detail: m.reason, href: `/products/${m.productId}` });
  for (const c of b.C)
    out.push({ id: `count-${c.id}`, ts: c.ts, staff: c.staff, kind: "count", verb: "counted stock", subject: `${nm(c.productId)}: ${c.diff === 0 ? "matches the system" : `${Math.abs(c.diff)} ${c.diff < 0 ? "short" : "over"}`}`, detail: `System ${c.expected}, counted ${c.counted}${c.reason ? ` · ${c.reason}` : ""}`, href: `/products/${c.productId}` });
  return out.sort((a, c) => c.ts - a.ts);
}
