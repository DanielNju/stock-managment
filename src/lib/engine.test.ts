import { describe, expect, it } from "vitest";
import {
  SLOW_DAYS,
  DAY as D1,
  buildPurchaseCancel,
  buildPurchaseCreate,
  buildPurchaseOrder,
  buildPurchaseUpdate,
  buildReceive,
  buildSupplierArchive,
  buildSupplierCreate,
  buildSupplierDelete,
  buildSupplierUpdate,
  nextPurchaseRef,
  purchaseLines,
  purchaseStatus,
  purchaseTotal,
  supplierStats,
  validateSupplier,
  type Purchase,
  type PurchaseItem,
  type Receipt,
  type ReceiptItem,
  type Supplier,
  buildArchive,
  buildCancel,
  buildCategoryDelete,
  buildCategoryRename,
  buildCategoryCreate,
  buildCount,
  buildProductCreate,
  buildProductDelete,
  buildProductUpdate,
  buildSale,
  inventory,
  validateProduct,
  type Category,
  type ProductInput,
  nextReceiptNo,
  salesOn,
  startOfDay,
  type Movement,
  type Product,
  type Sale,
} from "./engine";

const B = "t";
const base0 = {
  businessId: B,
  unit: "piece",
  archived: false,
  createdAt: 0,
  updatedAt: 0,
};
const milk: Product = {
  ...base0,
  id: "1",
  name: "Milk",
  sku: "M",
  cost: 50,
  price: 70,
  min: 5,
};
const coke: Product = {
  ...base0,
  id: "2",
  name: "Coke",
  sku: "C",
  cost: 45,
  price: 60,
  min: 5,
};
const mv = (
  productId: string,
  type: Movement["type"],
  qty: number,
  ts = 1,
): Movement => ({ businessId: B, productId, type, qty, ts, staff: "x" });
const now = Date.now();

describe("stock is the sum of movements", () => {
  it("100 +50 -20 -5 -3 = 122", () => {
    const M = [
      mv("1", "purchase", 100),
      mv("1", "purchase", 50),
      mv("1", "sale", -20),
      mv("1", "damage", -5),
      mv("1", "adjustment", -3),
    ];
    expect(inventory([milk], M)[0].stock).toBe(122);
  });
});

