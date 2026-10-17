// Customers, staff and business profile. Pure rules: no UI, no storage.
import type {
  AuditEntry,
  BusinessProfile,
  Customer,
  Fail,
  Movement,
  Sale,
  SaleItem,
  StaffMember,
  StockCount,
  Writes,
} from "./engine";

const fail = (...errors: string[]): Fail => ({ ok: false, errors });
const audit = (
  b: string,
  staff: string,
  now: number,
  entity: string,
  action: string,
  id: string,
  oldValue?: string,
  newValue?: string,
): AuditEntry => ({
  businessId: b,
  ts: now,
  staff,
  action,
  entity,
  entityId: id,
  oldValue,
  newValue,
});
/** 0712 345 678, +254 712 345 678 and 254712345678 are the same number. */
export const normPhone = (p: string) => {
  const d = p.replace(/\D/g, "");
  return d.startsWith("254") ? "0" + d.slice(3) : d;
};
const PHONE = /^[0-9+()\-\s]{6,20}$/,
  EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ---------------- customers ---------------- */
export interface CustomerInput {
  name: string;
  phone?: string;
  email?: string;
  location?: string;
  notes?: string;
}
export function validateCustomer(
  i: CustomerInput,
  CUS: Customer[],
  selfId?: string,
) {
  const errors: string[] = [],
    warnings: string[] = [],
    name = i.name.trim(),
    phone = i.phone?.trim(),
    email = i.email?.trim();
  if (!name) errors.push("Customer name is required.");
  else if (name.length > 80)
    errors.push("Customer name is too long (80 characters at most).");
  if (phone) {
    if (!PHONE.test(phone))
      errors.push("Phone numbers can only have digits, spaces, + ( ) and -.");
    else {
      const other = CUS.find(
        (c) =>
          c.id !== selfId && c.phone && normPhone(c.phone) === normPhone(phone),
      );
      if (other) errors.push(`${other.name} already has that phone number.`);
    }
  }
  if (email && !EMAIL.test(email))
    errors.push("That email address doesn't look right.");
  // two different people can share a name, so a repeated name is a warning, not an error
  if (
    name &&
    CUS.some(
      (c) => c.id !== selfId && c.name.toLowerCase() === name.toLowerCase(),
    )
  )
    warnings.push(
      `Another customer is already called "${name}". Add a phone number so you can tell them apart.`,
    );
  return { errors, warnings };
}
const cleanCustomer = (i: CustomerInput) => ({
  name: i.name.trim(),
  phone: i.phone?.trim() || undefined,
  email: i.email?.trim() || undefined,
  location: i.location?.trim() || undefined,
  notes: i.notes?.trim() || undefined,
});

export function buildCustomerCreate(a: {
  businessId: string;
  id: string;
  input: CustomerInput;
  CUS: Customer[];
  staff: string;
  now: number;
}): ({ ok: true } & Writes & { customer: Customer }) | Fail {
  const v = validateCustomer(a.input, a.CUS);
  if (v.errors.length) return { ok: false, errors: v.errors };
  const customer: Customer = {
    id: a.id,
    businessId: a.businessId,
    ...cleanCustomer(a.input),
    archived: false,
    createdAt: a.now,
    updatedAt: a.now,
  };
  return {
    ok: true,
    customer,
    movements: [],
    audit: [
      audit(
        a.businessId,
        a.staff,
        a.now,
        "customer",
        "customer.created",
        a.id,
        undefined,
        customer.name,
      ),
    ],
  };
}
export function buildCustomerUpdate(a: {
  businessId: string;
  customer: Customer;
  input: CustomerInput;
  CUS: Customer[];
  staff: string;
  now: number;
}): ({ ok: true } & Writes & { customer: Customer }) | Fail {
  const v = validateCustomer(a.input, a.CUS, a.customer.id);
  if (v.errors.length) return { ok: false, errors: v.errors };
  const customer: Customer = {
    ...a.customer,
    ...cleanCustomer(a.input),
    updatedAt: a.now,
  };
  return {
    ok: true,
    customer,
    movements: [],
    audit: [
      audit(
        a.businessId,
        a.staff,
        a.now,
        "customer",
        "customer.updated",
        a.customer.id,
        a.customer.name,
        customer.name,
      ),
    ],
  };
}
export function buildCustomerArchive(a: {
  businessId: string;
  customer: Customer;
  archived: boolean;
  staff: string;
  now: number;
}): ({ ok: true } & Writes & { customer: Customer }) | Fail {
  if (a.customer.archived === a.archived)
    return fail(
      a.archived
        ? "This customer is already archived."
        : "This customer is not archived.",
    );
  return {
    ok: true,
    customer: { ...a.customer, archived: a.archived, updatedAt: a.now },
    movements: [],
    audit: [
      audit(
        a.businessId,
        a.staff,
        a.now,
        "customer",
        a.archived ? "customer.archived" : "customer.restored",
        a.customer.id,
        undefined,
        a.customer.name,
      ),
    ],
  };
}
export const customerHasSales = (id: string, S: Sale[]) =>
  S.some((s) => s.customerId === id);
