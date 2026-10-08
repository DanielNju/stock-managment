import type { ReactNode } from "react";
export const btnPrimary = "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-pdark px-5 font-semibold text-white disabled:opacity-50";
export const btnGhost = "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 font-semibold text-ink disabled:opacity-50";
export const Card = ({ children, className = "" }: { children: ReactNode; className?: string }) =>
  <section className={`rounded-2xl border border-line bg-surface p-4 sm:p-5 ${className}`}>{children}</section>;
export function Badge({ tone, children }: { tone: "bad" | "warn" | "muted" | "ok"; children: ReactNode }) {
  const c = { bad: "text-bad border-bad", warn: "text-warn border-warn", ok: "text-ok border-ok", muted: "text-muted border-line" }[tone];
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${c}`}>{children}</span>;
}
export const Empty = ({ title, hint }: { title: string; hint: string }) =>
  <div className="py-10 text-center"><p className="font-semibold">{title}</p><p className="mt-1 text-sm text-muted">{hint}</p></div>;
