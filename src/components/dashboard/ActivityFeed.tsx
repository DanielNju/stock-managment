import { useState } from "react";
import { Link } from "react-router-dom";
import type { FeedEvent, FeedKind } from "../../lib/analytics";
import { startOfDay } from "../../lib/engine";
import { kes } from "../../lib/format";
import { Badge, Card, Empty } from "../ui";

const FILTERS: [string, string, FeedKind[]][] = [["all", "All", ["sale", "cancel", "delivery", "adjust", "count"]], ["sale", "Sales", ["sale"]], ["delivery", "Deliveries", ["delivery"]], ["cancel", "Cancellations", ["cancel"]], ["stock", "Adjustments & counts", ["adjust", "count"]]];
const TAG: Record<FeedKind, [string, "ok" | "warn" | "muted"]> = { sale: ["Sale", "ok"], cancel: ["Cancelled", "warn"], delivery: ["Delivery", "muted"], adjust: ["Adjustment", "muted"], count: ["Count", "muted"] };
const PAGE = 12;
const day = (ts: number) => { const d = startOfDay(Date.now()) - startOfDay(ts); return d <= 0 ? "Today" : d <= 864e5 ? "Yesterday" : new Date(ts).toLocaleDateString("en-KE", { weekday: "short", day: "numeric", month: "short" }); };
const clock = (ts: number) => new Date(ts).toLocaleTimeString("en-KE", { hour: "numeric", minute: "2-digit" });

export default function ActivityFeed({ events }: { events: FeedEvent[] }) {
  const [f, setF] = useState("all"), [limit, setLimit] = useState(PAGE);
  const kinds = FILTERS.find((x) => x[0] === f)![2], all = events.filter((e) => kinds.includes(e.kind)), shown = all.slice(0, limit);
  const groups: { label: string; items: FeedEvent[] }[] = [];
  for (const e of shown) { const l = day(e.ts), g = groups[groups.length - 1]; if (g && g.label === l) g.items.push(e); else groups.push({ label: l, items: [e] }); }
  return (
    <Card>
      <h2 className="mb-2 text-lg font-semibold">Recent business activity</h2>
      <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Activity type">
        {FILTERS.map(([k, label, ks]) => <button key={k} aria-pressed={f === k} onClick={() => { setF(k); setLimit(PAGE); }} className={`min-h-11 rounded-full border px-4 text-sm font-semibold ${f === k ? "border-pdark bg-soft text-pdark" : "border-line text-muted"}`}>{label} ({events.filter((e) => ks.includes(e.kind)).length})</button>)}
      </div>
      {all.length === 0 ? <Empty title="Nothing here yet" hint="Activity of this type will appear as it happens." /> : groups.map((g) => (
        <section key={g.label} aria-label={g.label}>
          <h3 className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted">{g.label}</h3>
          <ul className="divide-y divide-line">{g.items.map((e) => { const [tag, tone] = TAG[e.kind]; const body = (
            <>
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-soft font-bold text-pdark" aria-hidden>{e.staff[0]}</span>
              <span className="min-w-0 flex-1"><span className="block text-sm"><b>{e.staff}</b> <span className="text-muted">{e.verb}</span> <Badge tone={tone}>{tag}</Badge></span>
                <span className="block line-clamp-2">{e.subject}</span>{e.detail && <span className="block line-clamp-2 text-sm text-muted">{e.detail}</span>}</span>
              <span className="shrink-0 text-right text-xs text-muted">{e.amount != null && <span className="block text-sm font-semibold text-ink">{kes(e.amount)}</span>}{clock(e.ts)}</span>
            </>); return <li key={e.id}>{e.href ? <Link to={e.href} className="flex min-h-14 items-center gap-3 py-3">{body}</Link> : <div className="flex min-h-14 items-center gap-3 py-3">{body}</div>}</li>; })}</ul>
        </section>))}
      {all.length > limit && <button onClick={() => setLimit(limit + PAGE)} className="mt-2 min-h-12 font-semibold text-pdark">Show more ({all.length - limit} older)</button>}
    </Card>
  );
}
