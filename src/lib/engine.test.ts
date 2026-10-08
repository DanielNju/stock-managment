import { describe, expect, it } from "vitest";
import { buildCancel, buildCount, buildSale, inventory, nextReceiptNo, salesOn, startOfDay, type Movement, type Product, type Sale } from "./engine";

const B = "t";
const milk: Product = { id: 1, businessId: B, name: "Milk", sku: "M", cost: 50, price: 70, min: 5 };
const coke: Product = { id: 2, businessId: B, name: "Coke", sku: "C", cost: 45, price: 60, min: 5 };
const mv = (productId: number, type: Movement["type"], qty: number, ts = 1): Movement => ({ businessId: B, productId, type, qty, ts, staff: "x" });
const now = Date.now();

describe("stock is the sum of movements", () => {
  it("100 +50 -20 -5 -3 = 122", () => {
    const M = [mv(1, "purchase", 100), mv(1, "purchase", 50), mv(1, "sale", -20), mv(1, "damage", -5), mv(1, "adjustment", -3)];
    expect(inventory([milk], M)[0].stock).toBe(122);
  });
});

describe("sales", () => {
  const M = [mv(1, "purchase", 10), mv(2, "purchase", 10)];
  const base = { businessId: B, id: "s1", receiptNo: "SL-1001", P: [milk, coke], M, staff: "James", payment: "cash" as const, now };

  it("rejects selling more than is available", () => {
    const r = buildSale({ ...base, lines: [{ productId: 1, qty: 12 }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toContain("only 10 available");
  });
  it("rejects zero, negative and fractional quantities", () => {
    for (const qty of [0, -1, 1.5]) expect(buildSale({ ...base, lines: [{ productId: 1, qty }] }).ok).toBe(false);
  });
  it("rejects an empty cart and duplicate lines", () => {
    expect(buildSale({ ...base, lines: [] }).ok).toBe(false);
    expect(buildSale({ ...base, lines: [{ productId: 1, qty: 1 }, { productId: 1, qty: 1 }] }).ok).toBe(false);
  });
  it("builds a multi-item sale with matching movements and total", () => {
    const r = buildSale({ ...base, lines: [{ productId: 1, qty: 2 }, { productId: 2, qty: 3 }] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.sale.total).toBe(2 * 70 + 3 * 60);
      expect(r.movements.map((m) => m.qty)).toEqual([-2, -3]);
      expect(r.audit[0].action).toBe("sale.created");
    }
  });
  it("keeps the price a sale was made at after the product price changes", () => {
    const r = buildSale({ ...base, lines: [{ productId: 1, qty: 1 }] });
    if (!r.ok) throw new Error("setup");
    const repriced: Product = { ...milk, price: 99 };
    expect(repriced.price).toBe(99);
    expect(salesOn([r.sale], r.items, startOfDay(now))).toBe(70);
  });
});

describe("cancelling a sale", () => {
  it("returns stock and drops the sale from totals", () => {
    const M = [mv(1, "purchase", 10)];
    const r = buildSale({ businessId: B, id: "s1", receiptNo: "SL-1001", lines: [{ productId: 1, qty: 4 }], P: [milk], M, staff: "J", payment: "mpesa", now });
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
  const M = [mv(1, "purchase", 29)];
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
