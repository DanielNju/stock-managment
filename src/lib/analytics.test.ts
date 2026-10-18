import { describe, expect, it } from "vitest";
import { DAY, startOfDay, type Movement, type Product, type Sale, type SaleItem } from "./engine";
import { activityFeed, attention, restockPlan, stockLosses, topProducts, totalsBetween, trend, valueByCategory, type Books } from "./analytics";

const B = "t", NOW = new Date("2026-10-09T15:00:00").getTime(), T0 = startOfDay(NOW);
const prod = (id: string, name: string, cost: number, price: number, min = 5, extra: Partial<Product> = {}): Product =>
  ({ id, businessId: B, name, sku: id, unit: "piece", cost, price, min, archived: false, createdAt: NOW - 90 * DAY, updatedAt: 0, ...extra });
const mv = (productId: string, type: Movement["type"], qty: number, daysAgo = 0, extra: Partial<Movement> = {}): Movement =>
  ({ businessId: B, productId, type, qty, ts: NOW - daysAgo * DAY, staff: "J", ...extra });
let n = 0;
const sale = (daysAgo: number, lines: [string, number, number, number][], status: Sale["status"] = "completed") => {
  const id = `s${++n}`, ts = T0 - daysAgo * DAY + 10 * 36e5;
  const items: SaleItem[] = lines.map(([productId, qty, unitPrice, unitCost]) => ({ saleId: id, productId, qty, unitPrice, unitCost }));
  const s: Sale = { id, businessId: B, receiptNo: `SL-${1000 + n}`, ts, staff: "J", payment: "cash", total: items.reduce((a, i) => a + i.qty * i.unitPrice, 0), status };
  return { s, items, moves: lines.map(([productId, qty]) => mv(productId, "sale", -qty, 0, { ts, refId: id })) };
};
const books = (o: Partial<Books> & { sales?: ReturnType<typeof sale>[] } = {}): Books => {
  const sales = o.sales ?? [];
  return { P: [], CAT: [], M: [], S: sales.map((x) => x.s), SI: sales.flatMap((x) => x.items), C: [], SUP: [], PU: [], PI: [], RC: [], RI: [], ...o, ...(o.sales ? { M: [...(o.M ?? []), ...sales.flatMap((x) => x.moves)] } : {}) };
};

describe("gross profit", () => {
  it("is sales minus the cost saved on each sale, and ignores cancelled sales", () => {
    const b = books({ sales: [sale(0, [["a", 3, 100, 60]]), sale(0, [["a", 1, 100, 60], ["b", 2, 50, 30]]), sale(0, [["a", 10, 100, 60]], "cancelled")] });
    const t = totalsBetween(b, T0, T0 + DAY);
    expect(t.sales).toBe(300 + 100 + 100);
    expect(t.profit).toBe(3 * 40 + 1 * 40 + 2 * 20); // 200
    expect(t.margin).toBeCloseTo(40, 5);
  });
  it("is not rewritten when the product cost changes later", () => {
    const old = sale(1, [["a", 2, 100, 60]]);
    const b = books({ P: [prod("a", "A", 999, 100)], sales: [old] });
    expect(totalsBetween(b, T0 - DAY, T0).profit).toBe(80);
  });
  it("reports no margin when there were no sales", () => { expect(totalsBetween(books(), T0, T0 + DAY).margin).toBeNull(); });
});

describe("trend and top products", () => {
  const b = books({ P: [prod("a", "Alpha", 60, 100), prod("b", "Beta", 30, 50)], sales: [sale(0, [["a", 2, 100, 60]]), sale(1, [["b", 4, 50, 30]]), sale(1, [["a", 1, 100, 60]]), sale(10, [["b", 100, 50, 30]]), sale(0, [["a", 50, 100, 60]], "cancelled")] });
  it("gives one point per day, ending today, with matching totals", () => {
    const t = trend(b, 7, NOW);
    expect(t.points).toHaveLength(7);
    expect(t.points[6].sales).toBe(200); expect(t.points[6].profit).toBe(80);
    expect(t.points[5].sales).toBe(4 * 50 + 100);
    expect(t.totals.sales).toBe(200 + 300); // the 10-day-old sale is outside 7 days
    expect(trend(b, 30, NOW).totals.sales).toBe(200 + 300 + 5000);
  });
  it("ranks products by sales within the period, with profit and margin", () => {
    const top = topProducts(b, 7, NOW);
    expect(top.map((r) => r.name)).toEqual(["Alpha", "Beta"]);
    expect(top[0]).toMatchObject({ units: 3, sales: 300, profit: 120 });
    expect(top[0].margin).toBeCloseTo(40, 5);
    expect(topProducts(b, 30, NOW)[0].name).toBe("Beta"); // 104 units of Beta over 30 days
  });
});

