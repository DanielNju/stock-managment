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
    expect(snap.P.some((p) => p.name === "old")).toBe(false); // old demo data cleared
    expect(snap.P).toHaveLength(10);
    expect(snap.CAT.length).toBeGreaterThan(0);
    expect(snap.S.length).toBeGreaterThan(20);

    const stockOf = (sn: typeof snap, id: string) => inventory(sn.P, sn.M).find((p) => p.id === id)!.stock;
    const before = stockOf(snap, "p7"); // Maize flour: plenty in stock
    const sell = (qty: number, id = s.uid()) => s.transact<object>((x) =>
      x.S.some((r) => r.id === id) ? { ok: false, errors: ["dup"] }
        : buildSale({ businessId: "t", id, receiptNo: nextReceiptNo(x.S), lines: [{ productId: "p7", qty }], P: x.P, M: x.M, staff: "J", payment: "cash", now: Date.now() }));

    // a good sale writes the sale, its items and its movements together
    const id = s.uid();
    expect((await sell(2, id)).ok).toBe(true);
    const after = await s.load();
    expect(after.S.some((r) => r.id === id)).toBe(true);
    expect(after.SI.filter((i) => i.saleId === id)).toHaveLength(1);
    expect(stockOf(after, "p7")).toBe(before - 2);

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
    const left = stockOf(final, "p7");
    const [a, b] = await Promise.all([sell(left), sell(left)]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect(stockOf(await s.load(), "p7")).toBe(0);
  });

  it("saves products and categories with the same safety rules", async () => {
    const { _internals: s } = await import("./store");
    const E = await import("./engine");
    const mk = (over: Partial<import("./engine").ProductInput> = {}) => s.transact<{ product: import("./engine").Product }>((x) =>
      E.buildProductCreate({ businessId: "t", id: s.uid(), input: { name: "Test item", sku: "TEST1", unit: "pack", cost: 10, price: 15, min: 2, openingStock: 5, ...over }, P: x.P, C: x.CAT, staff: "J", now: Date.now() }));

    const start = await s.load();
    const r = await mk();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const id = r.value.product.id;
    let snap = await s.load();
    expect(snap.P).toHaveLength(start.P.length + 1);
    expect(E.inventory(snap.P, snap.M).find((p) => p.id === id)!.stock).toBe(5); // from the opening movement

    expect((await mk({ sku: "test1" })).ok).toBe(false); // duplicate SKU, any case
    expect((await s.load()).P).toHaveLength(snap.P.length);

    // has history (opening stock), so deleting is refused; archiving works and keeps history
    const del = await s.transact<object>((x) => E.buildProductDelete({ businessId: "t", product: x.P.find((p) => p.id === id)!, M: x.M, SI: x.SI, C: x.C, staff: "J", now: 1 }));
    expect(del.ok).toBe(false);
    const arc = await s.transact<object>((x) => E.buildArchive({ businessId: "t", product: x.P.find((p) => p.id === id)!, archived: true, staff: "J", now: 1 }));
    expect(arc.ok).toBe(true);
    snap = await s.load();
    expect(snap.P.find((p) => p.id === id)!.archived).toBe(true);

    // a category in use can't be deleted; an unused one can
    const used = snap.CAT.find((c) => c.id === "c-groc")!;
    expect((await s.transact<object>((x) => E.buildCategoryDelete({ businessId: "t", category: used, P: x.P, staff: "J", now: 1 }))).ok).toBe(false);
    const made = await s.transact<{ category: import("./engine").Category }>((x) => E.buildCategoryCreate({ businessId: "t", id: s.uid(), name: "Temp", C: x.CAT, staff: "J", now: 1 }));
    expect(made.ok).toBe(true);
    if (!made.ok) return;
    const cat = made.value.category;
    expect((await s.transact<object>((x) => E.buildCategoryDelete({ businessId: "t", category: cat, P: x.P, staff: "J", now: 1 }))).ok).toBe(true);
    expect((await s.load()).CAT.some((c) => c.id === cat.id)).toBe(false);
  });
});
