import Dexie, { type Table } from "dexie";
import { useCallback, useEffect, useState } from "react";
import { BUSINESS_ID, CURRENT_STAFF } from "../config";
import {
  buildArchive, buildCancel, buildCategoryCreate, buildCategoryDelete, buildCategoryRename, buildCount, buildProductCreate, buildProductDelete, buildProductUpdate, buildSale, nextReceiptNo,
  type AuditEntry, type Category, type Fail, type Line, type Movement, type Payment, type Product, type ProductInput, type Sale, type SaleItem, type StockCount, type Writes,
} from "./engine";
import { seed, type SeedData } from "./seed";

const TABLES = ["products", "categories", "movements", "sales", "saleItems", "counts", "audit"] as const;

class StockDB extends Dexie {
  products!: Table<Product, string>; categories!: Table<Category, string>; movements!: Table<Movement, number>; sales!: Table<Sale, string>;
  saleItems!: Table<SaleItem, number>; counts!: Table<StockCount, string>; audit!: Table<AuditEntry, number>;
  constructor() {
    super("stockly");
    this.version(1).stores({ products: "id", movements: "++id,productId,ts" });
    this.version(2).stores({ products: "id", movements: "++id,productId,ts,refId", sales: "id,ts,receiptNo", saleItems: "++id,saleId,productId", counts: "id,ts,productId", audit: "++id,ts,entity" })
      .upgrade((tx) => Promise.all([tx.table("products").clear(), tx.table("movements").clear()]));
    // v3: product IDs become UUID strings, products gain category/unit/archive fields, categories added.
    // Every earlier version held demo data only, so it is cleared and re-seeded. A real-data migration will be needed once real data exists.
    this.version(3).stores({ products: "id,sku,categoryId", categories: "id" })
      .upgrade((tx) => Promise.all(TABLES.filter((t) => t !== "categories").map((t) => tx.table(t).clear())));
  }
}
const db = new StockDB();
let mem: SeedData | null = null; // fallback when IndexedDB is blocked
let mode: "device" | "memory" = "device";
let memId = 1_000_000;

