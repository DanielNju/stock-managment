import { useNavigate } from "react-router-dom";
import { kes } from "../../lib/format";

export interface SummaryProps { today: number; delta: number | null; profit: number; margin: number | null; stockValue: number; productCount: number; lowCount: number; outCount: number }

function Metric({ label, value, sub, onClick }: { label: string; value: string; sub: string; onClick?: () => void }) {
  const cls = "flex min-h-28 flex-col justify-between rounded-2xl border border-line bg-surface p-4 text-left";
  const body = <><span className="text-sm text-muted">{label}</span><span className="whitespace-nowrap text-xl font-bold sm:text-2xl">{value}</span><span className="text-xs text-muted">{sub}</span></>;
  return onClick ? <button onClick={onClick} className={cls}>{body}</button> : <div className={cls}>{body}</div>;
}

export default function Summary(p: SummaryProps) {
  const nav = useNavigate();
  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <Metric label="Today's sales" value={kes(p.today)} sub={p.delta == null ? "First sales today" : `${p.delta >= 0 ? "↑" : "↓"} ${Math.abs(p.delta).toFixed(1)}% vs yesterday`} />
      <Metric label="Est. gross profit" value={kes(p.profit)} sub={p.margin == null ? "No sales yet today" : `today · ${p.margin.toFixed(0)}% of sales`} />
      <Metric label="Inventory value" value={kes(p.stockValue)} sub={`at cost · ${p.productCount} products`} />
      <Metric label="Low stock" value={`${p.lowCount} ${p.lowCount === 1 ? "product" : "products"}`} sub={p.outCount ? `${p.outCount} out of stock` : "None out of stock"} onClick={() => nav("/inventory?filter=attention")} />
    </div>
  );
}
