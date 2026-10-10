import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { COVER_DAYS, type RestockRow, type valueByCategory } from "../../lib/analytics";
import { SLOW_DAYS, type StockItem } from "../../lib/engine";
import { daysAgo, kes, n0 } from "../../lib/format";
import { Card, Empty } from "../ui";

const TABS = [["restock", "Restock"], ["slow", "Slow-moving"], ["value", "Inventory value"]] as const;
type Tab = (typeof TABS)[number][0];
// "wide" columns only appear from the small breakpoint up; on a phone the key columns fit without side-scrolling
const cls = (right?: boolean, wide?: boolean) => `${right ? "pl-1 text-right tabular-nums" : "pr-2 text-left"} ${wide ? "hidden sm:table-cell" : ""}`;
const Th = ({ children, right, wide }: { children: ReactNode; right?: boolean; wide?: boolean }) => <th className={`py-2 font-medium ${cls(right, wide)}`}>{children}</th>;
const Td = ({ children, right, strong, wide }: { children: ReactNode; right?: boolean; strong?: boolean; wide?: boolean }) => <td className={`py-3 ${cls(right, wide)} ${strong ? "font-semibold" : ""}`}>{children}</td>;
const Table = ({ caption, children }: { caption: string; children: ReactNode }) => <div className="overflow-x-auto"><table className="w-full text-sm"><caption className="sr-only">{caption}</caption>{children}</table></div>;
const per = (n: number) => (n === 0 ? "–" : n >= 10 ? String(Math.round(n)) : String(Math.round(n * 10) / 10));
const Total = ({ label, value }: { label: string; value: string }) => <p className="mt-2 flex justify-between gap-3 border-t border-line pt-3 font-semibold"><span>{label}</span><span className="tabular-nums">{value}</span></p>;

function Restock({ rows }: { rows: RestockRow[] }) {
  if (!rows.length) return <Empty title="Nothing needs restocking" hint="Every product has enough for the next week at its recent pace." />;
  const shown = rows.slice(0, 10), total = rows.reduce((a, r) => a + r.cost, 0);
  const why = (r: RestockRow) => `${r.item.status === "out" ? "Out of stock" : r.item.status === "low" ? "Low stock" : `Runs out in about ${Math.max(1, Math.round(r.daysLeft ?? 0))} days`}${r.onOrder ? ` · ${r.onOrder} on order` : ""}`;
  return <>
    <Table caption="Products to restock">
      <thead><tr className="text-muted"><Th>Product</Th><Th right>In stock</Th><Th right wide>On order</Th><Th right wide>Sells/day</Th><Th right>Days left</Th><Th right>Suggested</Th><Th right wide>Est. cost (KES)</Th></tr></thead>
      <tbody>{shown.map((r) => (
        <tr key={r.item.id} className="border-t border-line">
          <Td><Link to={`/products/${r.item.id}`} className="font-medium">{r.item.name}</Link><span className="block text-xs text-muted">{why(r)}</span></Td>
          <Td right>{r.item.stock}</Td><Td right wide>{r.onOrder || "–"}</Td><Td right wide>{per(r.perDay)}</Td><Td right>{r.daysLeft == null ? "–" : Math.round(r.daysLeft)}</Td>
          <Td right strong>{r.suggested > 0 ? r.suggested : "Covered"}</Td><Td right wide>{r.suggested > 0 ? n0(r.cost) : "–"}</Td>
        </tr>))}</tbody>
    </Table>
    <Total label={`Estimated cost of suggested orders${rows.length > shown.length ? ` (all ${rows.length} products)` : ""}`} value={kes(total)} />
    <p className="mt-2 text-xs text-muted">Suggested = enough for {COVER_DAYS} days at the last two weeks' pace, plus your minimum stock, less what you have and what is already on order. It is a starting point, not a promise.</p>
  </>;
}

function Slow({ items }: { items: StockItem[] }) {
  if (!items.length) return <Empty title="No slow-moving stock" hint={`Everything in stock has sold within ${SLOW_DAYS} days.`} />;
  return <>
    <Table caption="Slow-moving products">
      <thead><tr className="text-muted"><Th>Product</Th><Th right>In stock</Th><Th right>Value (KES)</Th><Th right>Last sale</Th></tr></thead>
      <tbody>{items.slice(0, 8).map((i) => (
        <tr key={i.id} className="border-t border-line">
          <Td><Link to={`/products/${i.id}`} className="font-medium">{i.name}</Link></Td><Td right>{i.stock}</Td><Td right strong>{n0(i.value)}</Td><Td right>{i.last ? daysAgo(i.last) : `none since added ${daysAgo(i.createdAt)}`}</Td>
        </tr>))}</tbody>
    </Table>
    <Total label="Tied up in slow stock" value={kes(items.reduce((a, i) => a + i.value, 0))} />
    <p className="mt-2 text-sm"><Link to="/inventory?filter=slow" className="font-semibold text-pdark">See all in Inventory →</Link></p>
  </>;
}

function Value({ data }: { data: ReturnType<typeof valueByCategory> }) {
  if (!data.rows.length) return <Empty title="No stock yet" hint="Inventory value appears once products have stock." />;
  return <>
    <Table caption="Inventory value by category">
      <thead><tr className="text-muted"><Th>Category</Th><Th right>Products</Th><Th right wide>Units</Th><Th right>Value (KES)</Th><Th right>Share</Th></tr></thead>
      <tbody>{data.rows.map((r) => (
        <tr key={r.name} className="border-t border-line"><Td><span className="font-medium">{r.name}</span>
          <span className="mt-1 block h-1.5 rounded-full bg-soft" aria-hidden><span className="block h-1.5 rounded-full bg-primary" style={{ width: `${r.share}%` }} /></span></Td>
          <Td right>{r.products}</Td><Td right wide>{r.units}</Td><Td right strong>{n0(r.value)}</Td><Td right>{r.share.toFixed(0)}%</Td></tr>))}</tbody>
      <tfoot><tr className="border-t border-line font-semibold"><td className="py-3">Total</td><td /><td className="hidden sm:table-cell" /><td className="py-3 text-right tabular-nums">{kes(data.total)}</td><td className="py-3 text-right">100%</td></tr></tfoot>
    </Table>
  </>;
}

export default function StockAnalysis({ restock, slow, value }: { restock: RestockRow[]; slow: StockItem[]; value: ReturnType<typeof valueByCategory> }) {
  const [tab, setTab] = useState<Tab>("restock");
  const count: Record<Tab, number | null> = { restock: restock.length, slow: slow.length, value: null };
  return (
    <Card>
      <h2 className="mb-2 text-lg font-semibold">Stock analysis</h2>
      <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Stock analysis view">
        {TABS.map(([k, label]) => <button key={k} aria-pressed={tab === k} onClick={() => setTab(k)} className={`min-h-11 rounded-full border px-4 text-sm font-semibold ${tab === k ? "border-pdark bg-soft text-pdark" : "border-line text-muted"}`}>{label}{count[k] != null ? ` (${count[k]})` : ""}</button>)}
      </div>
      {tab === "restock" && <Restock rows={restock} />}{tab === "slow" && <Slow items={slow} />}{tab === "value" && <Value data={value} />}
    </Card>
  );
}