describe("stock losses", () => {
  it("adds up removed stock from counts, adjustments and damage at cost", () => {
    const b = books({ P: [prod("a", "A", 20, 30)], M: [mv("a", "count", -3, 1), mv("a", "adjustment", -2, 2), mv("a", "damage", -1, 3), mv("a", "count", 4, 1), mv("a", "sale", -9, 1), mv("a", "count", -50, 40)] });
    expect(stockLosses(b, 7, NOW)).toEqual({ units: 6, value: 120 });
  });
});

describe("restock plan", () => {
  const cost = 10;
  const mk = (id: string, min = 5, extra: Partial<Product> = {}) => prod(id, id.toUpperCase(), cost, 15, min, extra);
  it("suggests 14 days of sales plus the minimum, minus stock and what is on order", () => {
    // A: opening 40, sold 28 over two days -> 2 a day over the 14-day window, stock 12 (above min 5), about 6 days left
    const b = books({ P: [mk("a")], M: [mv("a", "opening", 40, 20)], sales: [sale(1, [["a", 14, 15, cost]]), sale(2, [["a", 14, 15, cost]])] });
    const r = restockPlan(b, NOW)[0];
    expect(r.item.stock).toBe(12);
    expect(r.item.status).toBe("ok");
    expect(r.perDay).toBeCloseTo(2, 5);
    expect(r.daysLeft).toBeCloseTo(6, 5);
    expect(r.suggested).toBe(Math.ceil(2 * 14 + 5 - 12)); // 21
    expect(r.cost).toBe(21 * cost);
  });
  it("leaves out well-stocked and archived products, includes low ones, and orders by urgency", () => {
    const b = books({
      P: [mk("a"), mk("z"), mk("c"), mk("x", 5, { archived: true }), mk("o")],
      M: [mv("a", "opening", 40, 20), mv("z", "opening", 2, 20), mv("c", "opening", 200, 20), mv("x", "opening", 0, 20), mv("o", "opening", 0, 20)],
      sales: [sale(1, [["a", 14, 15, cost]]), sale(2, [["a", 14, 15, cost]])] });
    const rows = restockPlan(b, NOW);
    expect(rows.map((r) => r.item.id)).toEqual(["o", "a", "z"]); // out of stock first, then least time left, then the rest
    const z = rows.find((r) => r.item.id === "z")!;
    expect(z.perDay).toBe(0); expect(z.daysLeft).toBeNull(); expect(z.suggested).toBe(3); // the minimum (5) less stock (2)
  });
  it("counts stock already on order against the suggestion", () => {
    const po = { id: "po1", businessId: B, ref: "PO-1", supplierId: "s", ts: NOW - DAY, staff: "J", status: "ordered" as const };
    const b = books({ P: [mk("z")], M: [mv("z", "opening", 0, 20)], PU: [po], PI: [{ purchaseId: "po1", productId: "z", qty: 10, unitCost: 8 }] });
    const r = restockPlan(b, NOW)[0];
    expect(r.onOrder).toBe(10); expect(r.suggested).toBe(0);
  });
});

describe("inventory value by category", () => {
  it("adds up to total inventory value and shares to 100%", () => {
    const b = books({ CAT: [{ id: "c1", businessId: B, name: "Drinks" }], P: [prod("a", "A", 10, 15, 1, { categoryId: "c1" }), prod("b", "B", 20, 30, 1, { categoryId: "c1" }), prod("c", "C", 5, 8, 1), prod("d", "D", 100, 150, 1, { archived: true })],
      M: [mv("a", "opening", 10), mv("b", "opening", 5), mv("c", "opening", 4), mv("d", "opening", 9)] });
    const v = valueByCategory(b, NOW);
    expect(v.total).toBe(100 + 100 + 20);
    expect(v.rows.map((r) => [r.name, r.value, r.products, r.units])).toEqual([["Drinks", 200, 2, 15], ["No category", 20, 1, 4]]);
    expect(v.rows.reduce((a, r) => a + r.share, 0)).toBeCloseTo(100, 5);
  });
});

