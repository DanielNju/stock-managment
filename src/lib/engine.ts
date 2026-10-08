// Pure inventory engine. No UI, no storage: this file moves unchanged behind the real API.
// Rule: stock is never stored. It is the sum of signed movement quantities.
export type MoveType = "sale" | "purchase" | "adjustment" | "damage" | "count" | "return";
export type Payment = "cash" | "mpesa";
export type Status = "ok" | "low" | "out";

export interface Product { id: number; businessId: string; name: string; sku: string; cost: number; price: number; min: number }
export interface Movement { id?: number; businessId: string; productId: number; type: MoveType; qty: number; ts: number; staff: string; refId?: string; reason?: string }
export interface Sale { id: string; businessId: string; receiptNo: string; ts: number; staff: string; payment: Payment; total: number; status: "completed" | "cancelled" }
/** unitPrice and unitCost are copied at sale time, so later price changes never rewrite history. */
export interface SaleItem { id?: number; saleId: string; productId: number; qty: number; unitPrice: number; unitCost: number }
export interface StockCount { id: string; businessId: string; ts: number; staff: string; productId: number; expected: number; counted: number; diff: number; reason: string }
export interface AuditEntry { id?: number; businessId: string; ts: number; staff: string; action: string; entity: string; entityId: string; oldValue?: string; newValue?: string }
export interface Line { productId: number; qty: number }
export interface StockItem extends Product { stock: number; value: number; last: number; status: Status }

export type Fail = { ok: false; errors: string[] };
export interface Writes { sale?: Sale; items?: SaleItem[]; movements: Movement[]; count?: StockCount; audit: AuditEntry[]; voidSaleId?: string }

export const DAY = 864e5;
export const HR = 36e5;
export const startOfDay = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return +d; };
const fail = (...errors: string[]): Fail => ({ ok: false, errors });

export const stockOf = (M: Movement[], productId: number) => M.reduce((s, m) => (m.productId === productId ? s + m.qty : s), 0);

export function inventory(P: Product[], M: Movement[], voided: Set<string> = new Set()): StockItem[] {
  return P.map((p) => {
    const ms = M.filter((m) => m.productId === p.id);
    const stock = ms.reduce((s, m) => s + m.qty, 0);
    const sold = ms.filter((m) => m.type === "sale" && !(m.refId && voided.has(m.refId))).map((m) => m.ts);
    const last = sold.length ? Math.max(...sold) : 0;
    const status: Status = stock <= 0 ? "out" : stock <= p.min ? "low" : "ok";
    return { ...p, stock, value: stock * p.cost, last, status };
  });
}

/** Sales for one day, from the prices recorded on each sale (never today's product price). */
export function salesOn(S: Sale[], SI: SaleItem[], day: number): number {
  const ids = new Set(S.filter((s) => s.status === "completed" && s.ts >= day && s.ts < day + DAY).map((s) => s.id));
  return SI.reduce((sum, i) => (ids.has(i.saleId) ? sum + i.qty * i.unitPrice : sum), 0);
}

export function validateLines(lines: Line[], P: Product[], M: Movement[]): string[] {
  const errs: string[] = [], seen = new Set<number>();
  if (!lines.length) errs.push("Add at least one product.");
  for (const l of lines) {
    const p = P.find((x) => x.id === l.productId);
    if (!p) { errs.push("Unknown product."); continue; }
    if (seen.has(l.productId)) { errs.push(`${p.name} appears twice.`); continue; }
    seen.add(l.productId);
    if (!Number.isInteger(l.qty) || l.qty <= 0) { errs.push(`${p.name}: quantity must be a whole number above zero.`); continue; }
    const avail = stockOf(M, l.productId);
    if (l.qty > avail) errs.push(`${p.name}: only ${avail} available (you asked for ${l.qty}).`);
  }
  return errs;
}

