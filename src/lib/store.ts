import Dexie, { type Table } from "dexie";
import { useCallback, useEffect, useState } from "react";
import { BUSINESS_ID, CURRENT_STAFF } from "../config";
import { buildCancel, buildCount, buildSale, nextReceiptNo, type AuditEntry, type Fail, type Line, type Movement, type Payment, type Product, type Sale, type SaleItem, type StockCount, type Writes } from "./engine";
import { seed, type SeedData } from "./seed";

class StockDB extends Dexie {
  products!: Table<Product, number>; movements!: Table<Movement, number>; sales!: Table<Sale, string>;
  saleItems!: Table<SaleItem, number>; counts!: Table<StockCount, string>; audit!: Table<AuditEntry, number>;
  constructor() {
    super("stockly");
    this.version(1).stores({ products: "id", movements: "++id,productId,ts" });
    // v2: real sales, historical prices, stock counts, audit log. v1 held demo data only, so it is cleared and re-seeded.
    this.version(2).stores({ products: "id", movements: "++id,productId,ts,refId", sales: "id,ts,receiptNo", saleItems: "++id,saleId,productId", counts: "id,ts,productId", audit: "++id,ts,entity" })
      .upgrade((tx) => Promise.all([tx.table("products").clear(), tx.table("movements").clear()]));
  }
}
const db = new StockDB();
let mem: SeedData | null = null; // fallback when IndexedDB is blocked
let mode: "device" | "memory" = "device";
let memId = 1_000_000;

export interface Snapshot { P: Product[]; M: Movement[]; S: Sale[]; SI: SaleItem[]; C: StockCount[]; mode: "device" | "memory" }
export type Result<T> = { ok: true; value: T } | Fail;
export interface StockCtx {
  state: Snapshot | null;
  recordSale: (lines: Line[], payment: Payment) => Promise<Result<{ sale: Sale; items: SaleItem[] }>>;
  cancelSale: (saleId: string) => Promise<Result<null>>;
  recordCount: (productId: number, counted: number, reason: string) => Promise<Result<StockCount>>;
  resetDemo: () => Promise<void>;
}
const uid = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`);

async function read(): Promise<Snapshot> {
  if (mode === "device") return { mode, P: await db.products.toArray(), M: await db.movements.toArray(), S: await db.sales.toArray(), SI: await db.saleItems.toArray(), C: await db.counts.toArray() };
  const m = mem!; return { mode, P: [...m.products], M: [...m.movements], S: [...m.sales], SI: [...m.saleItems], C: [...m.counts] };
}
async function write(w: Writes) {
  if (mode === "device") {
    if (w.sale) await db.sales.add(w.sale);
    if (w.items?.length) await db.saleItems.bulkAdd(w.items);
    if (w.movements.length) await db.movements.bulkAdd(w.movements);
    if (w.count) await db.counts.add(w.count);
    if (w.audit.length) await db.audit.bulkAdd(w.audit);
    if (w.voidSaleId) await db.sales.update(w.voidSaleId, { status: "cancelled" });
    return;
  }
  const m = mem!;
  if (w.sale) m.sales.push(w.sale);
  w.items?.forEach((i) => m.saleItems.push({ ...i, id: ++memId }));
  w.movements.forEach((x) => m.movements.push({ ...x, id: ++memId }));
  if (w.count) m.counts.push(w.count);
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
    return mode === "device" ? await db.transaction("rw", [db.products, db.movements, db.sales, db.saleItems, db.counts, db.audit], run) : await run();
  } catch { return { ok: false, errors: ["Could not save. Nothing was changed. Please try again."] }; }
}

async function load(): Promise<Snapshot> {
  try {
    if (!(await db.products.count())) {
      const s = seed();
      await db.transaction("rw", [db.products, db.movements, db.sales, db.saleItems, db.counts, db.audit], async () => {
        await db.products.bulkAdd(s.products); await db.movements.bulkAdd(s.movements); await db.sales.bulkAdd(s.sales);
        await db.saleItems.bulkAdd(s.saleItems); await db.counts.bulkAdd(s.counts); await db.audit.bulkAdd(s.audit);
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

  const recordSale: StockCtx["recordSale"] = async (lines, payment) => {
    const id = uid();
    return done(await transact<{ sale: Sale; items: SaleItem[] }>((s) => s.S.some((x) => x.id === id)
      ? { ok: false, errors: ["This sale was already recorded."] }
      : buildSale({ businessId: BUSINESS_ID, id, receiptNo: nextReceiptNo(s.S), lines, P: s.P, M: s.M, staff: CURRENT_STAFF, payment, now: Date.now() })));
  };
  const cancelSale: StockCtx["cancelSale"] = async (saleId) =>
    done(await transact<object>((s) => {
      const sale = s.S.find((x) => x.id === saleId);
      return sale ? buildCancel({ businessId: BUSINESS_ID, sale, items: s.SI.filter((i) => i.saleId === saleId), staff: CURRENT_STAFF, now: Date.now() }) : { ok: false, errors: ["Sale not found."] };
    }).then((r) => (r.ok ? { ok: true as const, value: null } : r)));
  const recordCount: StockCtx["recordCount"] = async (productId, counted, reason) =>
    done(await transact<{ count: StockCount }>((s) => {
      const product = s.P.find((p) => p.id === productId);
      return product ? buildCount({ businessId: BUSINESS_ID, id: uid(), product, M: s.M, counted, reason, staff: CURRENT_STAFF, now: Date.now() }) : { ok: false, errors: ["Product not found."] };
    }).then((r) => (r.ok ? { ok: true as const, value: r.value.count } : r)));
  const resetDemo = async () => {
    if (mode === "device") await Promise.all([db.products.clear(), db.movements.clear(), db.sales.clear(), db.saleItems.clear(), db.counts.clear(), db.audit.clear()]);
    else mem = null;
    await refresh();
  };
  return { state, recordSale, cancelSale, recordCount, resetDemo };
}

/** Exposed for tests only. */
export const _internals = { load, transact, uid };