describe("sales", () => {
  const M = [mv("1", "purchase", 10), mv("2", "purchase", 10)];
  const base = {
    businessId: B,
    id: "s1",
    receiptNo: "SL-1001",
    P: [milk, coke],
    M,
    staff: "James",
    payment: "cash" as const,
    now,
  };

  it("rejects selling more than is available", () => {
    const r = buildSale({ ...base, lines: [{ productId: "1", qty: 12 }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toContain("only 10 available");
  });
  it("rejects zero, negative and fractional quantities", () => {
    for (const qty of [0, -1, 1.5])
      expect(buildSale({ ...base, lines: [{ productId: "1", qty }] }).ok).toBe(
        false,
      );
  });
  it("rejects an empty cart and duplicate lines", () => {
    expect(buildSale({ ...base, lines: [] }).ok).toBe(false);
    expect(
      buildSale({
        ...base,
        lines: [
          { productId: "1", qty: 1 },
          { productId: "1", qty: 1 },
        ],
      }).ok,
    ).toBe(false);
  });
  it("builds a multi-item sale with matching movements and total", () => {
    const r = buildSale({
      ...base,
      lines: [
        { productId: "1", qty: 2 },
        { productId: "2", qty: 3 },
      ],
    });
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
    const r = buildSale({
      businessId: B,
      id: "s1",
      receiptNo: "SL-1001",
      lines: [{ productId: "1", qty: 4 }],
      P: [milk],
      M,
      staff: "J",
      payment: "mpesa",
      now,
    });
    if (!r.ok) throw new Error("setup");
    const c = buildCancel({
      businessId: B,
      sale: r.sale,
      items: r.items,
      staff: "J",
      now,
    });
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    const all = [...M, ...r.movements, ...c.movements];
    expect(inventory([milk], all)[0].stock).toBe(10);
    const cancelled: Sale = { ...r.sale, status: "cancelled" };
    expect(salesOn([cancelled], r.items, startOfDay(now))).toBe(0);
    expect(
      buildCancel({
        businessId: B,
        sale: cancelled,
        items: r.items,
        staff: "J",
        now,
      }).ok,
    ).toBe(false);
  });
});

describe("stock count", () => {
  const M = [mv("1", "purchase", 29)];
  const a = { businessId: B, id: "c1", product: milk, M, staff: "Mary", now };
  it("records the difference as a movement", () => {
    const r = buildCount({ ...a, counted: 23, reason: "Missing" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.count.diff).toBe(-6);
      expect(r.movements[0].qty).toBe(-6);
    }
  });
  it("needs a reason when the numbers differ, not when they match", () => {
    expect(buildCount({ ...a, counted: 23, reason: "" }).ok).toBe(false);
    const ok = buildCount({ ...a, counted: 29, reason: "" });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.movements).toHaveLength(0);
  });
  it("rejects invalid counts", () => {
    for (const counted of [-1, 2.5, NaN])
      expect(buildCount({ ...a, counted, reason: "Other" }).ok).toBe(false);
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
  const input: ProductInput = {
    name: "Tea",
    sku: "TEA1",
    unit: "pack",
    cost: 90,
    price: 120,
    min: 5,
  };
  const mk = (over: Partial<ProductInput> = {}, P: Product[] = [milk]) =>
    validateProduct({ ...input, ...over }, P, []);
  it("accepts a valid product", () => expect(mk().errors).toEqual([]));
  it("requires a name and a SKU", () => {
    expect(mk({ name: "  " }).errors.length).toBe(1);
    expect(mk({ sku: "" }).errors.length).toBe(1);
  });
  it("keeps SKUs unique, ignoring case, but lets a product keep its own SKU", () => {
    expect(mk({ sku: "m" }).errors[0]).toContain("already used");
    expect(
      validateProduct({ ...input, sku: "M" }, [milk], [], milk.id).errors,
    ).toEqual([]);
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
    const r = buildProductCreate({
      businessId: B,
      id: "n1",
      input: { ...input, openingStock: 12 },
      P: [milk],
      C: [],
      staff: "J",
      now,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.movements[0]).toMatchObject({
        type: "opening",
        qty: 12,
        productId: "n1",
      });
      expect("stock" in r.product).toBe(false);
    }
  });
  it("changing a price audits the change and leaves past sales untouched", () => {
    const M = [mv("1", "purchase", 10)];
    const sold = buildSale({
      businessId: B,
      id: "s1",
      receiptNo: "SL-1001",
      lines: [{ productId: "1", qty: 2 }],
      P: [milk],
      M,
      staff: "J",
      payment: "cash",
      now,
    });
    if (!sold.ok) throw new Error("setup");
    const r = buildProductUpdate({
      businessId: B,
      product: milk,
      input: { ...input, name: "Milk", sku: "M", price: 99 },
      P: [milk],
      C: [],
      staff: "J",
      now,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.product.price).toBe(99);
    expect(
      r.audit.find((a) => a.action === "product.price_changed"),
    ).toMatchObject({ oldValue: "70", newValue: "99" });
    expect(salesOn([sold.sale], sold.items, startOfDay(now))).toBe(140);
  });
  it("blocks deleting a product with history, allows it without, and archiving stops sales", () => {
    const M = [mv("1", "purchase", 5)];
    expect(
      buildProductDelete({
        businessId: B,
        product: milk,
        M,
        SI: [],
        C: [],
        staff: "J",
        now,
      }).ok,
    ).toBe(false);
    expect(
      buildProductDelete({
        businessId: B,
        product: milk,
        M: [],
        SI: [],
        C: [],
        staff: "J",
        now,
      }).ok,
    ).toBe(true);
    const a = buildArchive({
      businessId: B,
      product: milk,
      archived: true,
      staff: "J",
      now,
    });
    if (!a.ok) throw new Error("setup");
    const r = buildSale({
      businessId: B,
      id: "s2",
      receiptNo: "SL-1002",
      lines: [{ productId: "1", qty: 1 }],
      P: [a.product],
      M,
      staff: "J",
      payment: "cash",
      now,
    });
    expect(r.ok).toBe(false);
  });
});

describe("categories", () => {
  const cat: Category = { id: "c1", businessId: B, name: "Dairy" };
  it("rejects blank and duplicate names, including on rename", () => {
    expect(
      buildCategoryCreate({
        businessId: B,
        id: "c2",
        name: " ",
        C: [cat],
        staff: "J",
        now,
      }).ok,
    ).toBe(false);
    expect(
      buildCategoryCreate({
        businessId: B,
        id: "c2",
        name: "dairy",
        C: [cat],
        staff: "J",
        now,
      }).ok,
    ).toBe(false);
    const other: Category = { id: "c2", businessId: B, name: "Bakery" };
    expect(
      buildCategoryRename({
        businessId: B,
        category: other,
        name: "DAIRY",
        C: [cat, other],
        staff: "J",
        now,
      }).ok,
    ).toBe(false);
    expect(
      buildCategoryRename({
        businessId: B,
        category: cat,
        name: "Dairy",
        C: [cat, other],
        staff: "J",
        now,
      }).ok,
    ).toBe(true);
  });
  it("won't delete a category that products still use", () => {
    const used = { ...milk, categoryId: "c1" };
    const r = buildCategoryDelete({
      businessId: B,
      category: cat,
      P: [used],
      staff: "J",
      now,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toContain("still uses");
    expect(
      buildCategoryDelete({
        businessId: B,
        category: cat,
        P: [milk],
        staff: "J",
        now,
      }).ok,
    ).toBe(true);
  });
});

describe("suppliers", () => {
  const sup: Supplier = {
    id: "s1",
    businessId: B,
    name: "Sunrise Bakers",
    archived: false,
    createdAt: 0,
    updatedAt: 0,
  };
  it("needs a unique name and valid contact details", () => {
    expect(validateSupplier({ name: " " }, [])).not.toEqual([]);
    expect(validateSupplier({ name: "sunrise bakers" }, [sup]).length).toBe(1);
    expect(validateSupplier({ name: "Sunrise Bakers" }, [sup], "s1")).toEqual(
      [],
    );
    expect(validateSupplier({ name: "A", email: "nope" }, []).length).toBe(1);
    expect(validateSupplier({ name: "A", phone: "abc" }, []).length).toBe(1);
    expect(
      validateSupplier(
        { name: "A", phone: "+254 700 000 000", email: "a@b.co" },
        [],
      ),
    ).toEqual([]);
  });
  it("can be created, edited and archived", () => {
    const c = buildSupplierCreate({
      businessId: B,
      id: "s2",
      input: { name: " Kilimani Dairy " },
      SUP: [sup],
      staff: "J",
      now,
    });
    expect(c.ok && c.supplier.name).toBe("Kilimani Dairy");
    expect(
      buildSupplierUpdate({
        businessId: B,
        supplier: sup,
        input: { name: "Sunrise" },
        SUP: [sup],
        staff: "J",
        now,
      }).ok,
    ).toBe(true);
    expect(
      buildSupplierArchive({
        businessId: B,
        supplier: sup,
        archived: true,
        staff: "J",
        now,
      }).ok,
    ).toBe(true);
    expect(
      buildSupplierArchive({
        businessId: B,
        supplier: sup,
        archived: false,
        staff: "J",
        now,
      }).ok,
    ).toBe(false);
  });
});

describe("purchases", () => {
  const sup: Supplier = {
    id: "s1",
    businessId: B,
    name: "Sunrise Bakers",
    archived: false,
    createdAt: 0,
    updatedAt: 0,
  };
  const P = [milk, coke];
  const input = {
    supplierId: "s1",
    lines: [
      { productId: "1", qty: 10, unitCost: 50 },
      { productId: "2", qty: 6, unitCost: 44 },
    ],
  };
  const make = (status: "draft" | "ordered" = "ordered") => {
    const r = buildPurchaseCreate({
      businessId: B,
      id: "po1",
      ref: "PO-1001",
      input,
      status,
      SUP: [sup],
      P,
      staff: "J",
      now,
    });
    if (!r.ok) throw new Error(r.errors.join());
    return r;
  };
  const state = (RC: Receipt[] = [], RI: ReceiptItem[] = []) => ({
    PI: make().purchaseItems,
    RC,
    RI,
  });
  const recv = (
    id: string,
    lines: { productId: string; qty: number }[],
    RC: Receipt[] = [],
    RI: ReceiptItem[] = [],
    purchase: Purchase = make().purchase,
  ) =>
    buildReceive({
      businessId: B,
      id,
      purchase,
      PI: make().purchaseItems,
      RC,
      RI,
      lines,
      staff: "M",
      now,
    });

  it("a draft purchase changes no stock and writes no movements", () => {
    const d = make("draft");
    expect(d.movements).toEqual([]);
    expect(inventory(P, [mv("1", "opening", 3)])[0].stock).toBe(3);
    expect(purchaseStatus(d.purchase, d.purchaseItems, [], [])).toBe("draft");
    expect(purchaseTotal(d.purchaseItems)).toBe(10 * 50 + 6 * 44);
  });
  it("validates supplier, lines, quantities and costs", () => {
    const bad = (i: Partial<typeof input>) =>
      buildPurchaseCreate({
        businessId: B,
        id: "x",
        ref: "PO-1",
        input: { ...input, ...i },
        status: "draft",
        SUP: [sup],
        P,
        staff: "J",
        now,
      }).ok;
    expect(bad({ supplierId: "nope" })).toBe(false);
    expect(bad({ lines: [] })).toBe(false);
    expect(bad({ lines: [{ productId: "1", qty: 0, unitCost: 5 }] })).toBe(
      false,
    );
    expect(bad({ lines: [{ productId: "1", qty: 1.5, unitCost: 5 }] })).toBe(
      false,
    );
    expect(bad({ lines: [{ productId: "1", qty: 1, unitCost: -5 }] })).toBe(
      false,
    );
    expect(
      bad({
        lines: [
          { productId: "1", qty: 1, unitCost: 5 },
          { productId: "1", qty: 1, unitCost: 5 },
        ],
      }),
    ).toBe(false);
    const archived = buildPurchaseCreate({
      businessId: B,
      id: "x",
      ref: "PO-1",
      input,
      status: "draft",
      SUP: [{ ...sup, archived: true }],
      P,
      staff: "J",
      now,
    });
    expect(archived.ok).toBe(false);
  });
  it("receiving 10 units adds exactly 10", () => {
    const r = recv("r1", [{ productId: "1", qty: 10 }]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.movements).toHaveLength(1);
    expect(inventory(P, r.movements)[0].stock).toBe(10);
  });
  it("4 of 10 is partial; the other 6 completes it without double counting", () => {
    const first = recv("r1", [{ productId: "1", qty: 4 }]);
    if (!first.ok) throw new Error("setup");
    const RC = [first.receipt!],
      RI = first.receiptItems!;
    const p = make().purchase;
    expect(purchaseStatus(p, make().purchaseItems, RC, RI)).toBe("partial");
    expect(purchaseLines(p, make().purchaseItems, RC, RI)[0]).toMatchObject({
      received: 4,
      outstanding: 6,
    });
    const second = recv(
      "r2",
      [
        { productId: "1", qty: 6 },
        { productId: "2", qty: 6 },
      ],
      RC,
      RI,
    );
    if (!second.ok) throw new Error(second.errors.join());
    const RC2 = [...RC, second.receipt!],
      RI2 = [...RI, ...second.receiptItems!];
    expect(purchaseStatus(p, make().purchaseItems, RC2, RI2)).toBe("received");
    const stock = inventory(P, [...first.movements, ...second.movements]);
    expect(stock[0].stock).toBe(10); // not 20
    expect(stock[1].stock).toBe(6);
    expect(recv("r3", [{ productId: "1", qty: 1 }], RC2, RI2).ok).toBe(false); // nothing left to receive
  });
  it("refuses to receive more than is outstanding, and bad quantities", () => {
    expect(recv("r1", [{ productId: "1", qty: 11 }]).ok).toBe(false);
    expect(recv("r1", [{ productId: "1", qty: -1 }]).ok).toBe(false);
    expect(recv("r1", [{ productId: "1", qty: 1.5 }]).ok).toBe(false);
    expect(recv("r1", [{ productId: "9", qty: 1 }]).ok).toBe(false);
    expect(recv("r1", [{ productId: "1", qty: 0 }]).ok).toBe(false); // must receive something
  });
  it("receiving a draft marks it ordered; a cancelled purchase can't be received", () => {
    const d = make("draft").purchase;
    const r = recv("r1", [{ productId: "1", qty: 1 }], [], [], d);
    expect(r.ok && r.purchase?.status).toBe("ordered");
    expect(
      recv("r1", [{ productId: "1", qty: 1 }], [], [], {
        ...d,
        status: "cancelled",
      }).ok,
    ).toBe(false);
  });
  it("cancelling is blocked once any stock was received", () => {
    const p = make().purchase;
    expect(
      buildPurchaseCancel({
        businessId: B,
        purchase: p,
        RC: [],
        staff: "J",
        now,
      }).ok,
    ).toBe(true);
    const r = recv("r1", [{ productId: "1", qty: 1 }]);
    if (!r.ok) throw new Error("setup");
    const blocked = buildPurchaseCancel({
      businessId: B,
      purchase: p,
      RC: [r.receipt!],
      staff: "J",
      now,
    });
    expect(blocked.ok).toBe(false);
  });
  it("only a draft can be edited or ordered", () => {
    const d = make("draft").purchase,
      o = make("ordered").purchase;
    expect(
      buildPurchaseOrder({ businessId: B, purchase: d, staff: "J", now }).ok,
    ).toBe(true);
    expect(
      buildPurchaseOrder({ businessId: B, purchase: o, staff: "J", now }).ok,
    ).toBe(false);
    const upd = (p: Purchase) =>
      buildPurchaseUpdate({
        businessId: B,
        purchase: p,
        input,
        status: "draft",
        SUP: [sup],
        P,
        RC: [],
        staff: "J",
        now,
      }).ok;
    expect(upd(d)).toBe(true);
    expect(upd(o)).toBe(false);
  });
  it("purchase costs are frozen, so changing a product's cost doesn't touch them", () => {
    const items = make().purchaseItems;
    const upd = buildProductUpdate({
      businessId: B,
      product: milk,
      input: {
        name: "Milk",
        sku: "M",
        unit: "piece",
        cost: 99,
        price: 120,
        min: 5,
      },
      P,
      C: [],
      staff: "J",
      now,
    });
    expect(upd.ok && upd.product.cost).toBe(99);
    expect(items[0].unitCost).toBe(50);
  });
  it("blocks deleting a supplier with purchases, keeps archived suppliers readable, and totals them", () => {
    const pu = make();
    expect(
      buildSupplierDelete({
        businessId: B,
        supplier: sup,
        PU: [pu.purchase],
        staff: "J",
        now,
      }).ok,
    ).toBe(false);
    expect(
      buildSupplierDelete({
        businessId: B,
        supplier: sup,
        PU: [],
        staff: "J",
        now,
      }).ok,
    ).toBe(true);
    const r = recv("r1", [{ productId: "1", qty: 4 }]);
    if (!r.ok) throw new Error("setup");
    const stats = supplierStats(
      "s1",
      [pu.purchase],
      pu.purchaseItems as PurchaseItem[],
      [r.receipt!],
      r.receiptItems!,
    );
    expect(stats).toEqual({
      count: 1,
      ordered: 10 * 50 + 6 * 44,
      received: 4 * 50,
    });
  });
  it("numbers purchases from the highest reference", () => {
    const p = (ref: string) => ({ ref }) as Purchase;
    expect(nextPurchaseRef([])).toBe("PO-1001");
    expect(nextPurchaseRef([p("PO-1004"), p("PO-1002")])).toBe("PO-1005");
  });
});

describe("slow-moving stock", () => {
  const t = Date.now();
  const mkp = (id: string, createdDaysAgo: number): Product => ({
    ...base0,
    id,
    name: id,
    sku: id,
    cost: 10,
    price: 15,
    min: 1,
    createdAt: t - createdDaysAgo * D1,
    updatedAt: 0,
  });
  const ev = (
    productId: string,
    type: Movement["type"],
    qty: number,
    daysAgo: number,
  ): Movement => ({
    businessId: B,
    productId,
    type,
    qty,
    ts: t - daysAgo * D1,
    staff: "x",
  });
  const slowIds = (P: Product[], M: Movement[]) =>
    inventory(P, M, new Set(), t)
      .filter((i) => i.slow)
      .map((i) => i.id);

  it("flags stock that has not sold for more than the limit", () => {
    expect(SLOW_DAYS).toBe(30);
    const P = [mkp("old", 90), mkp("fresh", 90), mkp("edge", 90)];
    const M = [
      ev("old", "purchase", 5, 80),
      ev("old", "sale", -1, 45),
      ev("fresh", "purchase", 5, 80),
      ev("fresh", "sale", -1, 2),
      ev("edge", "purchase", 5, 80),
      ev("edge", "sale", -1, 30),
    ];
    expect(slowIds(P, M)).toEqual(["old"]);
  });
  it("does not flag a product that was only just added", () => {
    expect(slowIds([mkp("new", 3)], [ev("new", "opening", 10, 3)])).toEqual([]);
  });
  it("flags an old product that never sold, but not one with no stock", () => {
    expect(
      slowIds([mkp("never", 60)], [ev("never", "opening", 10, 60)]),
    ).toEqual(["never"]);
    expect(
      slowIds(
        [mkp("empty", 60)],
        [ev("empty", "opening", 10, 60), ev("empty", "sale", -10, 50)],
      ),
    ).toEqual([]);
  });
  it("ignores a cancelled sale when working out the last sale", () => {
    const P = [mkp("c", 90)];
    const M = [
      { ...ev("c", "purchase", 5, 80) },
      { ...ev("c", "sale", -1, 3), refId: "gone" },
      { ...ev("c", "return", 1, 3), refId: "gone" },
    ];
    expect(inventory(P, M, new Set(["gone"]), t)[0].slow).toBe(true);
  });
});
