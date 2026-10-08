import "fake-indexeddb/auto";
import Dexie from "dexie";
import { describe, expect, it } from "vitest";

describe("store (IndexedDB)", () => {
  it("upgrades an old v1 demo database, then seeds and writes atomically", async () => {
    // an existing v1 database like the first dashboard build created
    const old = new Dexie("stockly");
    old.version(1).stores({ products: "id", movements: "++id,productId,ts" });
    await old.table("products").add({ id: 99, name: "old" });
    await old.table("movements").add({ productId: 99, type: "sale", qty: -1, ts: 1, staff: "x" });
    old.close();

    const { _internals: s } = await import("./store");
    const { buildSale, inventory, nextReceiptNo } = await import("./engine");

    const snap = await s.load();
    expect(snap.mode).toBe("device");
    expect(snap.P.find((p) => p.id === 99)).toBeUndefined(); // old demo data cleared
    expect(snap.P).toHaveLength(10);
    expect(snap.S.length).toBeGreaterThan(20);

    const stockOf = (sn: typeof snap, id: number) => inventory(sn.P, sn.M)[id - 1].stock;
    const before = stockOf(snap, 7); // Maize flour: plenty in stock
    const sell = (qty: number, id = s.uid()) => s.transact<object>((x) =>
      x.S.some((r) => r.id === id) ? { ok: false, errors: ["dup"] }
        : buildSale({ businessId: "t", id, receiptNo: nextReceiptNo(x.S), lines: [{ productId: 7, qty }], P: x.P, M: x.M, staff: "J", payment: "cash", now: Date.now() }));

    // a good sale writes the sale, its items and its movements together
    const id = s.uid();
    expect((await sell(2, id)).ok).toBe(true);
    const after = await s.load();
    expect(after.S.some((r) => r.id === id)).toBe(true);
    expect(after.SI.filter((i) => i.saleId === id)).toHaveLength(1);
    expect(stockOf(after, 7)).toBe(before - 2);

    // a duplicate id is refused and nothing changes
    expect((await sell(1, id)).ok).toBe(false);
    expect((await s.load()).S.length).toBe(after.S.length);

    // overselling is refused and nothing changes
    const r = await sell(before + 500);
    expect(r.ok).toBe(false);
    const final = await s.load();
    expect(final.S.length).toBe(after.S.length);
    expect(final.M.length).toBe(after.M.length);

    // selling the last units twice at the same time: only one can win
    const left = stockOf(final, 7);
    const [a, b] = await Promise.all([sell(left), sell(left)]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect(stockOf(await s.load(), 7)).toBe(0);
  });
});
