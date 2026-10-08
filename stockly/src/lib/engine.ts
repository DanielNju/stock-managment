// Pure inventory engine. No UI, no storage: this file moves unchanged behind the real API.
export type MoveType = "sale" | "purchase" | "adjustment" | "damage" | "count";
export interface Product { id: number; name: string; sku: string; cost: number; price: number; min: number }
export interface Movement { id?: number; productId: number; type: MoveType; qty: number; ts: number; staff: string }
export type Status = "ok" | "low" | "out";
export interface StockItem extends Product { stock: number; value: number; last: number; status: Status }
export interface ActivityItem extends Movement { name: string }

export const DAY = 864e5;
export const HR = 36e5;
export const startOfDay = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return +d; };

/** Stock is never stored: it is the sum of signed movement quantities. */
export function inventory(P: Product[], M: Movement[]): StockItem[] {
  return P.map((p) => {
    const ms = M.filter((m) => m.productId === p.id);
    const stock = ms.reduce((s, m) => s + m.qty, 0);
    const sold = ms.filter((m) => m.type === "sale").map((m) => m.ts);
    const last = sold.length ? Math.max(...sold) : 0;
    const status: Status = stock <= 0 ? "out" : stock <= p.min ? "low" : "ok";
    return { ...p, stock, value: stock * p.cost, last, status };
  });
}

export function salesOn(P: Product[], M: Movement[], day: number): number {
  const price = new Map(P.map((p) => [p.id, p.price]));
  return M.filter((m) => m.type === "sale" && m.ts >= day && m.ts < day + DAY)
    .reduce((s, m) => s - m.qty * (price.get(m.productId) ?? 0), 0);
}

export function dashboard(P: Product[], M: Movement[], now = Date.now()) {
  const inv = inventory(P, M);
  const t0 = startOfDay(now);
  const names = new Map(P.map((p) => [p.id, p.name]));
  const withName = (m: Movement): ActivityItem => ({ ...m, name: names.get(m.productId) ?? "Unknown" });
  const low = inv.filter((i) => i.status !== "ok").sort((a, b) => a.stock - b.stock);
  const issues = M.filter((m) => m.type === "count" && m.qty < 0 && now - m.ts < 7 * DAY).map(withName);
  const slow = inv.filter((i) => i.stock > 0 && now - i.last > 30 * DAY);
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = t0 - (6 - i) * DAY;
    return { day: new Date(d).toLocaleDateString("en-KE", { weekday: "short" }), value: salesOn(P, M, d) };
  });
  const today = week[6].value, yesterday = week[5].value;
  return {
    inv, low, issues, slow, week, today,
    delta: yesterday ? ((today - yesterday) / yesterday) * 100 : null,
    stockValue: inv.reduce((s, i) => s + i.value, 0),
    productCount: P.length,
    activity: [...M].sort((a, b) => b.ts - a.ts).slice(0, 6).map(withName),
  };
}
