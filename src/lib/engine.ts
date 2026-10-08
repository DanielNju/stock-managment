// Pure inventory engine. No UI, no storage: this file moves unchanged behind the real API.
// Rule: stock is never stored on a product. It is the sum of signed movement quantities.
export type MoveType = "sale" | "purchase" | "adjustment" | "damage" | "count" | "return" | "opening";
export type Payment = "cash" | "mpesa";
export type Status = "ok" | "low" | "out";

export interface Category { id: string; businessId: string; name: string }
export interface Product {
  id: string; businessId: string; name: string; sku: string; categoryId?: string; unit: string;
  cost: number; price: number; min: number; barcode?: string; description?: string;
  archived: boolean; createdAt: number; updatedAt: number;
}
export interface Movement { id?: number; businessId: string; productId: string; type: MoveType; qty: number; ts: number; staff: string; refId?: string; reason?: string }
export interface Sale { id: string; businessId: string; receiptNo: string; ts: number; staff: string; payment: Payment; total: number; status: "completed" | "cancelled" }
/** unitPrice and unitCost are copied at sale time, so later price changes never rewrite history. */
export interface SaleItem { id?: number; saleId: string; productId: string; qty: number; unitPrice: number; unitCost: number }
export interface StockCount { id: string; businessId: string; ts: number; staff: string; productId: string; expected: number; counted: number; diff: number; reason: string }
export interface AuditEntry { id?: number; businessId: string; ts: number; staff: string; action: string; entity: string; entityId: string; oldValue?: string; newValue?: string }
export interface Line { productId: string; qty: number }
export interface StockItem extends Product { stock: number; value: number; last: number; status: Status }

/** Units are whole-quantity only for now (a pack or bottle can't be split). Weighed units (kg, litre) need decimal quantities and come later. */
export const UNITS = [
  { id: "piece", label: "Piece" }, { id: "pack", label: "Pack" }, { id: "bottle", label: "Bottle" },
  { id: "carton", label: "Carton" }, { id: "bag", label: "Bag" }, { id: "box", label: "Box" }, { id: "dozen", label: "Dozen" },
] as const;

export type Fail = { ok: false; errors: string[] };
export interface Writes {
  sale?: Sale; items?: SaleItem[]; movements: Movement[]; count?: StockCount;
  product?: Product; deleteProductId?: string; category?: Category; deleteCategoryId?: string;
  audit: AuditEntry[]; voidSaleId?: string;
}

export const DAY = 864e5;
export const HR = 36e5;
export const startOfDay = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return +d; };
const fail = (...errors: string[]): Fail => ({ ok: false, errors });

export const stockOf = (M: Movement[], productId: string) => M.reduce((s, m) => (m.productId === productId ? s + m.qty : s), 0);

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