export interface Snapshot { P: Product[]; CAT: Category[]; M: Movement[]; S: Sale[]; SI: SaleItem[]; C: StockCount[]; mode: "device" | "memory" }
export type Result<T> = { ok: true; value: T } | Fail;
export interface StockCtx {
  state: Snapshot | null;
  recordSale: (lines: Line[], payment: Payment) => Promise<Result<{ sale: Sale; items: SaleItem[] }>>;
  cancelSale: (saleId: string) => Promise<Result<object>>;
  recordCount: (productId: string, counted: number, reason: string) => Promise<Result<{ count: StockCount }>>;
  createProduct: (input: ProductInput) => Promise<Result<{ product: Product }>>;
  updateProduct: (id: string, input: ProductInput) => Promise<Result<{ product: Product }>>;
  setArchived: (id: string, archived: boolean) => Promise<Result<{ product: Product }>>;
  deleteProduct: (id: string) => Promise<Result<object>>;
  createCategory: (name: string) => Promise<Result<{ category: Category }>>;
  renameCategory: (id: string, name: string) => Promise<Result<{ category: Category }>>;
  deleteCategory: (id: string) => Promise<Result<object>>;
  resetDemo: () => Promise<void>;
}
export const uid = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`);

async function read(): Promise<Snapshot> {
  if (mode === "device") return { mode, P: await db.products.toArray(), CAT: await db.categories.toArray(), M: await db.movements.toArray(), S: await db.sales.toArray(), SI: await db.saleItems.toArray(), C: await db.counts.toArray() };
  const m = mem!; return { mode, P: [...m.products], CAT: [...m.categories], M: [...m.movements], S: [...m.sales], SI: [...m.saleItems], C: [...m.counts] };
}
async function write(w: Writes) {
  if (mode === "device") {
    if (w.sale) await db.sales.add(w.sale);
    if (w.items?.length) await db.saleItems.bulkAdd(w.items);
    if (w.movements.length) await db.movements.bulkAdd(w.movements);
    if (w.count) await db.counts.add(w.count);
    if (w.product) await db.products.put(w.product);
    if (w.deleteProductId) await db.products.delete(w.deleteProductId);
    if (w.category) await db.categories.put(w.category);
    if (w.deleteCategoryId) await db.categories.delete(w.deleteCategoryId);
    if (w.audit.length) await db.audit.bulkAdd(w.audit);
    if (w.voidSaleId) await db.sales.update(w.voidSaleId, { status: "cancelled" });
    return;
  }
  const m = mem!;
  if (w.sale) m.sales.push(w.sale);
  w.items?.forEach((i) => m.saleItems.push({ ...i, id: ++memId }));
  w.movements.forEach((x) => m.movements.push({ ...x, id: ++memId }));
  if (w.count) m.counts.push(w.count);
  const put = <T extends { id: string }>(arr: T[], x: T) => { const i = arr.findIndex((r) => r.id === x.id); if (i >= 0) arr[i] = x; else arr.push(x); };
  if (w.product) put(m.products, w.product);
  if (w.deleteProductId) m.products = m.products.filter((p) => p.id !== w.deleteProductId);
  if (w.category) put(m.categories, w.category);
  if (w.deleteCategoryId) m.categories = m.categories.filter((c) => c.id !== w.deleteCategoryId);
  m.audit.push(...w.audit);
  if (w.voidSaleId) { const s = m.sales.find((x) => x.id === w.voidSaleId); if (s) s.status = "cancelled"; }
}

/** Validate against the data as it is *inside* the transaction, then write everything or nothing. */
async function transact<T extends object>(plan: (s: Snapshot) => ({ ok: true } & Writes & T) | Fail): Promise<Result<T>> {
  const run = async (): Promise<Result<T>> => {
    const r = plan(await read());
    if (!r.ok) return r;
    await write(r);
    return { ok: true, value: r as unknown as T };
  };
  try {
    return mode === "device" ? await db.transaction("rw", TABLES.map((t) => db[t]), run) : await run();
  } catch { return { ok: false, errors: ["Could not save. Nothing was changed. Please try again."] }; }
}

async function load(): Promise<Snapshot> {
  try {
    if (!(await db.products.count())) {
      const s = seed();
      await db.transaction("rw", TABLES.map((t) => db[t]), async () => {
        await db.categories.bulkAdd(s.categories); await db.products.bulkAdd(s.products); await db.movements.bulkAdd(s.movements);
        await db.sales.bulkAdd(s.sales); await db.saleItems.bulkAdd(s.saleItems); await db.counts.bulkAdd(s.counts); await db.audit.bulkAdd(s.audit);
      });
    }
    mode = "device";
  } catch { mem = mem ?? seed(); mode = "memory"; }
  return read();
}

export function useStock(): StockCtx {
  const [state, setState] = useState<Snapshot | null>(null);
  const refresh = useCallback(async () => setState(await load()), []);
  useEffect(() => { void refresh(); }, [refresh]);
  const done = async <T,>(r: Result<T>) => { if (r.ok) await refresh(); return r; };
  const ctx = { businessId: BUSINESS_ID, staff: CURRENT_STAFF };
  const find = <T extends { id: string }>(arr: T[], id: string) => arr.find((x) => x.id === id);

  return {
    state,
    recordSale: async (lines, payment) => { const id = uid(); return done(await transact<{ sale: Sale; items: SaleItem[] }>((s) => s.S.some((x) => x.id === id) ? { ok: false, errors: ["This sale was already recorded."] } : buildSale({ ...ctx, id, receiptNo: nextReceiptNo(s.S), lines, P: s.P, M: s.M, payment, now: Date.now() }))); },
    cancelSale: async (saleId) => done(await transact<object>((s) => { const sale = find(s.S, saleId); return sale ? buildCancel({ ...ctx, sale, items: s.SI.filter((i) => i.saleId === saleId), now: Date.now() }) : { ok: false, errors: ["Sale not found."] }; })),
    recordCount: async (productId, counted, reason) => done(await transact<{ count: StockCount }>((s) => { const product = find(s.P, productId); return product ? buildCount({ ...ctx, id: uid(), product, M: s.M, counted, reason, now: Date.now() }) : { ok: false, errors: ["Product not found."] }; })),
    createProduct: async (input) => done(await transact<{ product: Product }>((s) => buildProductCreate({ ...ctx, id: uid(), input, P: s.P, C: s.CAT, now: Date.now() }))),
    updateProduct: async (id, input) => done(await transact<{ product: Product }>((s) => { const product = find(s.P, id); return product ? buildProductUpdate({ ...ctx, product, input, P: s.P, C: s.CAT, now: Date.now() }) : { ok: false, errors: ["Product not found."] }; })),
    setArchived: async (id, archived) => done(await transact<{ product: Product }>((s) => { const product = find(s.P, id); return product ? buildArchive({ ...ctx, product, archived, now: Date.now() }) : { ok: false, errors: ["Product not found."] }; })),
    deleteProduct: async (id) => done(await transact<object>((s) => { const product = find(s.P, id); return product ? buildProductDelete({ ...ctx, product, M: s.M, SI: s.SI, C: s.C, now: Date.now() }) : { ok: false, errors: ["Product not found."] }; })),
    createCategory: async (name) => done(await transact<{ category: Category }>((s) => buildCategoryCreate({ ...ctx, id: uid(), name, C: s.CAT, now: Date.now() }))),
    renameCategory: async (id, name) => done(await transact<{ category: Category }>((s) => { const category = find(s.CAT, id); return category ? buildCategoryRename({ ...ctx, category, name, C: s.CAT, now: Date.now() }) : { ok: false, errors: ["Category not found."] }; })),
    deleteCategory: async (id) => done(await transact<object>((s) => { const category = find(s.CAT, id); return category ? buildCategoryDelete({ ...ctx, category, P: s.P, now: Date.now() }) : { ok: false, errors: ["Category not found."] }; })),
    resetDemo: async () => { if (mode === "device") await Promise.all(TABLES.map((t) => db[t].clear())); else mem = null; await refresh(); },
  };
}

/** Exposed for tests only. */
export const _internals = { load, transact, uid };
