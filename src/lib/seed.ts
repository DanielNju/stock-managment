import { BUSINESS_ID as B } from "../config";
import {
  DAY,
  HR,
  startOfDay,
  type AuditEntry,
  type Category,
  type Movement,
  type Payment,
  type Product,
  type Purchase,
  type PurchaseItem,
  type Receipt,
  type ReceiptItem,
  type Sale,
  type SaleItem,
  type StockCount,
  type Supplier,
} from "./engine";

// id, name, sku, cost, price, min, avg units/day, target stock today, category, unit
const RAW: [
  string,
  string,
  string,
  number,
  number,
  number,
  number,
  number,
  string,
  string,
][] = [
  ["p1", "Coca-Cola 500ml", "COKE500", 45, 60, 15, 6, 8, "c-bev", "bottle"],
  ["p2", "Milk 500ml", "MILK500", 52, 70, 12, 5, 5, "c-dairy", "pack"],
  ["p3", "Sugar 1kg", "SUGAR1", 150, 180, 10, 2, 29, "c-groc", "pack"],
  ["p4", "Bread 400g", "BREAD400", 50, 65, 10, 6, 22, "c-bake", "piece"],
  ["p5", "Cooking Oil 1L", "OIL1L", 260, 310, 8, 2, 14, "c-groc", "bottle"],
  ["p6", "Rice 2kg", "RICE2", 290, 340, 8, 1.5, 18, "c-groc", "pack"],
  ["p7", "Maize Flour 2kg", "FLOUR2", 120, 145, 12, 3, 40, "c-groc", "pack"],
  ["p8", "Soap Bar", "SOAP", 60, 80, 10, 0, 30, "c-home", "piece"],
  ["p9", "Biscuits Pack", "BISC", 35, 50, 15, 0, 26, "c-snack", "pack"],
  ["p10", "Tea Leaves 250g", "TEA250", 95, 120, 8, 1.5, 9, "c-bev", "pack"],
];
const CATEGORIES: [string, string][] = [
  ["c-bev", "Beverages"],
  ["c-dairy", "Dairy"],
  ["c-bake", "Bakery"],
  ["c-groc", "Groceries"],
  ["c-home", "Household"],
  ["c-snack", "Snacks"],
];
const STAFF = ["James", "Mary", "Brian"];
export interface SeedData {
  categories: Category[];
  products: Product[];
  movements: Movement[];
  sales: Sale[];
  saleItems: SaleItem[];
  counts: StockCount[];
  audit: AuditEntry[];
  suppliers: Supplier[];
  purchases: Purchase[];
  purchaseItems: PurchaseItem[];
  receipts: Receipt[];
  receiptItems: ReceiptItem[];
}

