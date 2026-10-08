import { describe, expect, it } from "vitest";
import { buildArchive, buildCancel, buildCategoryDelete, buildCategoryRename, buildCategoryCreate, buildCount, buildProductCreate, buildProductDelete, buildProductUpdate, buildSale, inventory, validateProduct, type Category, type ProductInput, nextReceiptNo, salesOn, startOfDay, type Movement, type Product, type Sale } from "./engine";

const B = "t";
const base0 = { businessId: B, unit: "piece", archived: false, createdAt: 0, updatedAt: 0 };
const milk: Product = { ...base0, id: "1", name: "Milk", sku: "M", cost: 50, price: 70, min: 5 };
const coke: Product = { ...base0, id: "2", name: "Coke", sku: "C", cost: 45, price: 60, min: 5 };
const mv = (productId: string, type: Movement["type"], qty: number, ts = 1): Movement => ({ businessId: B, productId, type, qty, ts, staff: "x" });
const now = Date.now();

describe("stock is the sum of movements", () => {
  it("100 +50 -20 -5 -3 = 122", () => {
    const M = [mv("1", "purchase", 100), mv("1", "purchase", 50), mv("1", "sale", -20), mv("1", "damage", -5), mv("1", "adjustment", -3)];
    expect(inventory([milk], M)[0].stock).toBe(122);
  });
});

describe("sales", () => {
  const M = [mv("1", "purchase", 10), mv("2", "purchase", 10)];
  const base = { businessId: B, id: "s1", receiptNo: "SL-1001", P: [milk, coke], M, staff: "James", payment: "cash" as const, now };

  it("rejects selling more than is available", () => {
    const r = buildSale({ ...base, lines: [{ productId: "1", qty: 12 }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toContain("only 10 available");
  });
  it("rejects zero, negative and fractional quantities", () => {
    for (const qty of [0, -1, 1.5]) expect(buildSale({ ...base, lines: [{ productId: "1", qty }] }).ok).toBe(false);
  });
  it("rejects an empty cart and duplicate lines", () => {
    expect(buildSale({ ...base, lines: [] }).ok).toBe(false);
    expect(buildSale({ ...base, lines: [{ productId: "1", qty: 1 }, { productId: "1", qty: 1 }] }).ok).toBe(false);
  });
  it("builds a multi-item sale with matching movements and total", () => {
    const r = buildSale({ ...base, lines: [{ productId: "1", qty: 2 }, { productId: "2", qty: 3 }] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.sale.total).toBe(2 * 70 + 3 * 60);
      expect(r.movements.map((m) => m.qty)).toEqual([-2, -3]);
      expect(r.audit[0].action).toBe("sale.created");
    }
  });
  it("keeps the price a sale was made at after the product price changes", () => {
    const r = buildSale({ ...base, lines: [{ productId: "1", qty: 1 }] });
    if (!r.ok) throw new Error("setup");
    const repriced: Product = { ...milk, price: 99 };
    expect(repriced.price).toBe(99);
    expect(salesOn([r.sale], r.items, startOfDay(now))).toBe(70);
  });
});

describe("cancelling a sale", () => {
  it("returns stock and drops the sale from totals", () => {
    const M = [mv("1", "purchase", 10)];
    const r = buildSale({ businessId: B, id: "s1", receiptNo: "SL-1001", lines: [{ productId: "1", qty: 4 }], P: [milk], M, staff: "J", payment: "mpesa", now });
    if (!r.ok) throw new Error("setup");
    const c = buildCancel({ businessId: B, sale: r.sale, items: r.items, staff: "J", now });
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    const all = [...M, ...r.movements, ...c.movements];
    expect(inventory([milk], all)[0].stock).toBe(10);
    const cancelled: Sale = { ...r.sale, status: "cancelled" };
    expect(salesOn([cancelled], r.items, startOfDay(now))).toBe(0);
    expect(buildCancel({ businessId: B, sale: cancelled, items: r.items, staff: "J", now }).ok).toBe(false);
  });
});

describe("stock count", () => {
  const M = [mv("1", "purchase", 29)];
  const a = { businessId: B, id: "c1", product: milk, M, staff: "Mary", now };
  it("records the difference as a movement", () => {
    const r = buildCount({ ...a, counted: 23, reason: "Missing" });
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.count.diff).toBe(-6); expect(r.movements[0].qty).toBe(-6); }
  });
  it("needs a reason when the numbers differ, not when they match", () => {
    expect(buildCount({ ...a, counted: 23, reason: "" }).ok).toBe(false);
    const ok = buildCount({ ...a, counted: 29, reason: "" });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.movements).toHaveLength(0);
  });
  it("rejects invalid counts", () => {
    for (const counted of [-1, 2.5, NaN]) expect(buildCount({ ...a, counted, reason: "Other" }).ok).toBe(false);
  });
});

