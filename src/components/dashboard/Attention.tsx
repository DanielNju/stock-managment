import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { SLOW_DAYS } from "../../lib/engine";
import type { AttentionItem } from "../../lib/analytics";
import { daysAgo, kes, when } from "../../lib/format";
import { Badge, Card } from "../ui";

const per = (n: number) => (n >= 10 ? Math.round(n) : Math.round(n * 10) / 10);
type Row = { tone: "bad" | "warn" | "muted"; label: string; title: string; detail: string; right: string; href: string };

function describe(i: AttentionItem): Row {
  switch (i.kind) {
    case "out": return { tone: "bad", label: "Out of stock", title: i.name, href: `/products/${i.productId}`, right: "0 left",
      detail: `${i.onOrder > 0 ? `${i.onOrder} on order` : "Not on order"}${i.perDay > 0 ? ` · sells about ${per(i.perDay)}/day` : ""}` };
    case "low": return { tone: "bad", label: "Low stock", title: i.name, href: `/products/${i.productId}`, right: `${i.stock} left`,
      detail: `${i.daysLeft != null ? `About ${Math.max(1, Math.round(i.daysLeft))} ${Math.max(1, Math.round(i.daysLeft)) === 1 ? "day" : "days"} left` : `Minimum is ${i.min}`}${i.onOrder > 0 ? ` · ${i.onOrder} on order` : ""}` };
    case "count": return { tone: "warn", label: "Count mismatch", title: i.name, href: `/products/${i.productId}`, right: `−${i.short}`,
      detail: `${i.short} short${i.reason ? ` · ${i.reason}` : ""} · ${i.staff}, ${when(i.ts)}` };
    case "purchase": return { tone: i.state === "partial" ? "warn" : "muted", label: i.state === "partial" ? "Partly received" : "Awaiting delivery", title: `${i.ref} · ${i.supplier}`, href: `/purchases/${i.purchaseId}`, right: kes(i.outstandingValue),
      detail: i.state === "partial" ? `${i.received} of ${i.ordered} units received` : `${i.ordered} units ordered ${daysAgo(i.ts)}` };
    case "slow": return { tone: "muted", label: "Slow", title: `${i.count} products haven't sold in ${SLOW_DAYS}+ days`, href: "/inventory?filter=slow", right: "See which", detail: `${kes(i.value)} tied up` };
  }
}

export default function Attention({ items }: { items: AttentionItem[] }) {
  const [all, setAll] = useState(false);
  const slow = items.find((i) => i.kind === "slow"), rest = items.filter((i) => i.kind !== "slow");
  // each kind gets its own share of the list, so a pile of low-stock rows can't hide a late delivery or a count mismatch
  const CAP = { stock: 3, count: 2, purchase: 2 } as const, seen = { stock: 0, count: 0, purchase: 0 };
  const group = (i: AttentionItem) => (i.kind === "out" || i.kind === "low" ? "stock" : i.kind === "count" ? "count" : "purchase");
  const shown = all ? rest : rest.filter((i) => ++seen[group(i)] <= CAP[group(i)]);
  const row = (i: AttentionItem) => { const r = describe(i); return (
    <li key={i.id}>
      <Link to={r.href} className="flex min-h-14 w-full items-center justify-between gap-3 py-3">
        <span className="min-w-0 flex-1"><Badge tone={r.tone}>{r.tone !== "muted" && <AlertTriangle size={14} />}{r.label}</Badge>
          <span className="mt-1 block line-clamp-2 font-medium">{r.title}</span><span className="block text-sm text-muted">{r.detail}</span></span>
        <span className={`shrink-0 text-right text-sm ${i.kind === "slow" ? "font-semibold text-pdark" : "text-muted"}`}>{r.right}</span>
      </Link>
    </li>); };
  return (
    <Card>
      <div className="mb-2 flex items-center justify-between"><h2 className="text-lg font-semibold">Needs attention</h2>{rest.length > 0 && <span className="text-sm text-muted">{rest.length} {rest.length === 1 ? "item" : "items"}</span>}</div>
      {items.length === 0 && <p className="text-sm text-muted">All clear. Nothing needs your attention right now.</p>}
      <ul className="divide-y divide-line">{shown.map(row)}{slow && row(slow)}</ul>
      {(all || shown.length < rest.length) && <button onClick={() => setAll(!all)} className="mt-1 min-h-12 font-semibold text-pdark">{all ? "Show fewer" : `Show all ${rest.length}`}</button>}
    </Card>
  );
}