/* ---------------- sales ---------------- */
export function validateLines(lines: Line[], P: Product[], M: Movement[]): string[] {
  const errs: string[] = [], seen = new Set<string>();
  if (!lines.length) errs.push("Add at least one product.");
  for (const l of lines) {
    const p = P.find((x) => x.id === l.productId);
    if (!p) { errs.push("Unknown product."); continue; }
    if (p.archived) { errs.push(`${p.name} is archived and can't be sold.`); continue; }
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
  const audit: AuditEntry[] = [{ businessId: a.businessId, ts: a.now, staff: a.staff, action: "stock.counted", entity: "product", entityId: a.product.id, oldValue: String(expected), newValue: String(a.counted) }];
  return { ok: true, count, movements, audit };
}

export function nextReceiptNo(S: Sale[]): string {
  const max = S.reduce((m, s) => Math.max(m, Number(s.receiptNo.replace(/\D/g, "")) || 0), 1000);
  return `SL-${max + 1}`;
}

/* ---------------- products ---------------- */
export interface ProductInput { name: string; sku: string; categoryId?: string; unit: string; cost: number; price: number; min: number; barcode?: string; description?: string; openingStock?: number }
const money = (n: number) => Number.isFinite(n) && n >= 0;

export function validateProduct(i: ProductInput, P: Product[], C: Category[], selfId?: string, creating = false) {
  const errors: string[] = [], warnings: string[] = [];
  const name = i.name.trim(), sku = i.sku.trim(), bc = i.barcode?.trim();
  if (!name) errors.push("Product name is required."); else if (name.length > 120) errors.push("Product name is too long (120 characters at most).");
  if (!sku) errors.push("SKU is required.");
  else if (sku.length > 40) errors.push("SKU is too long (40 characters at most).");
  else if (P.some((p) => p.id !== selfId && p.sku.toLowerCase() === sku.toLowerCase())) errors.push(`SKU ${sku} is already used by another product.`);
  if (bc && P.some((p) => p.id !== selfId && p.barcode === bc)) errors.push("That barcode is already used by another product.");
  if (!money(i.cost)) errors.push("Cost price must be a number, zero or more.");
  if (!money(i.price)) errors.push("Selling price must be a number, zero or more.");
  if (!Number.isInteger(i.min) || i.min < 0) errors.push("Minimum stock must be a whole number, zero or more.");
  if (!UNITS.some((u) => u.id === i.unit)) errors.push("Choose a unit.");
  if (i.categoryId && !C.some((c) => c.id === i.categoryId)) errors.push("That category no longer exists.");
  if (creating && i.openingStock !== undefined && (!Number.isInteger(i.openingStock) || i.openingStock < 0)) errors.push("Opening stock must be a whole number, zero or more.");
  if (money(i.cost) && money(i.price) && i.price < i.cost) warnings.push("The selling price is below the cost price. Each sale would lose money.");
  return { errors, warnings };
}
const clean = (i: ProductInput) => ({ name: i.name.trim(), sku: i.sku.trim(), categoryId: i.categoryId || undefined, unit: i.unit, cost: i.cost, price: i.price, min: i.min, barcode: i.barcode?.trim() || undefined, description: i.description?.trim() || undefined });

export function buildProductCreate(a: { businessId: string; id: string; input: ProductInput; P: Product[]; C: Category[]; staff: string; now: number }): ({ ok: true } & Writes & { product: Product }) | Fail {
  const v = validateProduct(a.input, a.P, a.C, undefined, true);
  if (v.errors.length) return { ok: false, errors: v.errors };
  const product: Product = { id: a.id, businessId: a.businessId, ...clean(a.input), archived: false, createdAt: a.now, updatedAt: a.now };
  const open = a.input.openingStock ?? 0;
  const movements: Movement[] = open > 0 ? [{ businessId: a.businessId, productId: a.id, type: "opening", qty: open, ts: a.now, staff: a.staff, reason: "Opening stock" }] : [];
  const audit: AuditEntry[] = [{ businessId: a.businessId, ts: a.now, staff: a.staff, action: "product.created", entity: "product", entityId: a.id, newValue: product.name }];
  return { ok: true, product, movements, audit };
}

/** Editing changes the product only. Sales already made keep the price on their own sale items. */
export function buildProductUpdate(a: { businessId: string; product: Product; input: ProductInput; P: Product[]; C: Category[]; staff: string; now: number }): ({ ok: true } & Writes & { product: Product }) | Fail {
  const v = validateProduct(a.input, a.P, a.C, a.product.id);
  if (v.errors.length) return { ok: false, errors: v.errors };
  const next: Product = { ...a.product, ...clean(a.input), updatedAt: a.now };
  const e = (action: string, oldValue?: string, newValue?: string): AuditEntry => ({ businessId: a.businessId, ts: a.now, staff: a.staff, action, entity: "product", entityId: a.product.id, oldValue, newValue });
  const audit: AuditEntry[] = [];
  if (next.price !== a.product.price) audit.push(e("product.price_changed", String(a.product.price), String(next.price)));
  if (next.cost !== a.product.cost) audit.push(e("product.cost_changed", String(a.product.cost), String(next.cost)));
  const others = (["name", "sku", "categoryId", "unit", "min", "barcode", "description"] as const).filter((k) => next[k] !== a.product[k]);
  if (others.length) audit.push(e("product.updated", others.join(", ")));
  return { ok: true, product: next, movements: [], audit };
}

export function buildArchive(a: { businessId: string; product: Product; archived: boolean; staff: string; now: number }): ({ ok: true } & Writes & { product: Product }) | Fail {
  if (a.product.archived === a.archived) return fail(a.archived ? "This product is already archived." : "This product is not archived.");
  const product = { ...a.product, archived: a.archived, updatedAt: a.now };
  return { ok: true, product, movements: [], audit: [{ businessId: a.businessId, ts: a.now, staff: a.staff, action: a.archived ? "product.archived" : "product.restored", entity: "product", entityId: a.product.id, newValue: a.product.name }] };
}

export const hasHistory = (id: string, M: Movement[], SI: SaleItem[], C: StockCount[]) =>
  M.some((m) => m.productId === id) || SI.some((i) => i.productId === id) || C.some((c) => c.productId === id);

export function buildProductDelete(a: { businessId: string; product: Product; M: Movement[]; SI: SaleItem[]; C: StockCount[]; staff: string; now: number }): ({ ok: true } & Writes) | Fail {
  if (hasHistory(a.product.id, a.M, a.SI, a.C)) return fail(`${a.product.name} has stock or sales history, so it can't be deleted. Archive it instead.`);
  return { ok: true, movements: [], deleteProductId: a.product.id, audit: [{ businessId: a.businessId, ts: a.now, staff: a.staff, action: "product.deleted", entity: "product", entityId: a.product.id, oldValue: a.product.name }] };
}

/* ---------------- categories ---------------- */
function checkCategoryName(name: string, C: Category[], selfId?: string): string[] {
  const n = name.trim();
  if (!n) return ["Category name is required."];
  if (n.length > 40) return ["Category name is too long (40 characters at most)."];
  if (C.some((c) => c.id !== selfId && c.name.toLowerCase() === n.toLowerCase())) return [`A category named "${n}" already exists.`];
  return [];
}
export function buildCategoryCreate(a: { businessId: string; id: string; name: string; C: Category[]; staff: string; now: number }): ({ ok: true } & Writes & { category: Category }) | Fail {
  const errs = checkCategoryName(a.name, a.C);
  if (errs.length) return { ok: false, errors: errs };
  const category = { id: a.id, businessId: a.businessId, name: a.name.trim() };
  return { ok: true, category, movements: [], audit: [{ businessId: a.businessId, ts: a.now, staff: a.staff, action: "category.created", entity: "category", entityId: a.id, newValue: category.name }] };
}
export function buildCategoryRename(a: { businessId: string; category: Category; name: string; C: Category[]; staff: string; now: number }): ({ ok: true } & Writes & { category: Category }) | Fail {
  const errs = checkCategoryName(a.name, a.C, a.category.id);
  if (errs.length) return { ok: false, errors: errs };
  const category = { ...a.category, name: a.name.trim() };
  return { ok: true, category, movements: [], audit: [{ businessId: a.businessId, ts: a.now, staff: a.staff, action: "category.renamed", entity: "category", entityId: a.category.id, oldValue: a.category.name, newValue: category.name }] };
}
export function buildCategoryDelete(a: { businessId: string; category: Category; P: Product[]; staff: string; now: number }): ({ ok: true } & Writes) | Fail {
  const n = a.P.filter((p) => p.categoryId === a.category.id).length;
  if (n > 0) return fail(`${n} ${n === 1 ? "product still uses" : "products still use"} "${a.category.name}". Move ${n === 1 ? "it" : "them"} to another category first.`);
  return { ok: true, movements: [], deleteCategoryId: a.category.id, audit: [{ businessId: a.businessId, ts: a.now, staff: a.staff, action: "category.deleted", entity: "category", entityId: a.category.id, oldValue: a.category.name }] };
}

/* ---------------- dashboard ---------------- */
export function dashboard(P: Product[], M: Movement[], S: Sale[], SI: SaleItem[], C: StockCount[], now = Date.now()) {
  const voided = new Set(S.filter((s) => s.status === "cancelled").map((s) => s.id));
  const inv = inventory(P, M, voided);
  const active = inv.filter((i) => !i.archived); // archived products never raise alerts
  const t0 = startOfDay(now);
  const names = new Map(P.map((p) => [p.id, p.name]));
  const nm = (id: string) => names.get(id) ?? "Unknown";
  const low = active.filter((i) => i.status !== "ok").sort((a, b) => a.stock - b.stock);
  const issues = C.filter((c) => c.diff < 0 && now - c.ts < 7 * DAY).sort((a, b) => b.ts - a.ts)
    .map((c) => ({ id: c.id, name: nm(c.productId), short: -c.diff, staff: c.staff, ts: c.ts, reason: c.reason }));
  const slow = active.filter((i) => i.stock > 0 && now - i.last > 30 * DAY);
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = t0 - (6 - i) * DAY;
    return { day: new Date(d).toLocaleDateString("en-KE", { weekday: "short" }), value: salesOn(S, SI, d) };
  });
  const today = week[6].value, yesterday = week[5].value;
  return {
    inv, low, issues, slow, week, today,
    delta: yesterday ? ((today - yesterday) / yesterday) * 100 : null,
    stockValue: inv.reduce((s, i) => s + i.value, 0),
    productCount: active.length,
    activity: [...M].sort((a, b) => b.ts - a.ts).slice(0, 6).map((m) => ({ ...m, name: nm(m.productId) })),
  };
}
