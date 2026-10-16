import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { APP_NAME } from "../config";
import RestoreBackup from "../components/RestoreBackup";
import type { StockCtx } from "../lib/store";
import { Card, Errors, btnGhost, btnPrimary, fieldCls } from "../components/ui";

/** First run on a new install: starts empty. No demo data unless the user asks for it. */
export default function Setup({ stock }: { stock: StockCtx }) {
  const nav = useNavigate(), home = () => nav("/", { replace: true }); // always land on the dashboard, whatever address we were on
  const [shop, setShop] = useState(""), [you, setYou] = useState(""), [errors, setErrors] = useState<string[]>([]), [busy, setBusy] = useState(false), [restoring, setRestoring] = useState(false);
  const start = async () => { setBusy(true); const r = await stock.completeSetup(shop, you); setBusy(false); if (!r.ok) setErrors(r.errors); else home(); };
  return (
    <main className="mx-auto min-h-screen max-w-lg space-y-4 px-4 py-8 pt-[max(2rem,env(safe-area-inset-top))]">
      <p className="text-xl font-extrabold"><span className="text-primary">✦</span> {APP_NAME}</p>
      <div><h1 className="text-3xl font-bold">Set up your shop</h1><p className="mt-1 text-muted">Know what you have, what is selling, and what needs your attention. It takes less than a minute.</p></div>
      <Card className="space-y-4">
        <Errors list={errors} />
        <label className="block"><span className="mb-1 block text-sm font-medium">Shop name</span><input className={fieldCls} value={shop} onChange={(e) => setShop(e.target.value)} placeholder="e.g. Mama Njeri's Duka" autoFocus autoComplete="off" /></label>
        <label className="block"><span className="mb-1 block text-sm font-medium">Your name</span><input className={fieldCls} value={you} onChange={(e) => setYou(e.target.value)} placeholder="e.g. Njeri" autoComplete="off" />
          <span className="mt-1 block text-xs text-muted">Sales and stock changes made on this phone are recorded under this name. You can add your staff later.</span></label>
        <button disabled={busy} onClick={() => void start()} className={`${btnPrimary} w-full`}>{busy ? "Setting up…" : "Start"}</button>
      </Card>
      <Card className="space-y-2 text-sm">
        <p><b>Your data stays on this phone.</b> There is no account, and nothing is sent anywhere. That also means it is not backed up automatically, so use <b>Back up</b> in Settings regularly.</p>
        <p><a href="/privacy.html" className="font-semibold text-pdark underline">Privacy policy</a></p>
      </Card>
      <Card className="space-y-3">
        <h2 className="text-lg font-semibold">Already have a backup file?</h2>
        {restoring ? <RestoreBackup ctx={stock} hasData={false} onRestored={home} /> : <button onClick={() => setRestoring(true)} className={btnGhost}>Restore from a backup</button>}
      </Card>
      <Card className="space-y-2">
        <h2 className="text-lg font-semibold">Just looking?</h2>
        <p className="text-sm text-muted">Try the app with made-up shop data. You can erase it any time in Settings.</p>
        <button onClick={() => void stock.loadDemo().then(home)} className={btnGhost}>Load demo data</button>
      </Card>
    </main>
  );
}