describe("needs attention", () => {
  const po = (id: string, status: "draft" | "ordered" | "cancelled", ts = NOW - 3 * DAY) => ({ id, businessId: B, ref: id.toUpperCase(), supplierId: "s1", ts, staff: "J", status });
  const base = (): Books => books({ SUP: [{ id: "s1", businessId: B, name: "Sup", archived: false, createdAt: 0, updatedAt: 0 }],
    P: [prod("out", "Out item", 10, 15, 5), prod("low", "Low item", 10, 15, 5), prod("ok", "Fine item", 10, 15, 5), prod("slow", "Slow item", 10, 15, 1)],
    M: [mv("out", "opening", 0, 50), mv("low", "opening", 3, 50), mv("ok", "opening", 50, 50), mv("slow", "opening", 9, 50)],
    C: [{ id: "c1", businessId: B, ts: NOW - DAY, staff: "Mary", productId: "ok", expected: 50, counted: 44, diff: -6, reason: "Missing" }, { id: "c2", businessId: B, ts: NOW - 20 * DAY, staff: "Mary", productId: "ok", expected: 1, counted: 0, diff: -1, reason: "Old" }, { id: "c3", businessId: B, ts: NOW - DAY, staff: "Mary", productId: "ok", expected: 1, counted: 2, diff: 1, reason: "" }],
    PU: [po("po1", "ordered"), po("po2", "ordered"), po("po3", "draft"), po("po4", "cancelled")],
    PI: [{ purchaseId: "po1", productId: "out", qty: 10, unitCost: 8 }, { purchaseId: "po2", productId: "low", qty: 10, unitCost: 8 }, { purchaseId: "po3", productId: "low", qty: 5, unitCost: 8 }, { purchaseId: "po4", productId: "low", qty: 5, unitCost: 8 }],
    RC: [{ id: "r1", businessId: B, purchaseId: "po2", ts: NOW - DAY, staff: "J" }], RI: [{ receiptId: "r1", productId: "low", qty: 4 }] });
  it("orders items: out, low, count shortages, purchases still waiting, slow stock", () => {
    const items = attention(base(), NOW);
    expect(items.map((i) => i.kind)).toEqual(["out", "low", "count", "purchase", "purchase", "slow"]);
  });
  it("only flags recent shortages, and only orders that are not fully received, draft or cancelled", () => {
    const items = attention(base(), NOW);
    expect(items.filter((i) => i.kind === "count")).toHaveLength(1); // old one and the surplus are left out
    const ps = items.filter((i) => i.kind === "purchase") as Extract<(typeof items)[number], { kind: "purchase" }>[];
    expect(ps.map((p) => [p.ref, p.state, p.received, p.ordered])).toEqual([["PO1", "ordered", 0, 10], ["PO2", "partial", 4, 10]]);
    expect(ps[1].outstandingValue).toBe(6 * 8);
  });
  it("says what is already on order for a low or out item", () => {
    const items = attention(base(), NOW);
    expect((items[0] as { onOrder: number }).onOrder).toBe(10);
    expect((items[1] as { onOrder: number }).onOrder).toBe(6);
  });
});

describe("activity feed", () => {
  it("lists sales, cancellations, deliveries, adjustments and counts, newest first, each cancellation once", () => {
    const s1 = sale(1, [["a", 2, 100, 60]]), s2 = sale(0, [["a", 1, 100, 60]], "cancelled");
    const b = books({ P: [prod("a", "Alpha", 60, 100)], SUP: [{ id: "s1", businessId: B, name: "Sup", archived: false, createdAt: 0, updatedAt: 0 }], sales: [s1, s2],
      M: [mv("a", "return", 1, 0, { refId: s2.s.id, reason: "Sale cancelled", ts: s2.s.ts + 36e5, staff: "Mary" }), mv("a", "adjustment", -2, 2, { reason: "Damaged" })],
      PU: [{ id: "po1", businessId: B, ref: "PO-1", supplierId: "s1", ts: NOW - 5 * DAY, staff: "J", status: "ordered" }], RC: [{ id: "r1", businessId: B, purchaseId: "po1", ts: NOW - 3 * DAY, staff: "Mary" }], RI: [{ receiptId: "r1", productId: "a", qty: 7 }],
      C: [{ id: "c1", businessId: B, ts: NOW - 4 * DAY, staff: "Brian", productId: "a", expected: 9, counted: 7, diff: -2, reason: "Missing" }] });
    const f = activityFeed(b);
    expect(f.map((e) => e.kind)).toEqual(["cancel", "sale", "sale", "adjust", "delivery", "count"]); // newest first
    expect(f.filter((e) => e.kind === "cancel")).toHaveLength(1);
    expect(f.find((e) => e.kind === "cancel")).toMatchObject({ staff: "Mary", subject: s2.s.receiptNo, detail: "1 unit returned to stock" });
    expect(f.find((e) => e.kind === "delivery")).toMatchObject({ staff: "Mary", subject: "PO-1 · Sup", href: "/purchases/po1" });
    expect(f.find((e) => e.kind === "count")?.subject).toBe("Alpha: 2 short");
    expect(f.find((e) => e.kind === "adjust")).toMatchObject({ subject: "Alpha −2", detail: "Damaged" });
    expect(f.filter((e) => e.kind === "sale")).toHaveLength(2);
    expect([...f].sort((x, y) => y.ts - x.ts).map((e) => e.id)).toEqual(f.map((e) => e.id));
  });
});
