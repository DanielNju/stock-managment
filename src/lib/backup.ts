// Backup file format and validation. Pure: no storage. A restore REPLACES everything on the device,
// so a bad file must be refused before anything is touched.
import type { BusinessProfile } from "./engine";

export const BACKUP_APP = "stock-app";
export const BACKUP_FORMAT = 1;
export const BACKUP_TABLES = [
  "products",
  "categories",
  "movements",
  "sales",
  "saleItems",
  "counts",
  "audit",
  "suppliers",
  "purchases",
  "purchaseItems",
  "receipts",
  "receiptItems",
  "customers",
  "staff",
] as const;
export type BackupTable = (typeof BACKUP_TABLES)[number];
/** Tables a backup must contain (the rest may be missing in files from older versions and are treated as empty). */
const REQUIRED: BackupTable[] = [
  "products",
  "movements",
  "sales",
  "saleItems",
  "staff",
];
export const MAX_ROWS = 300_000;

export interface BackupFile {
  app: string;
  format: number;
  exportedAt: number;
  appVersion: string;
  demo: boolean;
  business: BusinessProfile;
  deviceStaffId: string | null;
  data: Record<BackupTable, Record<string, unknown>[]>;
}
export interface BackupSummary {
  exportedAt: number;
  demo: boolean;
  business: string;
  products: number;
  sales: number;
  customers: number;
  suppliers: number;
  staff: number;
  movements: number;
}
export type BackupCheck =
  | { ok: true; backup: BackupFile; summary: BackupSummary }
  | { ok: false; errors: string[] };

const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);
const str = (v: unknown) => typeof v === "string" && v.length > 0;
const num = (v: unknown) => typeof v === "number" && Number.isFinite(v);
const MOVES = [
  "sale",
  "purchase",
  "adjustment",
  "damage",
  "count",
  "return",
  "opening",
];

// [table, what each row must look like]
const ROWS: Record<BackupTable, (r: Record<string, unknown>) => boolean> = {
  products: (r) =>
    str(r.id) &&
    str(r.name) &&
    num(r.cost) &&
    num(r.price) &&
    (r.cost as number) >= 0 &&
    (r.price as number) >= 0 &&
    num(r.min) &&
    typeof r.archived === "boolean",
  categories: (r) => str(r.id) && str(r.name),
  movements: (r) =>
    str(r.productId) &&
    MOVES.includes(r.type as string) &&
    num(r.qty) &&
    num(r.ts) &&
    str(r.staff),
  sales: (r) =>
    str(r.id) &&
    str(r.receiptNo) &&
    num(r.total) &&
    num(r.ts) &&
    (r.status === "completed" || r.status === "cancelled"),
  saleItems: (r) =>
    str(r.saleId) &&
    str(r.productId) &&
    num(r.qty) &&
    (r.qty as number) > 0 &&
    num(r.unitPrice) &&
    num(r.unitCost),
  counts: (r) =>
    str(r.id) &&
    str(r.productId) &&
    num(r.expected) &&
    num(r.counted) &&
    num(r.diff),
  audit: (r) => str(r.action) && num(r.ts),
  suppliers: (r) => str(r.id) && str(r.name),
  purchases: (r) =>
    str(r.id) &&
    str(r.ref) &&
    str(r.supplierId) &&
    ["draft", "ordered", "cancelled"].includes(r.status as string),
  purchaseItems: (r) =>
    str(r.purchaseId) && str(r.productId) && num(r.qty) && num(r.unitCost),
  receipts: (r) => str(r.id) && str(r.purchaseId),
  receiptItems: (r) => str(r.receiptId) && str(r.productId) && num(r.qty),
  customers: (r) => str(r.id) && str(r.name),
  staff: (r) => str(r.id) && str(r.name) && typeof r.archived === "boolean",
};

/** Every link between records must point at something that exists. */
const LINKS: [BackupTable, string, BackupTable][] = [
  ["movements", "productId", "products"],
  ["saleItems", "saleId", "sales"],
  ["saleItems", "productId", "products"],
  ["counts", "productId", "products"],
  ["purchaseItems", "purchaseId", "purchases"],
  ["purchaseItems", "productId", "products"],
  ["receipts", "purchaseId", "purchases"],
  ["receiptItems", "receiptId", "receipts"],
  ["receiptItems", "productId", "products"],
  ["purchases", "supplierId", "suppliers"],
];

