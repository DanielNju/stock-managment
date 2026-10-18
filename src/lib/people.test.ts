import { describe, expect, it } from "vitest";
import { buildSale, type Customer, type Movement, type Product, type Sale, type SaleItem, type StaffMember } from "./engine";
import { buildBusinessUpdate, buildCustomerArchive, buildCustomerCreate, buildCustomerDelete, buildCustomerUpdate, buildSetDeviceStaff, buildStaffArchive, buildStaffCreate, buildStaffDelete, customerStats, deriveStaff, normPhone, staffInUse, validateCustomer, validateStaffName } from "./people";

const B = "t", now = Date.now();
const cus = (id: string, name: string, extra: Partial<Customer> = {}): Customer => ({ id, businessId: B, name, archived: false, createdAt: 0, updatedAt: 0, ...extra });
const person = (id: string, name: string, archived = false): StaffMember => ({ id, businessId: B, name, archived, createdAt: 0 });

describe("customers", () => {
  it("needs a name, and checks phone and email", () => {
    expect(validateCustomer({ name: " " }, []).errors).toHaveLength(1);
    expect(validateCustomer({ name: "A", phone: "abc" }, []).errors).toHaveLength(1);
    expect(validateCustomer({ name: "A", email: "nope" }, []).errors).toHaveLength(1);
    expect(validateCustomer({ name: "A", phone: "+254 712 345 678", email: "a@b.co" }, []).errors).toEqual([]);
  });
  it("treats the same Kenyan number written three ways as one number", () => {
    expect(normPhone("0712 345 678")).toBe("0712345678");
    expect(normPhone("+254 712 345 678")).toBe("0712345678");
    expect(normPhone("254712345678")).toBe("0712345678");
    const existing = [cus("c1", "Mary", { phone: "0712 345 678" })];
    for (const p of ["+254712345678", "254712345678", "0712345678"]) expect(validateCustomer({ name: "Someone", phone: p }, existing).errors[0]).toContain("already has that phone");
    expect(validateCustomer({ name: "Mary", phone: "0712 345 678" }, existing, "c1").errors).toEqual([]); // her own number is fine
  });
  it("allows two people with the same name but warns", () => {
    const v = validateCustomer({ name: "john kamau" }, [cus("c1", "John Kamau")]);
    expect(v.errors).toEqual([]); expect(v.warnings).toHaveLength(1);
  });
  it("can be created, edited, archived and restored", () => {
    const c = buildCustomerCreate({ businessId: B, id: "c1", input: { name: "  Wanjiru  ", phone: " 0700 000 000 " }, CUS: [], staff: "J", now });
    expect(c.ok && c.customer).toMatchObject({ name: "Wanjiru", phone: "0700 000 000", archived: false });
    const customer = cus("c1", "Wanjiru");
    expect(buildCustomerUpdate({ businessId: B, customer, input: { name: "Wanjiru K" }, CUS: [customer], staff: "J", now }).ok).toBe(true);
    const a = buildCustomerArchive({ businessId: B, customer, archived: true, staff: "J", now });
    expect(a.ok && a.customer.archived).toBe(true);
    expect(buildCustomerArchive({ businessId: B, customer, archived: false, staff: "J", now }).ok).toBe(false);
  });
  it("can't be deleted once they have purchases", () => {
    const customer = cus("c1", "Wanjiru"), sale = { customerId: "c1" } as Sale;
    expect(buildCustomerDelete({ businessId: B, customer, S: [sale], staff: "J", now }).ok).toBe(false);
    expect(buildCustomerDelete({ businessId: B, customer, S: [], staff: "J", now }).ok).toBe(true);
  });
  it("counts only completed sales in what they have spent", () => {
    const sale = (id: string, total: number, ts: number, status: Sale["status"], customerId = "c1") => ({ id, total, ts, status, customerId }) as Sale;
    const S = [sale("a", 300, 1000, "completed"), sale("b", 100, 3000, "completed"), sale("c", 999, 5000, "cancelled"), sale("d", 50, 2000, "completed", "other")];
    const SI: SaleItem[] = [{ saleId: "a", productId: "p", qty: 3, unitPrice: 100, unitCost: 1 }, { saleId: "b", productId: "p", qty: 1, unitPrice: 100, unitCost: 1 }, { saleId: "c", productId: "p", qty: 9, unitPrice: 111, unitCost: 1 }];
    expect(customerStats("c1", S, SI)).toEqual({ count: 2, spent: 400, units: 4, avg: 200, last: 3000 });
    expect(customerStats("nobody", S, SI)).toEqual({ count: 0, spent: 0, units: 0, avg: 0, last: null });
  });
});

