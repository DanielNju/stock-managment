import { useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Check, Minus, Plus, Search } from "lucide-react";
import { inventory, type Payment, type Sale, type SaleItem } from "../lib/engine";
import { kes, when } from "../lib/format";
import type { StockCtx } from "../lib/store";
import { Badge, Card, Empty, btnGhost, btnPrimary } from "../components/ui";

const PAY: { id: Payment; label: string }[] = [{ id: "cash", label: "Cash" }, { id: "mpesa", label: "M-Pesa" }];

export default function Sales() {
  const { state, recordSale, cancelSale } = useOutletContext<StockCtx>();
  const [tab, setTab] = useState<"new" | "history">("new");
  const [q, setQ] = useState("");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [pay, setPay] = useState<Payment>("cash");
  const [errors, setErrors] = useState<string[]>([]);
  const [receipt, setReceipt] = useState<{ sale: Sale; items: SaleItem[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);

  const inv = useMemo(() => (state ? inventory(state.P, state.M, new Set(state.S.filter((s) => s.status === "cancelled").map((s) => s.id))) : []), [state]);
  if (!state) return <p className="text-muted">Loading sales…</p>;
  const name = new Map(state.P.map((p) => [p.id, p.name]));
  const shown = inv.filter((i) => !i.archived).filter((i) => `${i.name} ${i.sku}`.toLowerCase().includes(q.trim().toLowerCase())).sort((a, b) => a.name.localeCompare(b.name));
  const lines = Object.entries(cart).map(([id, qty]) => ({ item: inv.find((i) => i.id === id)!, qty })).filter((l) => l.item);
  const total = lines.reduce((s, l) => s + l.qty * l.item.price, 0);
  const setQty = (id: string, qty: number) => setCart((c) => { const n = { ...c }; if (qty <= 0) delete n[id]; else n[id] = qty; return n; });

  const complete = async () => {
    setBusy(true);
    const r = await recordSale(lines.map((l) => ({ productId: l.item.id, qty: l.qty })), pay);
    setBusy(false);
    if (!r.ok) { setErrors(r.errors); return; }
    setErrors([]); setReceipt(r.value); setCart({});
  };
  const sales = [...state.S].sort((a, b) => b.ts - a.ts).slice(0, 50);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold sm:text-3xl">Sales</h1>
        <div className="inline-flex rounded-xl border border-line bg-surface p-1" role="group" aria-label="Sales view">
          {(["new", "history"] as const).map((t) => (
            <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)} className={`min-h-11 rounded-lg px-4 font-semibold ${tab === t ? "bg-soft text-pdark" : "text-muted"}`}>{t === "new" ? "New sale" : "History"}</button>
          ))}
        </div>
      </div>

      {tab === "new" && receipt && (
        <Card>
          <p className="flex items-center gap-2 text-lg font-semibold text-ok"><Check size={22} />Sale recorded</p>
          <p className="mt-1 text-muted">Receipt {receipt.sale.receiptNo} · {PAY.find((p) => p.id === receipt.sale.payment)?.label}</p>
          <ul className="my-3 divide-y divide-line">
            {receipt.items.map((i) => <li key={i.productId} className="flex justify-between py-2"><span>{name.get(i.productId)} × {i.qty}</span><span>{kes(i.qty * i.unitPrice)}</span></li>)}
          </ul>
          <p className="flex justify-between text-xl font-bold"><span>Total</span><span>{kes(receipt.sale.total)}</span></p>
          <button onClick={() => setReceipt(null)} className={`${btnPrimary} mt-4 w-full`}>Done, new sale</button>
        </Card>
      )}

      {tab === "new" && !receipt && (
        <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
          <div className="space-y-3">
            <label className="flex min-h-12 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-muted">
              <Search size={18} /><input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search products" placeholder="Search product or SKU" className="flex-1 bg-transparent text-ink outline-none" />
            </label>
            {shown.length === 0 ? <Card><Empty title="No products found" hint="Try another name or SKU." /></Card> : (
              <ul className="space-y-2">
                {shown.map((i) => {
                  const left = i.stock - (cart[i.id] ?? 0);
                  return (
                    <li key={i.id}>
                      <button disabled={left <= 0} onClick={() => setQty(i.id, (cart[i.id] ?? 0) + 1)} className="flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3 text-left disabled:opacity-50">
                        <span><span className="block font-medium">{i.name}</span><span className="text-sm text-muted">{kes(i.price)} · {i.stock <= 0 ? "Out of stock" : `${left} left`}</span></span>
                        <span className="grid size-10 place-items-center rounded-full bg-soft text-pdark" aria-hidden><Plus size={20} /></span>
                        <span className="sr-only">Add {i.name}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <Card className="order-first h-fit lg:order-last lg:sticky lg:top-24">
            <h2 className="mb-2 text-lg font-semibold">Current sale</h2>
            {lines.length === 0 ? <p className="text-sm text-muted">Tap a product to add it.</p> : (
              <ul className="divide-y divide-line">
                {lines.map(({ item, qty }) => (
                  <li key={item.id} className="flex items-center justify-between gap-2 py-2">
                    <span className="min-w-0 flex-1"><span className="block truncate font-medium">{item.name}</span><span className="text-sm text-muted">{kes(item.price)} each</span></span>
                    <span className="flex items-center gap-1">
                      <button aria-label={`Remove one ${item.name}`} onClick={() => setQty(item.id, qty - 1)} className="grid size-12 place-items-center rounded-xl border border-line"><Minus size={18} /></button>
                      <span className="w-8 text-center font-semibold">{qty}</span>
                      <button aria-label={`Add one ${item.name}`} disabled={qty >= item.stock} onClick={() => setQty(item.id, qty + 1)} className="grid size-12 place-items-center rounded-xl border border-line disabled:opacity-40"><Plus size={18} /></button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {lines.length > 0 && <>
              <div className="my-3 flex gap-2" role="group" aria-label="Payment method">
                {PAY.map((p) => <button key={p.id} aria-pressed={pay === p.id} onClick={() => setPay(p.id)} className={`min-h-12 flex-1 rounded-xl border font-semibold ${pay === p.id ? "border-pdark bg-soft text-pdark" : "border-line text-muted"}`}>{p.label}</button>)}
              </div>
              <p className="flex justify-between text-xl font-bold"><span>Total</span><span>{kes(total)}</span></p>
              {errors.length > 0 && <ul role="alert" className="mt-3 space-y-1 rounded-xl border border-bad p-3 text-sm text-bad">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
              <button disabled={busy} onClick={() => void complete()} className={`${btnPrimary} mt-3 w-full`}>{busy ? "Saving…" : "Complete sale"}</button>
              <button onClick={() => { setCart({}); setErrors([]); }} className={`${btnGhost} mt-2 w-full`}>Clear</button>
            </>}
          </Card>
        </div>
      )}

      {tab === "history" && (
        <Card>
          {sales.length === 0 ? <Empty title="No sales yet" hint="Once you record your first sale, it will appear here." /> : (
            <ul className="divide-y divide-line">
              {sales.map((s) => {
                const items = state.SI.filter((i) => i.saleId === s.id);
                return (
                  <li key={s.id} className="py-3">
                    <button onClick={() => setOpen(open === s.id ? null : s.id)} aria-expanded={open === s.id} className="flex min-h-12 w-full items-center justify-between gap-3 text-left">
                      <span><span className="block font-semibold">{s.receiptNo} {s.status === "cancelled" && <Badge tone="muted">Cancelled</Badge>}</span>
                        <span className="text-sm text-muted">{s.staff} · {when(s.ts)} · {items.length} {items.length === 1 ? "item" : "items"} · {s.payment === "mpesa" ? "M-Pesa" : "Cash"}</span></span>
                      <span className={`font-semibold ${s.status === "cancelled" ? "text-muted line-through" : ""}`}>{kes(s.total)}</span>
                    </button>
                    {open === s.id && (
                      <div className="mt-2 rounded-xl bg-bg p-3">
                        <ul className="text-sm">{items.map((i) => <li key={i.id} className="flex justify-between py-1"><span>{name.get(i.productId)} × {i.qty} @ {kes(i.unitPrice)}</span><span>{kes(i.qty * i.unitPrice)}</span></li>)}</ul>
                        {s.status === "completed" && (confirm === s.id
                          ? <div className="mt-2 flex gap-2"><button onClick={() => void cancelSale(s.id).then(() => setConfirm(null))} className={`${btnPrimary} flex-1`}>Yes, cancel and return stock</button><button onClick={() => setConfirm(null)} className={btnGhost}>Keep</button></div>
                          : <button onClick={() => setConfirm(s.id)} className={`${btnGhost} mt-2`}>Cancel sale</button>)}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
