import { useState } from "react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { customerHasSales, customerStats } from "../lib/people";
import { kes, when } from "../lib/format";
import type { StockCtx } from "../lib/store";
import { Badge, Card, Empty, Errors, btnGhost, btnPrimary } from "../components/ui";

export default function CustomerDetail() {
  const { state, setCustomerArchived, deleteCustomer } = useOutletContext<StockCtx>();
  const { id } = useParams();
  const nav = useNavigate();
  const [errors, setErrors] = useState<string[]>([]), [confirm, setConfirm] = useState(false);
  if (!state) return <p className="text-muted">Loading…</p>;
  const c = state.CUS.find((x) => x.id === id);
  if (!c) return <Card><Empty title="Customer not found" hint="They may have been deleted." /><Link to="/customers" className={btnGhost}>Back to customers</Link></Card>;
  const st = customerStats(c.id, state.S, state.SI);
  const name = new Map(state.P.map((p) => [p.id, p.name]));
  const mine = state.S.filter((s) => s.customerId === c.id).sort((a, b) => b.ts - a.ts);
  const history = customerHasSales(c.id, state.S);
  const act = async (r: Promise<{ ok: boolean; errors?: string[] }>, then?: () => void) => { const x = await r; if (!x.ok) setErrors(x.errors ?? []); else { setErrors([]); then?.(); } };
  const info: [string, string | undefined][] = [["Phone", c.phone], ["Email", c.email], ["Location", c.location]];
  const stats: [string, string][] = [["Total spent", kes(st.spent)], ["Purchases", String(st.count)], ["Average sale", st.count ? kes(st.avg) : "–"], ["Last purchase", st.last ? when(st.last) : "–"]];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><Link to="/customers" className="text-sm font-semibold text-pdark">← Customers</Link><h1 className="mt-1 text-2xl font-bold sm:text-3xl">{c.name}</h1></div>
        {c.archived && <Badge tone="muted">Archived</Badge>}
      </div>
      <Errors list={errors} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map(([k, v]) => <div key={k} className="rounded-2xl border border-line bg-surface p-4"><p className="text-sm text-muted">{k}</p><p className="whitespace-nowrap text-xl font-bold">{v}</p></div>)}
      </div>
      <Card>
        <dl className="grid gap-3 sm:grid-cols-3">{info.map(([k, v]) => <div key={k}><dt className="text-sm text-muted">{k}</dt><dd>{v || "–"}</dd></div>)}</dl>
        {c.notes && <p className="mt-3 text-sm text-muted">{c.notes}</p>}
      </Card>
      <div className="flex flex-wrap gap-2">
        {!c.archived && <Link to={`/sales?customer=${c.id}`} className={btnPrimary}>New sale for {c.name.split(" ")[0]}</Link>}
        <Link to={`/customers/${c.id}/edit`} className={btnGhost}>Edit</Link>
        <button onClick={() => void act(setCustomerArchived(c.id, !c.archived))} className={btnGhost}>{c.archived ? "Restore" : "Archive"}</button>
        {history ? <span className="self-center text-sm text-muted">Has purchases on record, so they can be archived but not deleted.</span>
          : confirm ? <><button onClick={() => void act(deleteCustomer(c.id), () => nav("/customers"))} className={btnPrimary}>Yes, delete</button><button onClick={() => setConfirm(false)} className={btnGhost}>Keep</button></>
          : <button onClick={() => setConfirm(true)} className={btnGhost}>Delete</button>}
      </div>
      <Card><h2 className="mb-2 text-lg font-semibold">Purchase history</h2>
        {mine.length === 0 ? <Empty title="No purchases yet" hint="Choose this customer when you make a sale and it will appear here." /> : (
          <ul className="divide-y divide-line">{mine.map((s) => {
            const items = state.SI.filter((i) => i.saleId === s.id);
            return (
              <li key={s.id}><Link to="/sales?tab=history" className="flex min-h-14 items-center justify-between gap-3 py-3">
                <span className="min-w-0"><span className="block font-semibold">{s.receiptNo} {s.status === "cancelled" && <Badge tone="muted">Cancelled</Badge>}</span>
                  <span className="block truncate text-sm text-muted">{items.map((i) => `${name.get(i.productId) ?? "Item"} × ${i.qty}`).join(", ")}</span>
                  <span className="text-xs text-muted">{when(s.ts)} · {s.staff} · {s.payment === "mpesa" ? "M-Pesa" : "Cash"}</span></span>
                <span className={`shrink-0 font-semibold ${s.status === "cancelled" ? "text-muted line-through" : ""}`}>{kes(s.total)}</span>
              </Link></li>); })}</ul>)}
      </Card>
    </div>
  );
}