describe("selling to a customer", () => {
  const P: Product[] = [{ id: "p", businessId: B, name: "Milk", sku: "M", unit: "pack", cost: 50, price: 70, min: 1, archived: false, createdAt: 0, updatedAt: 0 }];
  const M: Movement[] = [{ businessId: B, productId: "p", type: "opening", qty: 10, ts: 1, staff: "J" }];
  const base = { businessId: B, id: "s1", receiptNo: "SL-1001", lines: [{ productId: "p", qty: 2 }], P, M, staff: "J", payment: "cash" as const, now };
  it("records the customer on the sale, and a sale without one still works", () => {
    const r = buildSale({ ...base, customerId: "c1", CUS: [cus("c1", "Wanjiru")] });
    expect(r.ok && r.sale.customerId).toBe("c1");
    const walkIn = buildSale(base);
    expect(walkIn.ok && "customerId" in walkIn.sale).toBe(false);
  });
  it("refuses an unknown or archived customer and keeps stock untouched", () => {
    expect(buildSale({ ...base, customerId: "ghost", CUS: [] }).ok).toBe(false);
    const r = buildSale({ ...base, customerId: "c1", CUS: [cus("c1", "Old", { archived: true })] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toContain("archived");
  });
});

describe("staff", () => {
  const team = [person("a", "James"), person("b", "Mary")];
  it("needs a name that isn't already on the list", () => {
    expect(validateStaffName(" ", team)).toHaveLength(1);
    expect(validateStaffName("mary", team)[0]).toContain("already");
    expect(validateStaffName("Brian", team)).toEqual([]);
    expect(buildStaffCreate({ businessId: B, id: "c", name: " Brian ", STAFF: team, staff: "J", now }).ok).toBe(true);
  });
  it("can't archive the device's user or the last active person", () => {
    const base = { businessId: B, STAFF: team, staff: "J", now };
    expect(buildStaffArchive({ ...base, staffMember: team[0], archived: true, deviceStaffId: "a" }).ok).toBe(false);
    expect(buildStaffArchive({ ...base, staffMember: team[1], archived: true, deviceStaffId: "a" }).ok).toBe(true);
    expect(buildStaffArchive({ ...base, STAFF: [team[0]], staffMember: team[0], archived: true, deviceStaffId: "zzz" }).ok).toBe(false);
  });
  it("can't be deleted with activity, or while the device is set to them", () => {
    const del = (inUse: boolean, dev: string | null) => buildStaffDelete({ businessId: B, staffMember: team[1], inUse, deviceStaffId: dev, staff: "J", now }).ok;
    expect(del(true, "a")).toBe(false); expect(del(false, "b")).toBe(false); expect(del(false, "a")).toBe(true);
    expect(staffInUse("Mary", { M: [{ staff: "Mary" } as Movement], S: [], C: [] })).toBe(true);
    expect(staffInUse("Zed", { M: [], S: [], C: [], receiptStaff: ["Mary"] })).toBe(false);
  });
  it("sets the device user, but not to an archived person", () => {
    const ok = buildSetDeviceStaff({ businessId: B, staffMember: team[1], staff: "J", now });
    expect(ok.ok && ok.setting).toEqual({ key: "deviceStaffId", value: "b" });
    expect(buildSetDeviceStaff({ businessId: B, staffMember: person("x", "Gone", true), staff: "J", now }).ok).toBe(false);
  });
  it("derives one person per name already on old records", () => {
    const d = deriveStaff(["Mary", "James", "Mary", " ", "Brian"], B, now);
    expect(d.map((x) => [x.id, x.name])).toEqual([["staff-brian", "Brian"], ["staff-james", "James"], ["staff-mary", "Mary"]]);
  });
});

describe("business profile", () => {
  it("needs a name and a sensible phone", () => {
    expect(buildBusinessUpdate({ businessId: B, input: { name: " " }, staff: "J", now }).ok).toBe(false);
    expect(buildBusinessUpdate({ businessId: B, input: { name: "Duka", phone: "xx" }, staff: "J", now }).ok).toBe(false);
    const r = buildBusinessUpdate({ businessId: B, input: { name: "  Duka la Mama ", phone: " 0700 000 000", location: "" }, staff: "J", now });
    expect(r.ok && r.setting).toEqual({ key: "business", value: { name: "Duka la Mama", phone: "0700 000 000", location: undefined } });
  });
});