describe("receipt numbers", () => {
  it("continue from the highest existing number", () => {
    const s = (n: string) => ({ receiptNo: n }) as Sale;
    expect(nextReceiptNo([])).toBe("SL-1001");
    expect(nextReceiptNo([s("SL-1005"), s("SL-1002")])).toBe("SL-1006");
  });
});

describe("products", () => {
  const input: ProductInput = { name: "Tea", sku: "TEA1", unit: "pack", cost: 90, price: 120, min: 5 };
  const mk = (over: Partial<ProductInput> = {}, P: Product[] = [milk]) => validateProduct({ ...input, ...over }, P, []);
  it("accepts a valid product", () => expect(mk().errors).toEqual([]));
  it("requires a name and a SKU", () => { expect(mk({ name: "  " }).errors.length).toBe(1); expect(mk({ sku: "" }).errors.length).toBe(1); });
  it("keeps SKUs unique, ignoring case, but lets a product keep its own SKU", () => {
    expect(mk({ sku: "m" }).errors[0]).toContain("already used");
    expect(validateProduct({ ...input, sku: "M" }, [milk], [], milk.id).errors).toEqual([]);
  });
  it("rejects negative or invalid prices and minimum stock", () => {
    expect(mk({ price: -1 }).errors.length).toBe(1);
    expect(mk({ cost: NaN }).errors.length).toBe(1);
    expect(mk({ min: -2 }).errors.length).toBe(1);
    expect(mk({ min: 1.5 }).errors.length).toBe(1);
  });
  it("rejects unknown units and warns when selling below cost", () => {
    expect(mk({ unit: "kg" }).errors.length).toBe(1);
    expect(mk({ price: 50 }).warnings.length).toBe(1);
  });
  it("creates a product with opening stock as a movement, never as a stored number", () => {
    const r = buildProductCreate({ businessId: B, id: "n1", input: { ...input, openingStock: 12 }, P: [milk], C: [], staff: "J", now });
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.movements[0]).toMatchObject({ type: "opening", qty: 12, productId: "n1" }); expect("stock" in r.product).toBe(false); }
  });
  it("changing a price audits the change and leaves past sales untouched", () => {
    const M = [mv("1", "purchase", 10)];
    const sold = buildSale({ businessId: B, id: "s1", receiptNo: "SL-1001", lines: [{ productId: "1", qty: 2 }], P: [milk], M, staff: "J", payment: "cash", now });
    if (!sold.ok) throw new Error("setup");
    const r = buildProductUpdate({ businessId: B, product: milk, input: { ...input, name: "Milk", sku: "M", price: 99 }, P: [milk], C: [], staff: "J", now });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.product.price).toBe(99);
    expect(r.audit.find((a) => a.action === "product.price_changed")).toMatchObject({ oldValue: "70", newValue: "99" });
    expect(salesOn([sold.sale], sold.items, startOfDay(now))).toBe(140);
  });
  it("blocks deleting a product with history, allows it without, and archiving stops sales", () => {
    const M = [mv("1", "purchase", 5)];
    expect(buildProductDelete({ businessId: B, product: milk, M, SI: [], C: [], staff: "J", now }).ok).toBe(false);
    expect(buildProductDelete({ businessId: B, product: milk, M: [], SI: [], C: [], staff: "J", now }).ok).toBe(true);
    const a = buildArchive({ businessId: B, product: milk, archived: true, staff: "J", now });
    if (!a.ok) throw new Error("setup");
    const r = buildSale({ businessId: B, id: "s2", receiptNo: "SL-1002", lines: [{ productId: "1", qty: 1 }], P: [a.product], M, staff: "J", payment: "cash", now });
    expect(r.ok).toBe(false);
  });
});

describe("categories", () => {
  const cat: Category = { id: "c1", businessId: B, name: "Dairy" };
  it("rejects blank and duplicate names, including on rename", () => {
    expect(buildCategoryCreate({ businessId: B, id: "c2", name: " ", C: [cat], staff: "J", now }).ok).toBe(false);
    expect(buildCategoryCreate({ businessId: B, id: "c2", name: "dairy", C: [cat], staff: "J", now }).ok).toBe(false);
    const other: Category = { id: "c2", businessId: B, name: "Bakery" };
    expect(buildCategoryRename({ businessId: B, category: other, name: "DAIRY", C: [cat, other], staff: "J", now }).ok).toBe(false);
    expect(buildCategoryRename({ businessId: B, category: cat, name: "Dairy", C: [cat, other], staff: "J", now }).ok).toBe(true);
  });
  it("won't delete a category that products still use", () => {
    const used = { ...milk, categoryId: "c1" };
    const r = buildCategoryDelete({ businessId: B, category: cat, P: [used], staff: "J", now });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toContain("still uses");
    expect(buildCategoryDelete({ businessId: B, category: cat, P: [milk], staff: "J", now }).ok).toBe(true);
  });
});
