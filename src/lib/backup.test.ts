import { describe, expect, it } from "vitest";
import {
  BACKUP_APP,
  BACKUP_FORMAT,
  BACKUP_TABLES,
  backupFileName,
  validateBackup,
  type BackupFile,
} from "./backup";
import { seed } from "./seed";

const make = (): BackupFile => {
  const s = seed();
  const data = {
    products: s.products,
    categories: s.categories,
    movements: s.movements,
    sales: s.sales,
    saleItems: s.saleItems,
    counts: s.counts,
    audit: s.audit,
    suppliers: s.suppliers,
    purchases: s.purchases,
    purchaseItems: s.purchaseItems,
    receipts: s.receipts,
    receiptItems: s.receiptItems,
    customers: s.customers,
    staff: s.staff,
  };
  return JSON.parse(
    JSON.stringify({
      app: BACKUP_APP,
      format: BACKUP_FORMAT,
      exportedAt: 1_700_000_000_000,
      appVersion: "t",
      demo: true,
      business: s.business,
      deviceStaffId: s.deviceStaffId,
      data,
    }),
  );
};
const bad = (raw: unknown) => {
  const r = validateBackup(raw);
  expect(r.ok).toBe(false);
  return r.ok ? [] : r.errors;
};

describe("backup validation", () => {
  it("accepts a good backup and summarises it", () => {
    const r = validateBackup(make());
    expect(r.ok).toBe(true);
    if (r.ok)
      expect(r.summary).toMatchObject({
        products: 10,
        customers: 5,
        suppliers: 3,
        staff: 3,
        demo: true,
        business: "Demo Shop",
      });
    if (r.ok) expect(r.summary.sales).toBeGreaterThan(50);
  });
  it("survives being written to a file and read back", () => {
    expect(validateBackup(JSON.parse(JSON.stringify(make()))).ok).toBe(true);
  });
  it("refuses things that are not backups", () => {
    for (const x of [
      null,
      5,
      "text",
      [],
      {},
      { app: "other-app", format: 1, data: {} },
    ])
      expect(validateBackup(x).ok).toBe(false);
  });
  it("tells the user when the file is from a newer app, or has no version", () => {
    expect(bad({ ...make(), format: 99 })[0]).toContain("newer version");
    expect(bad({ ...make(), format: "1" })[0]).toContain("damaged");
  });
  it("refuses a file with a missing or damaged required part", () => {
    const m = make();
    delete (m.data as Partial<typeof m.data>).products;
    expect(bad(m).join(" ")).toContain("products");
    const n = make();
    (n.data as Record<string, unknown>).sales = "nope";
    expect(bad(n).join(" ")).toContain("sales");
  });
  it("accepts an older file that is missing the optional parts", () => {
    const m = make();
    for (const t of [
      "customers",
      "suppliers",
      "purchases",
      "purchaseItems",
      "receipts",
      "receiptItems",
      "categories",
      "counts",
      "audit",
    ] as const)
      delete (m.data as Partial<typeof m.data>)[t];
    m.data.sales.forEach((s) => delete s.customerId);
    m.data.movements = m.data.movements.filter(
      (x) =>
        x.type !== "purchase" || !x.refId?.toString().startsWith("seed-rc"),
    );
    expect(validateBackup(m).ok).toBe(true);
  });
  it("refuses damaged records", () => {
    const a = make();
    (a.data.products[3] as Record<string, unknown>).price = -5;
    expect(bad(a)[0]).toContain("products: record 4");
    const b = make();
    (b.data.movements[0] as Record<string, unknown>).qty = "ten";
    expect(bad(b)[0]).toContain("movements");
    const c = make();
    (c.data.movements[1] as Record<string, unknown>).type = "teleport";
    expect(bad(c)[0]).toContain("movements");
    const d = make();
    (d.data.sales[0] as Record<string, unknown>).status = "paid";
    expect(bad(d)[0]).toContain("sales");
  });
  it("refuses records that point at something missing", () => {
    const a = make();
    a.data.movements[0].productId = "ghost";
    expect(bad(a).join(" ")).toContain("movements record");
    const b = make();
    b.data.saleItems.push({
      saleId: "nope",
      productId: "p1",
      qty: 1,
      unitPrice: 1,
      unitCost: 1,
    });
    expect(bad(b).join(" ")).toContain("saleItems");
    const c = make();
    c.data.sales[0].customerId = "ghost";
    expect(bad(c).join(" ")).toContain("customer");
  });
  it("needs at least one active staff member", () => {
    const a = make();
    a.data.staff.forEach((s) => (s.archived = true));
    expect(bad(a).join(" ")).toContain("active staff");
  });
  it("falls back safely for a missing business name or device user", () => {
    const m = make();
    (m as unknown as Record<string, unknown>).business = {};
    m.deviceStaffId = "who";
    const r = validateBackup(m);
    expect(r.ok && r.backup.business.name).toBe("My shop");
    expect(r.ok && r.backup.deviceStaffId).toBeNull();
  });
  it("names the file after the shop and the date", () => {
    expect(backupFileName("Duka la Mama!", Date.UTC(2026, 9, 12))).toBe(
      "duka-la-mama-backup-2026-10-12.json",
    );
    expect(backupFileName("###", Date.UTC(2026, 0, 1))).toBe(
      "shop-backup-2026-01-01.json",
    );
    expect(BACKUP_TABLES).toContain("customers");
  });
});