export function buildSale(a: { businessId: string; id: string; receiptNo: string; lines: Line[]; P: Product[]; M: Movement[]; staff: string; payment: Payment; now: number }): ({ ok: true } & Writes & { sale: Sale; items: SaleItem[] }) | Fail {
  const errs = validateLines(a.lines, a.P, a.M);
  if (errs.length) return { ok: false, errors: errs };
  const items: SaleItem[] = a.lines.map((l) => { const p = a.P.find((x) => x.id === l.productId)!; return { saleId: a.id, productId: p.id, qty: l.qty, unitPrice: p.price, unitCost: p.cost }; });
  const total = items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
  const sale: Sale = { id: a.id, businessId: a.businessId, receiptNo: a.receiptNo, ts: a.now, staff: a.staff, payment: a.payment, total, status: "completed" };
  const movements: Movement[] = items.map((i) => ({ businessId: a.businessId, productId: i.productId, type: "sale", qty: -i.qty, ts: a.now, staff: a.staff, refId: a.id }));
  const audit: AuditEntry[] = [{ businessId: a.businessId, ts: a.now, staff: a.staff, action: "sale.created", entity: "sale", entityId: a.id, newValue: `${a.receiptNo} total ${total}` }];
  return { ok: true, sale, items, movements, audit };
}

export function buildCancel(a: { businessId: string; sale: Sale; items: SaleItem[]; staff: string; now: number }): ({ ok: true } & Writes) | Fail {
  if (a.sale.status !== "completed") return fail("This sale is already cancelled.");
  const movements: Movement[] = a.items.map((i) => ({ businessId: a.businessId, productId: i.productId, type: "return", qty: i.qty, ts: a.now, staff: a.staff, refId: a.sale.id, reason: "Sale cancelled" }));
  const audit: AuditEntry[] = [{ businessId: a.businessId, ts: a.now, staff: a.staff, action: "sale.cancelled", entity: "sale", entityId: a.sale.id, oldValue: "completed", newValue: "cancelled" }];
  return { ok: true, movements, audit, voidSaleId: a.sale.id };
}

export function buildCount(a: { businessId: string; id: string; product: Product; M: Movement[]; counted: number; reason: string; staff: string; now: number }): ({ ok: true } & Writes & { count: StockCount }) | Fail {
  if (!Number.isInteger(a.counted) || a.counted < 0) return fail("Counted quantity must be a whole number, zero or more.");
  const expected = stockOf(a.M, a.product.id), diff = a.counted - expected;
  if (diff !== 0 && !a.reason) return fail("Choose a reason for the difference.");
  const count: StockCount = { id: a.id, businessId: a.businessId, ts: a.now, staff: a.staff, productId: a.product.id, expected, counted: a.counted, diff, reason: diff === 0 ? "" : a.reason };
  const movements: Movement[] = diff === 0 ? [] : [{ businessId: a.businessId, productId: a.product.id, type: "count", qty: diff, ts: a.now, staff: a.staff, refId: a.id, reason: a.reason }];
  const audit: AuditEntry[] = [{ businessId: a.businessId, ts: a.now, staff: a.staff, action: "stock.counted", entity: "product", entityId: String(a.product.id), oldValue: String(expected), newValue: String(a.counted) }];
  return { ok: true, count, movements, audit };
}

export function nextReceiptNo(S: Sale[]): string {
  const max = S.reduce((m, s) => Math.max(m, Number(s.receiptNo.replace(/\D/g, "")) || 0), 1000);
  return `SL-${max + 1}`;
}

export function dashboard(P: Product[], M: Movement[], S: Sale[], SI: SaleItem[], C: StockCount[], now = Date.now()) {
  const voided = new Set(S.filter((s) => s.status === "cancelled").map((s) => s.id));
  const inv = inventory(P, M, voided);
  const t0 = startOfDay(now);
  const names = new Map(P.map((p) => [p.id, p.name]));
  const nm = (id: number) => names.get(id) ?? "Unknown";
  const low = inv.filter((i) => i.status !== "ok").sort((a, b) => a.stock - b.stock);
  const issues = C.filter((c) => c.diff < 0 && now - c.ts < 7 * DAY).sort((a, b) => b.ts - a.ts)
    .map((c) => ({ id: c.id, name: nm(c.productId), short: -c.diff, staff: c.staff, ts: c.ts, reason: c.reason }));
  const slow = inv.filter((i) => i.stock > 0 && now - i.last > 30 * DAY);
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = t0 - (6 - i) * DAY;
    return { day: new Date(d).toLocaleDateString("en-KE", { weekday: "short" }), value: salesOn(S, SI, d) };
  });
  const today = week[6].value, yesterday = week[5].value;
  return {
    inv, low, issues, slow, week, today,
    delta: yesterday ? ((today - yesterday) / yesterday) * 100 : null,
    stockValue: inv.reduce((s, i) => s + i.value, 0),
    productCount: P.length,
    activity: [...M].sort((a, b) => b.ts - a.ts).slice(0, 6).map((m) => ({ ...m, name: nm(m.productId) })),
  };
}
