import { DAY, startOfDay, type MoveType } from "./engine";
export const kes = (n: number) => "KES " + Math.round(n).toLocaleString("en-KE");
export const when = (ts: number) => {
  const t0 = startOfDay(Date.now());
  if (ts >= t0) return new Date(ts).toLocaleTimeString("en-KE", { hour: "numeric", minute: "2-digit" });
  return ts >= t0 - DAY ? "Yesterday" : new Date(ts).toLocaleDateString("en-KE", { day: "numeric", month: "short" });
};
export const MOVE_LABEL: Record<MoveType, string> = { sale: "Sold", purchase: "Received stock", adjustment: "Adjusted stock", damage: "Reported damage", count: "Counted stock", return: "Returned stock", opening: "Opening stock" };
export const qtyText = (type: MoveType, q: number) => (type === "sale" || type === "purchase" || type === "return" || type === "opening") ? `× ${Math.abs(q)}` : `${q > 0 ? "+" : "−"}${Math.abs(q)}`;
export const daysAgo = (ts: number, now = Date.now()) => { const d = Math.floor((startOfDay(now) - startOfDay(ts)) / DAY); return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`; };
