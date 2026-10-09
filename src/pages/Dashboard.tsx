import { useMemo } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, Plus } from "lucide-react";
import { dashboard } from "../lib/engine";
import { MOVE_LABEL, kes, qtyText, when } from "../lib/format";
import type { StockCtx } from "../lib/store";
import { Badge, Card } from "../components/ui";

function Metric({
  label,
  value,
  sub,
  onClick,
}: {
  label: string;
  value: string;
  sub: string;
  onClick?: () => void;
}) {
  const cls =
    "flex min-h-28 flex-col justify-between rounded-2xl border border-line bg-surface p-4 text-left";
  const body = (
    <>
      <span className="text-sm text-muted">{label}</span>
      <span className="whitespace-nowrap text-xl font-bold sm:text-2xl">
        {value}
      </span>
      <span className="text-xs text-muted">{sub}</span>
    </>
  );
  return onClick ? (
    <button onClick={onClick} className={cls}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export default function Dashboard() {
  const { state } = useOutletContext<StockCtx>();
  const nav = useNavigate();
  const d = useMemo(
    () =>
      state
        ? dashboard(state.P, state.M, state.S, state.SI, state.C, {
            PU: state.PU,
            PI: state.PI,
            RC: state.RC,
            RI: state.RI,
          })
        : null,
    [state],
  );
  if (!d) return <p className="text-muted">Loading your shop…</p>;
  const h = new Date().getHours();
  const greeting =
    h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">{greeting}, James</h1>
          <p className="text-muted">Here's what's happening today.</p>
        </div>
        <button
          onClick={() => nav("/sales")}
          className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-pdark px-5 font-semibold text-white"
        >
          <Plus size={20} />
          New sale
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Metric
          label="Today's sales"
          value={kes(d.today)}
          sub={
            d.delta == null
              ? "First sales today"
              : `${d.delta >= 0 ? "↑" : "↓"} ${Math.abs(d.delta).toFixed(1)}% vs yesterday`
          }
        />
        <Metric
          label="Stock value"
          value={kes(d.stockValue)}
          sub={`${d.productCount} products`}
        />
        <Metric
          label="Low stock"
          value={`${d.low.length} products`}
          sub="Review stock"
          onClick={() => nav("/inventory")}
        />
        <Metric
          label="Stock issues"
          value={`${d.issues.length} ${d.issues.length === 1 ? "issue" : "issues"}`}
          sub="Last 7 days"
          onClick={() => nav("/inventory")}
        />
      </div>
      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <h2 className="mb-2 text-lg font-semibold">
            Sales overview{" "}
            <span className="text-sm font-normal text-muted">last 7 days</span>
          </h2>
          <div
            className="h-56"
            role="img"
            aria-label={`Sales for the last 7 days. Today ${kes(d.today)}.`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={d.week}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="day"
                  tick={{ fill: "var(--muted)", fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  width={44}
                  tick={{ fill: "var(--muted)", fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) =>
                    v >= 1000 ? `${v / 1000}K` : String(v)
                  }
                />
                <Tooltip formatter={(v: number) => kes(v)} />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="var(--primary)"
                  strokeWidth={3}
                  fill="var(--primary)"
                  fillOpacity={0.14}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <h2 className="mb-3 text-lg font-semibold">Needs attention</h2>
          {!d.low.length &&
            !d.issues.length &&
            !d.slow.length &&
            !d.awaiting && (
              <p className="text-sm text-muted">
                All clear. Nothing needs your attention right now.
              </p>
            )}
          <ul className="divide-y divide-line">
            {d.low.slice(0, 3).map((i) => (
              <li
                key={`l${i.id}`}
                className="flex items-center justify-between gap-2 py-3"
              >
                <div>
                  <Badge tone="bad">
                    <AlertTriangle size={14} />
                    {i.status === "out" ? "Out" : "Low"}
                  </Badge>
                  <p className="mt-1 font-medium">{i.name}</p>
                </div>
                <span className="text-right text-sm text-muted">
                  {i.stock} left
                  <br />
                  {d.onOrder.get(i.id)
                    ? `${d.onOrder.get(i.id)} on order`
                    : `min ${i.min}`}
                </span>
              </li>
            ))}
            {d.issues.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between gap-2 py-3"
              >
                <div>
                  <Badge tone="warn">
                    <AlertTriangle size={14} />
                    Check
                  </Badge>
                  <p className="mt-1 font-medium">{m.name}</p>
                </div>
                <span className="text-right text-sm text-muted">
                  {m.short} short{m.reason ? `, ${m.reason.toLowerCase()}` : ""}
                  <br />
                  {m.staff}, {when(m.ts)}
                </span>
              </li>
            ))}
            {d.awaiting > 0 && (
              <li className="flex items-center justify-between gap-2 py-3">
                <div>
                  <Badge tone="muted">On order</Badge>
                  <p className="mt-1 font-medium">
                    {d.awaiting} {d.awaiting === 1 ? "purchase" : "purchases"}{" "}
                    awaiting delivery
                  </p>
                </div>
                <button
                  onClick={() => nav("/purchases")}
                  className="min-h-11 text-right text-sm font-semibold text-pdark"
                >
                  {kes(d.awaitingValue)}
                  <br />
                  View
                </button>
              </li>
            )}
            {d.slow.length > 0 && (
              <li>
                <button
                  onClick={() => nav("/inventory?filter=slow")}
                  className="flex min-h-14 w-full items-center justify-between gap-2 py-3 text-left"
                  aria-label={`${d.slow.length} products haven't sold in 30+ days. See which ones.`}
                >
                  <span>
                    <Badge tone="muted">Slow</Badge>
                    <span className="mt-1 block font-medium">
                      {d.slow.length} products haven't sold in 30+ days
                    </span>
                  </span>
                  <span className="text-right text-sm text-muted">
                    {kes(d.slow.reduce((s, i) => s + i.value, 0))}
                    <br />
                    tied up ·{" "}
                    <span className="font-semibold text-pdark">See which</span>
                  </span>
                </button>
              </li>
            )}
          </ul>
          <button
            onClick={() => nav("/inventory")}
            className="mt-2 min-h-12 font-semibold text-pdark"
          >
            Review stock
          </button>
        </Card>
      </div>
      <Card>
        <h2 className="mb-3 text-lg font-semibold">Recent activity</h2>
        <ul className="divide-y divide-line">
          {d.activity.map((m) => (
            <li key={m.id} className="flex items-center gap-3 py-3">
              <span
                className="grid size-10 shrink-0 place-items-center rounded-full bg-soft font-bold text-pdark"
                aria-hidden
              >
                {m.staff[0]}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <b>{m.staff}</b>{" "}
                  <span className="text-muted">{MOVE_LABEL[m.type]}</span>
                </p>
                <p className="truncate">
                  {m.name} {qtyText(m.type, m.qty)}
                </p>
              </div>
              <span className="whitespace-nowrap text-xs text-muted">
                {when(m.ts)}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
