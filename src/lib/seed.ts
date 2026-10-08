import { DAY, HR, startOfDay, type Movement, type Product } from "./engine";

const RAW: [number, string, string, number, number, number, number, number][] = [
  [1, "Coca-Cola 500ml", "COKE500", 45, 60, 15, 6, 8], [2, "Milk 500ml", "MILK500", 52, 70, 12, 5, 5],
  [3, "Sugar 1kg", "SUGAR1", 150, 180, 10, 2, 29], [4, "Bread 400g", "BREAD400", 50, 65, 10, 6, 22],
  [5, "Cooking Oil 1L", "OIL1L", 260, 310, 8, 2, 14], [6, "Rice 2kg", "RICE2", 290, 340, 8, 1.5, 18],
  [7, "Maize Flour 2kg", "FLOUR2", 120, 145, 12, 3, 40], [8, "Soap Bar", "SOAP", 60, 80, 10, 0, 30],
  [9, "Biscuits Pack", "BISC", 35, 50, 15, 0, 26], [10, "Tea Leaves 250g", "TEA250", 95, 120, 8, 1.5, 9],
];
const STAFF = ["James", "Mary", "Brian"];

export function seed(now = Date.now()): { products: Product[]; movements: Movement[] } {
  let s = 7;
  const rnd = () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const t0 = startOfDay(now), M: Movement[] = [];
  const add = (productId: number, type: Movement["type"], qty: number, ts: number, staff = STAFF[Math.floor(rnd() * 3)]) =>
    M.push({ productId, type, qty, ts, staff });
  for (const [id, , , , , , rate] of RAW) {
    if (rate <= 0) continue;
    for (let d = 13; d >= 1; d--) { const q = Math.round(rate * (0.6 + rnd() * 0.8)); if (q > 0) add(id, "sale", -q, t0 - d * DAY + (8 + rnd() * 10) * HR); }
    add(id, "sale", -Math.max(1, Math.round(rate * (0.5 + rnd()))), Math.max(t0 + 6e4, now - rnd() * 6 * HR));
  }
  add(8, "sale", -2, t0 - 45 * DAY); add(9, "sale", -3, t0 - 44 * DAY);
  add(2, "purchase", 50, Math.max(t0 + 6e4, now - 3 * HR), "Mary");
  add(3, "adjustment", -2, t0 - DAY + 10 * HR, "James");
  add(3, "count", -6, t0 - 2 * DAY + 17 * HR, "Mary"); add(6, "count", -3, t0 - 2 * DAY + 17.5 * HR, "Brian");
  for (const [id, , , , , , , target] of RAW) {
    const have = M.filter((m) => m.productId === id).reduce((a, m) => a + m.qty, 0);
    add(id, "purchase", Math.max(1, target - have), t0 - 50 * DAY, "Mary");
  }
  return { products: RAW.map(([id, name, sku, cost, price, min]) => ({ id, name, sku, cost, price, min })), movements: M };
}