export function buildCustomerDelete(a: {
  businessId: string;
  customer: Customer;
  S: Sale[];
  staff: string;
  now: number;
}): ({ ok: true } & Writes) | Fail {
  if (customerHasSales(a.customer.id, a.S))
    return fail(
      `${a.customer.name} has purchases on record, so they can't be deleted. Archive them instead.`,
    );
  return {
    ok: true,
    deleteCustomerId: a.customer.id,
    movements: [],
    audit: [
      audit(
        a.businessId,
        a.staff,
        a.now,
        "customer",
        "customer.deleted",
        a.customer.id,
        a.customer.name,
      ),
    ],
  };
}
/** Completed sales only: a cancelled sale is not something the customer bought. */
export function customerStats(customerId: string, S: Sale[], SI: SaleItem[]) {
  const mine = S.filter(
    (s) => s.customerId === customerId && s.status === "completed",
  );
  const spent = mine.reduce((a, s) => a + s.total, 0);
  const units = SI.filter((i) => mine.some((s) => s.id === i.saleId)).reduce(
    (a, i) => a + i.qty,
    0,
  );
  return {
    count: mine.length,
    spent,
    units,
    avg: mine.length ? spent / mine.length : 0,
    last: mine.length ? Math.max(...mine.map((s) => s.ts)) : null,
  };
}

/* ---------------- staff ---------------- */
/** Past records keep the staff name they were made under, so a name never changes. To retire someone, archive them. */
export function validateStaffName(
  name: string,
  STAFF: StaffMember[],
): string[] {
  const n = name.trim();
  if (!n) return ["Staff name is required."];
  if (n.length > 40) return ["Staff name is too long (40 characters at most)."];
  if (STAFF.some((s) => s.name.toLowerCase() === n.toLowerCase()))
    return [`${n} is already on the list.`];
  return [];
}
export function buildStaffCreate(a: {
  businessId: string;
  id: string;
  name: string;
  STAFF: StaffMember[];
  staff: string;
  now: number;
}): ({ ok: true } & Writes & { staffMember: StaffMember }) | Fail {
  const errs = validateStaffName(a.name, a.STAFF);
  if (errs.length) return { ok: false, errors: errs };
  const staffMember: StaffMember = {
    id: a.id,
    businessId: a.businessId,
    name: a.name.trim(),
    archived: false,
    createdAt: a.now,
  };
  return {
    ok: true,
    staffMember,
    movements: [],
    audit: [
      audit(
        a.businessId,
        a.staff,
        a.now,
        "staff",
        "staff.added",
        a.id,
        undefined,
        staffMember.name,
      ),
    ],
  };
}
export function buildStaffArchive(a: {
  businessId: string;
  staffMember: StaffMember;
  archived: boolean;
  deviceStaffId: string | null;
  STAFF: StaffMember[];
  staff: string;
  now: number;
}): ({ ok: true } & Writes & { staffMember: StaffMember }) | Fail {
  if (a.staffMember.archived === a.archived)
    return fail(
      a.archived
        ? "This person is already archived."
        : "This person is not archived.",
    );
  if (a.archived && a.deviceStaffId === a.staffMember.id)
    return fail(
      `This device is set to ${a.staffMember.name}. Switch the device to someone else before archiving them.`,
    );
  if (a.archived && a.STAFF.filter((s) => !s.archived).length <= 1)
    return fail("You need at least one active person.");
  return {
    ok: true,
    staffMember: { ...a.staffMember, archived: a.archived },
    movements: [],
    audit: [
      audit(
        a.businessId,
        a.staff,
        a.now,
        "staff",
        a.archived ? "staff.archived" : "staff.restored",
        a.staffMember.id,
        undefined,
        a.staffMember.name,
      ),
    ],
  };
}
export const staffInUse = (
  name: string,
  x: { M: Movement[]; S: Sale[]; C: StockCount[]; receiptStaff?: string[] },
) =>
  x.M.some((m) => m.staff === name) ||
  x.S.some((s) => s.staff === name) ||
  x.C.some((c) => c.staff === name) ||
  (x.receiptStaff ?? []).includes(name);
