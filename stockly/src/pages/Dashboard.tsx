import { useMemo, type ReactNode } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, Plus } from "lucide-react";
import { DAY, dashboard, startOfDay, type ActivityItem, type MoveType } from "../lib/engine";
import type { StockCtx } from "../lib/store";

const kes = (n: number) => "KES " + Math.round(n).toLocaleString("en-KE");
const LABEL: Record<MoveType, string> = { sale: "Sold", purchase: "Received stock", adjustment: "Adjusted stock", damage: "Reported damage", count: "Counted stock" };
const when = (ts: number) => {
  const t0 = startOfDay(Date.now());
  if (ts >= t0) return new Date(ts).toLocaleTimeString("en-KE", { hour: "numeric", minute: "2-digit" });
  return ts >= t0 - DAY ? "Yesterday" : new Date(ts).toLocaleDateString("en-KE", { day: "numeric", month: "short" });
};
const qty = (m: ActivityItem) => m.type === "sale" || m.type === "purchase" ? `× ${Math.abs(m.qty)}` : `${m.qty > 0 ? "+" : "−"}${Math.abs(m.qty)}`;

const Card = ({ children, className = "" }: { children: ReactNode; className?: string }) =>
  <section className={`rounded-2xl border border-line bg-surface p-4 sm:p-5 ${className}`}>{children}</section>;

function Metric({ label, value, sub, onClick }: { label: string; value: string; sub: string; onClick?: () => void }) {
  const cls = "flex min-h-28 flex-col justify-between rounded-2xl border border-line bg-surface p-4 text-left";
  const body = <><span className="text-sm text-muted">{label}</span><span className="text-2xl font-bold">{value}</span><span className="text-xs text-muted">{sub}</span></>;
  return onClick ? <button onClick={onClick} className={cls}>{body}</button> : <div className={cls}>{body}</div>;
}
const Badge = ({ tone, children }: { tone: "bad" | "warn" | "muted"; children: ReactNode }) => {
  const c = { bad: "text-bad border-bad", warn: "text-warn border-warn", muted: "text-muted border-line" }[tone];
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${c}`}>{children}</span>;
};

export default function Dashboard() {
  const { state, addMovement } = useOutletContext<StockCtx>();
  const nav = useNavigate();
  const d = useMemo(() => (state ? dashboard(state.P, state.M) : null), [state]);
  if (!d) return <p className="text-muted">Loading your shop…</p>;

  const h = new Date().getHours();
  const greeting = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  const quickSale = () => {
    const pick = d.inv.filter((i) => i.stock > 0);
    if (!pick.length) return;
    const p = pick[Math.floor(Math.random() * pick.length)];
    void addMovement({ productId: p.id, type: "sale", qty: -1, ts: Date.now(), staff: "James" });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-bold sm:text-3xl">{greeting}, James</h1><p className="text-muted">Here's what's happening today.</p></div>
        <button onClick={quickSale} className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-pdark px-5 font-semibold text-white"><Plus size={20} />New sale (demo)</button>
      </div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Metric label="Today's sales" value={kes(d.today)} sub={d.delta == null ? "First sales today" : `${d.delta >= 0 ? "↑" : "↓"} ${Math.abs(d.delta).toFixed(1)}% vs yesterday`} />
        <Metric label="Stock value" value={kes(d.stockValue)} sub={`${d.productCount} products`} />
        <Metric label="Low stock" value={`${d.low.length} products`} sub="Review stock" onClick={() => nav("/inventory")} />
        <Metric label="Stock issues" value={`${d.issues.length} ${d.issues.length === 1 ? "issue" : "issues"}`} sub="Last 7 days" onClick={() => nav("/inventory")} />
      </div>
      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <h2 className="mb-2 text-lg font-semibold">Sales overview <span className="text-sm font-normal text-muted">last 7 days</span></h2>
          <div className="h-56" role="img" aria-label={`Sales for the last 7 days. Today ${kes(d.today)}.`}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={d.week} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="day" tick={{ fill: "var(--muted)", fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis width={44} tick={{ fill: "var(--muted)", fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => (v >= 1000 ? `${v / 1000}K` : String(v))} />
                <Tooltip formatter={(v: number) => kes(v)} />
                <Area type="monotone" dataKey="value" stroke="var(--primary)" strokeWidth={3} fill="var(--primary)" fillOpacity={0.14} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <h2 className="mb-3 text-lg font-semibold">Needs attention</h2>
          {!d.low.length && !d.issues.length && !d.slow.length && <p className="text-sm text-muted">All clear. Nothing needs your attention right now.</p>}
          <ul className="divide-y divide-line">
            {d.low.slice(0, 3).map((i) => (
              <li key={`l${i.id}`} className="flex items-center justify-between gap-2 py-3">
                <div><Badge tone="bad"><AlertTriangle size={14} />{i.status === "out" ? "Out" : "Low"}</Badge><p className="mt-1 font-medium">{i.name}</p></div>
                <span className="text-right text-sm text-muted">{i.stock} left<br />min {i.min}</span>
              </li>
            ))}
            {d.issues.map((m) => (
              <li key={`c${m.id}`} className="flex items-center justify-between gap-2 py-3">
                <div><Badge tone="warn"><AlertTriangle size={14} />Check</Badge><p className="mt-1 font-medium">{m.name}</p></div>
                <span className="text-right text-sm text-muted">{Math.abs(m.qty)} short<br />{m.staff}, {when(m.ts)}</span>
              </li>
            ))}
            {d.slow.length > 0 && (
              <li className="flex items-center justify-between gap-2 py-3">
                <div><Badge tone="muted">Slow</Badge><p className="mt-1 font-medium">{d.slow.length} products haven't sold in 30+ days</p></div>
                <span className="text-right text-sm text-muted">{kes(d.slow.reduce((s, i) => s + i.value, 0))}<br />tied up</span>
              </li>
            )}
          </ul>
          <button onClick={() => nav("/inventory")} className="mt-2 min-h-12 font-semibold text-pdark">Review stock</button>
        </Card>
      </div>
      <Card>
        <h2 className="mb-3 text-lg font-semibold">Recent activity</h2>
        <ul className="divide-y divide-line">
          {d.activity.map((m) => (
            <li key={m.id} className="flex items-center gap-3 py-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-soft font-bold text-pdark" aria-hidden>{m.staff[0]}</span>
              <div className="min-w-0 flex-1"><p className="text-sm"><b>{m.staff}</b> <span className="text-muted">{LABEL[m.type]}</span></p><p className="truncate">{m.name} {qty(m)}</p></div>
              <span className="whitespace-nowrap text-xs text-muted">{when(m.ts)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
