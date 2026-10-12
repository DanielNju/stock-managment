import { useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { Plus, Search } from "lucide-react";
import { customerStats } from "../lib/people";
import { kes, when } from "../lib/format";
import type { StockCtx } from "../lib/store";
import { Badge, Card, Empty, btnPrimary } from "../components/ui";

export default function Customers() {
  const { state } = useOutletContext<StockCtx>();
  const [q, setQ] = useState(""), [archived, setArchived] = useState(false);
  if (!state) return <p className="text-muted">Loading customers…</p>;
  const rows = state.CUS.filter((c) => c.archived === archived && `${c.name} ${c.phone ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()))
    .map((c) => ({ c, st: customerStats(c.id, state.S, state.SI) })).sort((a, b) => b.st.spent - a.st.spent || a.c.name.localeCompare(b.c.name));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-bold sm:text-3xl">Customers</h1><p className="text-muted">Who buys from you, and what they buy.</p></div>
        <Link to="/customers/new" className={btnPrimary}><Plus size={20} />Add customer</Link>
      </div>
      <div className="flex flex-wrap gap-2">
        <label className="flex min-h-12 min-w-48 flex-1 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-muted"><Search size={18} />
          <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search customers" placeholder="Search name or phone" className="flex-1 bg-transparent text-ink outline-none" /></label>
        <label className="flex min-h-12 items-center gap-2 px-1 text-sm"><input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} className="size-5" />Archived</label>
      </div>
      <Card>
        {rows.length === 0 ? <Empty title={state.CUS.length === 0 ? "No customers yet" : "No customers match"} hint={state.CUS.length === 0 ? "Add a customer here, or while making a sale. Walk-in sales don't need one." : "Try a different search."} /> : (
          <ul className="divide-y divide-line">
            {rows.map(({ c, st }) => (
              <li key={c.id}><Link to={`/customers/${c.id}`} className="flex min-h-16 items-center justify-between gap-3 py-3">
                <span className="min-w-0"><span className="block truncate font-medium">{c.name}</span>
                  <span className="block line-clamp-2 text-sm text-muted">{c.phone || "No phone"} · {st.count === 0 ? "No purchases yet" : `${st.count} ${st.count === 1 ? "purchase" : "purchases"}, last ${when(st.last!)}`}</span></span>
                <span className="shrink-0 text-right">{c.archived && <Badge tone="muted">Archived</Badge>}<span className="block font-semibold">{kes(st.spent)}</span><span className="text-xs text-muted">spent</span></span>
              </Link></li>))}
          </ul>)}
      </Card>
    </div>
  );
}