export function validateBackup(raw: unknown): BackupCheck {
  const errors: string[] = [];
  if (!isObj(raw)) return { ok: false, errors: ["This isn't a backup file."] };
  if (raw.app !== BACKUP_APP)
    return { ok: false, errors: ["This isn't a backup made by this app."] };
  if (typeof raw.format !== "number")
    return { ok: false, errors: ["This backup file is damaged (no version)."] };
  if (raw.format > BACKUP_FORMAT)
    return {
      ok: false,
      errors: [
        "This backup was made by a newer version of the app. Update the app, then try again.",
      ],
    };
  if (raw.format < 1)
    return {
      ok: false,
      errors: ["This backup file is damaged (bad version)."],
    };
  if (!isObj(raw.data))
    return { ok: false, errors: ["This backup file is damaged (no data)."] };
  const data = {} as BackupFile["data"];
  let total = 0;
  for (const t of BACKUP_TABLES) {
    const rows = (raw.data as Record<string, unknown>)[t];
    if (rows === undefined && !REQUIRED.includes(t)) {
      data[t] = [];
      continue;
    }
    if (!Array.isArray(rows)) {
      errors.push(`The "${t}" part of the backup is missing or damaged.`);
      continue;
    }
    total += rows.length;
    const bad = rows.findIndex((r) => !isObj(r) || !ROWS[t](r));
    if (bad >= 0) errors.push(`${t}: record ${bad + 1} is damaged.`);
    data[t] = rows as Record<string, unknown>[];
  }
  if (total > MAX_ROWS)
    errors.push("This backup is larger than the app can restore.");
  if (errors.length) return { ok: false, errors: errors.slice(0, 6) };

  const ids = (t: BackupTable) => new Set(data[t].map((r) => r.id as string));
  const known = Object.fromEntries(
    BACKUP_TABLES.map((t) => [t, ids(t)]),
  ) as Record<BackupTable, Set<string>>;
  for (const [t, field, target] of LINKS) {
    const n = data[t].filter(
      (r) => !known[target].has(r[field] as string),
    ).length;
    if (n)
      errors.push(
        `${n} ${t} ${n === 1 ? "record points" : "records point"} at a ${target.replace(/s$/, "")} that isn't in the backup.`,
      );
  }
  const lost = data.sales.filter(
    (s) => s.customerId && !known.customers.has(s.customerId as string),
  ).length;
  if (lost)
    errors.push(
      `${lost} ${lost === 1 ? "sale points" : "sales point"} at a customer that isn't in the backup.`,
    );
  if (!data.staff.some((s) => s.archived === false))
    errors.push("The backup has no active staff member.");
  if (errors.length) return { ok: false, errors: errors.slice(0, 6) };

  const business =
    isObj(raw.business) && str(raw.business.name)
      ? {
          name: raw.business.name as string,
          phone: str(raw.business.phone)
            ? (raw.business.phone as string)
            : undefined,
          location: str(raw.business.location)
            ? (raw.business.location as string)
            : undefined,
        }
      : { name: "My shop" };
  const staffIds = known.staff;
  const deviceStaffId =
    typeof raw.deviceStaffId === "string" && staffIds.has(raw.deviceStaffId)
      ? raw.deviceStaffId
      : null;
  const backup: BackupFile = {
    app: BACKUP_APP,
    format: raw.format,
    exportedAt: num(raw.exportedAt) ? (raw.exportedAt as number) : 0,
    appVersion: typeof raw.appVersion === "string" ? raw.appVersion : "unknown",
    demo: raw.demo === true,
    business,
    deviceStaffId,
    data,
  };
  return {
    ok: true,
    backup,
    summary: {
      exportedAt: backup.exportedAt,
      demo: backup.demo,
      business: business.name,
      products: data.products.length,
      sales: data.sales.length,
      customers: data.customers.length,
      suppliers: data.suppliers.length,
      staff: data.staff.length,
      movements: data.movements.length,
    },
  };
}

export const backupFileName = (name: string, now = Date.now()) =>
  `${
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "shop"
  }-backup-${new Date(now).toISOString().slice(0, 10)}.json`;
