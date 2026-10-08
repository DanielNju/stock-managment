import { useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { inventory } from "../lib/engine";
import { kes, when } from "../lib/format";
import type { StockCtx } from "../lib/store";
import { Badge, Card, Empty, btnGhost, btnPrimary } from "../components/ui";

const REASONS = ["Missing", "Damaged", "Expired", "Counting correction", "Other"];
const ORDER = { out: 0, low: 1, ok: 2 } as const;

export default function Inventory() {
  const { state, recordCount } = useOutletContext<StockCtx>();
  const [open, setOpen] = useState<string | null>(null);
  const [val, setVal] = useState("");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [msg, setMsg] = useState("");
  const inv = useMemo(() => (state ? inventory(state.P, state.M, new Set(state.S.filter((s) => s.status === "cancelled").map((s) => s.id))) : []), [state]);
  if (!state) return <p className="text-muted">Loading inventory…</p>;
  const name = new Map(state.P.map((p) => [p.id, p.name]));
  const rows = inv.filter((i) => !i.archived).sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.name.localeCompare(b.name));
  const counts = [...state.C].sort((a, b) => b.ts - a.ts).slice(0, 8);

  const start = (id: string) => { setOpen(open === id ? null : id); setVal(""); setReason(""); setErrors([]); setMsg(""); };
  const confirm = async (id: string) => {
    const r = await recordCount(id, val.trim() === "" ? NaN : Number(val), reason);
    if (!r.ok) { setErrors(r.errors); return; }
    setMsg(r.value.count.diff === 0 ? "Count matches. Nothing to adjust." : `Stock adjusted by ${r.value.count.diff > 0 ? "+" : "−"}${Math.abs(r.value.count.diff)}.`);
    setOpen(null); setErrors([]);
  };

  return (
    <div className="space-y-4">
      <div><h1 className="text-2xl font-bold sm:text-3xl">Inventory</h1><p className="text-muted">Count a product to check the system against the shelf.</p></div>
      {msg && <p role="status" className="rounded-xl border border-ok p-3 font-medium text-ok">{msg}</p>}
      <Card>
        <ul className="divide-y divide-line">
          {rows.map((i) => {
            const diff = val.trim() === "" ? null : Number(val) - i.stock;
            return (
              <li key={i.id} className="py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{i.name} {i.status !== "ok" && <Badge tone="bad"><AlertTriangle size={14} />{i.status === "out" ? "Out" : "Low"}</Badge>}</p>
                    <p className="text-sm text-muted">{i.sku} · {kes(i.value)} in stock</p>
                  </div>
                  <div className="flex items-center gap-3"><span className="text-right"><span className="block text-xl font-bold">{i.stock}</span><span className="text-xs text-muted">min {i.min}</span></span>
                    <button onClick={() => start(i.id)} aria-expanded={open === i.id} className={btnGhost}>Count</button></div>
                </div>
                {open === i.id && (
                  <div className="mt-3 rounded-xl bg-bg p-3">
                    <p className="text-sm text-muted">System says <b className="text-ink">{i.stock}</b>. How many are on the shelf?</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <input value={val} onChange={(e) => setVal(e.target.value)} inputMode="numeric" aria-label={`Counted quantity for ${i.name}`} placeholder="Counted" className="min-h-12 w-28 rounded-xl border border-line bg-surface px-3 text-lg" />
                      <select value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason for difference" className="min-h-12 flex-1 rounded-xl border border-line bg-surface px-3">
                        <option value="">Reason (if different)</option>{REASONS.map((r) => <option key={r}>{r}</option>)}
                      </select>
                    </div>
                    {diff !== null && Number.isFinite(diff) && <p className="mt-2 font-semibold">{diff === 0 ? "Matches the system." : `Difference: ${diff > 0 ? "+" : "−"}${Math.abs(diff)}`}</p>}
                    {errors.length > 0 && <ul role="alert" className="mt-2 text-sm text-bad">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
                    <button onClick={() => void confirm(i.id)} className={`${btnPrimary} mt-3 w-full sm:w-auto`}>Confirm count</button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Card>
      <Card>
        <h2 className="mb-2 text-lg font-semibold">Recent counts</h2>
        {counts.length === 0 ? <Empty title="No counts yet" hint="Count a product above to start checking your stock." /> : (
          <ul className="divide-y divide-line">
            {counts.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-3">
                <span><span className="block font-medium">{name.get(c.productId)}</span><span className="text-sm text-muted">{c.staff} · {when(c.ts)}{c.reason ? ` · ${c.reason}` : ""}</span></span>
                {c.diff === 0 ? <Badge tone="ok">Matches</Badge> : <Badge tone={c.diff < 0 ? "warn" : "muted"}>{c.diff < 0 ? "Check" : "Over"} {c.diff > 0 ? "+" : "−"}{Math.abs(c.diff)}</Badge>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
