import Dexie, { type Table } from "dexie";
import { useCallback, useEffect, useState } from "react";
import type { Movement, Product } from "./engine";
import { seed } from "./seed";

class StockDB extends Dexie {
  products!: Table<Product, number>;
  movements!: Table<Movement, number>;
  constructor() { super("stockly"); this.version(1).stores({ products: "id", movements: "++id,productId,ts" }); }
}
const db = new StockDB();
let mem: ReturnType<typeof seed> | null = null; // fallback if IndexedDB is blocked

export interface StockState { P: Product[]; M: Movement[]; mode: "device" | "memory" }
export interface StockCtx { state: StockState | null; addMovement: (m: Omit<Movement, "id">) => Promise<void>; resetDemo: () => Promise<void> }

async function load(): Promise<StockState> {
  try {
    if (!(await db.products.count())) { const s = seed(); await db.products.bulkAdd(s.products); await db.movements.bulkAdd(s.movements); }
    return { mode: "device", P: await db.products.toArray(), M: await db.movements.toArray() };
  } catch { mem = mem ?? seed(); return { mode: "memory", P: mem.products, M: mem.movements }; }
}

export function useStock(): StockCtx {
  const [state, setState] = useState<StockState | null>(null);
  const refresh = useCallback(async () => setState(await load()), []);
  useEffect(() => { void refresh(); }, [refresh]);
  const addMovement = async (m: Omit<Movement, "id">) => {
    if (state?.mode === "device") await db.movements.add(m as Movement); else mem?.movements.push(m);
    await refresh();
  };
  const resetDemo = async () => {
    if (state?.mode === "device") { await db.products.clear(); await db.movements.clear(); } else mem = null;
    await refresh();
  };
  return { state, addMovement, resetDemo };
}
