import { DAY, startOfDay } from "./engine";
export const kes = (n: number) => "KES " + Math.round(n).toLocaleString("en-KE");
export const when = (ts: number) => {
  const t0 = startOfDay(Date.now());
  if (ts >= t0) return new Date(ts).toLocaleTimeString("en-KE", { hour: "numeric", minute: "2-digit" });
  return ts >= t0 - DAY ? "Yesterday" : new Date(ts).toLocaleDateString("en-KE", { day: "numeric", month: "short" });
};