export function seed(now = Date.now()): SeedData {
  let s = 7;
  const rnd = () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = () => STAFF[Math.floor(rnd() * 3)];
  const t0 = startOfDay(now);
  const categories: Category[] = CATEGORIES.map(([id, name]) => ({
    id,
    businessId: B,
    name,
  }));
  const products: Product[] = RAW.map(
    ([id, name, sku, cost, price, min, , , categoryId, unit]) => ({
      id,
      businessId: B,
      name,
      sku,
      categoryId,
      unit,
      cost,
      price,
      min,
      archived: false,
      createdAt: t0 - 60 * DAY,
      updatedAt: t0 - 60 * DAY,
    }),
  );
  const cost = new Map(RAW.map((r) => [r[0], r[3]]));
  const M: Movement[] = [],
    drafts: {
      ts: number;
      staff: string;
      payment: Payment;
      lines: { p: Product; qty: number }[];
    }[] = [];
  const mv = (
    productId: string,
    type: Movement["type"],
    qty: number,
    ts: number,
    staff: string,
    refId?: string,
    reason?: string,
  ) =>
    M.push({ businessId: B, productId, type, qty, ts, staff, refId, reason });
  // Coca-Cola cost KES 55 more than a week ago: shows that sales keep the price they were made at
  const priceAt = (p: Product, d: number) =>
    p.id === "p1" && d > 7 ? 55 : p.price;

  for (let d = 13; d >= 0; d--) {
    const k = d === 0 ? 3 : 4,
      baskets = Array.from(
        { length: k },
        () => [] as { p: Product; qty: number }[],
      );
    for (const [i, raw] of RAW.entries()) {
      const rate = raw[6];
      if (rate <= 0) continue;
      const qty =
        d > 0
          ? Math.round(rate * (0.6 + rnd() * 0.8))
          : Math.max(1, Math.round(rate * (0.5 + rnd())));
      if (qty > 0)
        baskets[Math.floor(rnd() * k)].push({
          p: { ...products[i], price: priceAt(products[i], d) },
          qty,
        });
    }
    for (const lines of baskets)
      if (lines.length)
        drafts.push({
          ts:
            d > 0
              ? t0 - d * DAY + (8 + rnd() * 10) * HR
              : Math.max(t0 + 6e4, now - rnd() * 6 * HR),
          staff: pick(),
          payment: rnd() < 0.55 ? "mpesa" : "cash",
          lines,
        });
  }
  drafts.push({
    ts: t0 - 45 * DAY,
    staff: "Mary",
    payment: "cash",
    lines: [{ p: products[7], qty: 2 }],
  });
  drafts.push({
    ts: t0 - 44 * DAY,
    staff: "Mary",
    payment: "cash",
    lines: [{ p: products[8], qty: 3 }],
  });
  drafts.sort((a, b) => a.ts - b.ts);

  const sales: Sale[] = [],
    saleItems: SaleItem[] = [];
  drafts.forEach((d, i) => {
    const id = `seed-sale-${i}`;
    const items = d.lines.map((l) => ({
      saleId: id,
      productId: l.p.id,
      qty: l.qty,
      unitPrice: l.p.price,
      unitCost: l.p.cost,
    }));
    sales.push({
      id,
      businessId: B,
      receiptNo: `SL-${1001 + i}`,
      ts: d.ts,
      staff: d.staff,
      payment: d.payment,
      total: items.reduce((a, x) => a + x.qty * x.unitPrice, 0),
      status: "completed",
    });
    items.forEach((x) => {
      saleItems.push(x);
      mv(x.productId, "sale", -x.qty, d.ts, d.staff, id);
    });
  });

  const counts: StockCount[] = [],
    audit: AuditEntry[] = [];
  const count = (
    id: string,
    productId: string,
    diff: number,
    ts: number,
    staff: string,
    reason: string,
  ) => {
    counts.push({
      id,
      businessId: B,
      ts,
      staff,
      productId,
      expected: 0,
      counted: 0,
      diff,
      reason,
    });
    mv(productId, "count", diff, ts, staff, id, reason);
    audit.push({
      businessId: B,
      ts,
      staff,
      action: "stock.counted",
      entity: "product",
      entityId: productId,
      newValue: String(diff),
    });
  };
  mv("p3", "adjustment", -2, t0 - DAY + 10 * HR, "James", undefined, "Damaged");
  count("seed-count-1", "p3", -6, t0 - 2 * DAY + 17 * HR, "Mary", "Missing");
  count(
    "seed-count-2",
    "p6",
    -3,
    t0 - 2 * DAY + 17.5 * HR,
    "Brian",
    "Counting correction",
  );

  // suppliers and purchases (stock only ever enters through receipts)
  const suppliers: Supplier[] = [
    {
      id: "sup-1",
      businessId: B,
      name: "Mombasa Road Wholesalers",
      contact: "Peter Otieno",
      phone: "+254 700 111 222",
      location: "Industrial Area, Nairobi",
      archived: false,
      createdAt: t0 - 60 * DAY,
      updatedAt: t0 - 60 * DAY,
    },
    {
      id: "sup-2",
      businessId: B,
      name: "Kilimani Dairy Supplies",
      contact: "Grace Wanjiru",
      phone: "+254 711 333 444",
      email: "orders@kilimanidairy.example",
      archived: false,
      createdAt: t0 - 60 * DAY,
      updatedAt: t0 - 60 * DAY,
    },
    {
      id: "sup-3",
      businessId: B,
      name: "Sunrise Bakers",
      phone: "+254 722 555 666",
      notes: "Delivers before 7am",
      archived: false,
      createdAt: t0 - 60 * DAY,
      updatedAt: t0 - 60 * DAY,
    },
  ];
  const purchases: Purchase[] = [],
    purchaseItems: PurchaseItem[] = [],
    receipts: Receipt[] = [],
    receiptItems: ReceiptItem[] = [];
  const po = (
    n: number,
    supplierId: string,
    ts: number,
    status: Purchase["status"],
    lines: [string, number, number][],
    staff = "Mary",
  ) => {
    const id = `seed-po-${n}`;
    purchases.push({
      id,
      businessId: B,
      ref: `PO-${1000 + n}`,
      supplierId,
      ts,
      staff,
      status,
    });
    lines.forEach(([productId, qty, unitCost]) =>
      purchaseItems.push({ purchaseId: id, productId, qty, unitCost }),
    );
    return id;
  };
  const receive = (
    poId: string,
    rid: string,
    ts: number,
    staff: string,
    lines: [string, number][],
  ) => {
    receipts.push({ id: rid, businessId: B, purchaseId: poId, ts, staff });
    lines.forEach(([productId, qty]) => {
      receiptItems.push({ receiptId: rid, productId, qty });
      mv(
        productId,
        "purchase",
        qty,
        ts,
        staff,
        rid,
        purchases.find((x) => x.id === poId)!.ref,
      );
    });
  };
  // PO-1002: milk, 80 ordered yesterday, 50 delivered today (partially received)
  const milk = po(2, "sup-2", t0 - DAY + 9 * HR, "ordered", [["p2", 80, 50]]);
  receive(milk, "seed-rc-2", Math.max(t0 + 6e4, now - 3 * HR), "Mary", [
    ["p2", 50],
  ]);
  // PO-1001: opening delivery, sized so each product ends on its target stock today
  const lines: [string, number, number][] = RAW.map(
    ([id, , , c, , , , target]) => {
      const have = M.filter((m) => m.productId === id).reduce(
        (a, m) => a + m.qty,
        0,
      );
      return [id, Math.max(1, target - have), c];
    },
  );
  const opening = po(1, "sup-1", t0 - 51 * DAY, "ordered", lines);
  receive(
    opening,
    "seed-rc-1",
    t0 - 50 * DAY,
    "Mary",
    lines.map(([id, q]) => [id, q]),
  );
  // PO-1003 ordered, nothing delivered yet; PO-1004 still a draft
  po(3, "sup-1", t0 - 1 * DAY + 11 * HR, "ordered", [
    ["p5", 12, cost.get("p5")!],
    ["p3", 20, cost.get("p3")!],
  ]);
  po(4, "sup-3", t0 + 8 * HR > now ? t0 : t0 + 8 * HR, "draft", [
    ["p4", 40, cost.get("p4")!],
  ]);

  for (const c of counts) {
    // fill in expected/counted now that all movements before each count are known
    const before = M.filter(
      (m) => m.productId === c.productId && m.ts < c.ts,
    ).reduce((a, m) => a + m.qty, 0);
    c.expected = before;
    c.counted = before + c.diff;
  }
  return {
    categories,
    products,
    movements: M,
    sales,
    saleItems,
    counts,
    audit,
    suppliers,
    purchases,
    purchaseItems,
    receipts,
    receiptItems,
  };
}