export function buildStaffDelete(a: {
  businessId: string;
  staffMember: StaffMember;
  inUse: boolean;
  deviceStaffId: string | null;
  staff: string;
  now: number;
}): ({ ok: true } & Writes) | Fail {
  if (a.deviceStaffId === a.staffMember.id)
    return fail(
      `This device is set to ${a.staffMember.name}, so they can't be deleted.`,
    );
  if (a.inUse)
    return fail(
      `${a.staffMember.name} has recorded activity, so they can't be deleted. Archive them instead.`,
    );
  return {
    ok: true,
    deleteStaffId: a.staffMember.id,
    movements: [],
    audit: [
      audit(
        a.businessId,
        a.staff,
        a.now,
        "staff",
        "staff.deleted",
        a.staffMember.id,
        a.staffMember.name,
      ),
    ],
  };
}
/** Which person is using this device. New sales, counts and deliveries are recorded under their name. */
export function buildSetDeviceStaff(a: {
  businessId: string;
  staffMember: StaffMember;
  staff: string;
  now: number;
}): ({ ok: true } & Writes) | Fail {
  if (a.staffMember.archived)
    return fail(`${a.staffMember.name} is archived. Restore them first.`);
  return {
    ok: true,
    setting: { key: "deviceStaffId", value: a.staffMember.id },
    movements: [],
    audit: [
      audit(
        a.businessId,
        a.staff,
        a.now,
        "staff",
        "device.user_changed",
        a.staffMember.id,
        undefined,
        a.staffMember.name,
      ),
    ],
  };
}
/** For data that existed before staff were stored: one person for each name already on the records. */
export function deriveStaff(
  names: string[],
  businessId: string,
  now: number,
): StaffMember[] {
  return [...new Set(names.map((n) => n.trim()).filter(Boolean))]
    .sort((x, y) => x.localeCompare(y))
    .map((name) => ({
      id: `staff-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      businessId,
      name,
      archived: false,
      createdAt: now,
    }));
}

/* ---------------- business profile ---------------- */
export const DEFAULT_BUSINESS: BusinessProfile = { name: "My shop" };
export function buildBusinessUpdate(a: {
  businessId: string;
  input: BusinessProfile;
  staff: string;
  now: number;
}): ({ ok: true } & Writes) | Fail {
  const name = a.input.name.trim(),
    phone = a.input.phone?.trim(),
    location = a.input.location?.trim(),
    errs: string[] = [];
  if (!name) errs.push("Business name is required.");
  else if (name.length > 60)
    errs.push("Business name is too long (60 characters at most).");
  if (phone && !PHONE.test(phone))
    errs.push("Phone numbers can only have digits, spaces, + ( ) and -.");
  if (location && location.length > 80)
    errs.push("Location is too long (80 characters at most).");
  if (errs.length) return { ok: false, errors: errs };
  return {
    ok: true,
    setting: {
      key: "business",
      value: {
        name,
        phone: phone || undefined,
        location: location || undefined,
      },
    },
    movements: [],
    audit: [
      audit(
        a.businessId,
        a.staff,
        a.now,
        "business",
        "business.updated",
        a.businessId,
        undefined,
        name,
      ),
    ],
  };
}

/* ---------------- first-run setup ---------------- */
/** A fresh install starts empty: one business and one person (whoever is setting it up), no demo data. */
export function buildSetup(a: {
  businessId: string;
  id: string;
  shop: string;
  you: string;
  now: number;
}): ({ ok: true } & Writes) | Fail {
  const shop = a.shop.trim(),
    you = a.you.trim(),
    errs: string[] = [];
  if (!shop) errs.push("Enter the name of your shop.");
  else if (shop.length > 60)
    errs.push("The shop name is too long (60 characters at most).");
  if (!you) errs.push("Enter your name.");
  else if (you.length > 40)
    errs.push("Your name is too long (40 characters at most).");
  if (errs.length) return { ok: false, errors: errs };
  const staffMember: StaffMember = {
    id: a.id,
    businessId: a.businessId,
    name: you,
    archived: false,
    createdAt: a.now,
  };
  return {
    ok: true,
    staffMember,
    movements: [],
    settings: [
      { key: "business", value: { name: shop } },
      { key: "deviceStaffId", value: a.id },
      { key: "onboarded", value: true },
      { key: "demo", value: false },
    ],
    audit: [
      audit(
        a.businessId,
        you,
        a.now,
        "business",
        "business.created",
        a.businessId,
        undefined,
        shop,
      ),
    ],
  };
}
