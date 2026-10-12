import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { AlertTriangle, Check, HardDrive } from "lucide-react";
import { staffInUse } from "../lib/people";
import { deviceStaffName, type StockCtx } from "../lib/store";
import { Badge, Card, Errors, btnGhost, btnPrimary, fieldCls } from "../components/ui";

export default function Settings() {
  const { state, updateBusiness, createStaff, setStaffArchived, deleteStaff, setDeviceStaff, resetDemo } = useOutletContext<StockCtx>();
  const [biz, setBiz] = useState<{ name: string; phone: string; location: string } | null>(null);
  const [saved, setSaved] = useState(false), [bizErr, setBizErr] = useState<string[]>([]);
  const [newName, setNewName] = useState(""), [staffErr, setStaffErr] = useState<string[]>([]);
  const [persisted, setPersisted] = useState<boolean | null>(null), [confirm, setConfirm] = useState(false);
  useEffect(() => { void navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null)); }, []);
  useEffect(() => { if (state && !biz) setBiz({ name: state.business.name, phone: state.business.phone ?? "", location: state.business.location ?? "" }); }, [state, biz]);
  if (!state || !biz) return <p className="text-muted">Loading settings…</p>;
  const memory = state.mode === "memory", me = deviceStaffName(state);
  const staff = [...state.STAFF].sort((a, b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name));
  const run = async (r: Promise<{ ok: boolean; errors?: string[] }>, fail: (e: string[]) => void, ok?: () => void) => { const x = await r; if (!x.ok) fail(x.errors ?? []); else { fail([]); ok?.(); } };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold sm:text-3xl">Settings</h1>

      <Card className="space-y-3">
        <h2 className="text-lg font-semibold">Your business</h2>
        <Errors list={bizErr} />
        <label className="block"><span className="mb-1 block text-sm font-medium">Business name</span><input className={fieldCls} value={biz.name} onChange={(e) => { setBiz({ ...biz, name: e.target.value }); setSaved(false); }} /></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><span className="mb-1 block text-sm font-medium">Phone (optional)</span><input className={fieldCls} inputMode="tel" value={biz.phone} onChange={(e) => { setBiz({ ...biz, phone: e.target.value }); setSaved(false); }} /></label>
          <label className="block"><span className="mb-1 block text-sm font-medium">Location (optional)</span><input className={fieldCls} value={biz.location} onChange={(e) => { setBiz({ ...biz, location: e.target.value }); setSaved(false); }} /></label>
        </div>
        <div className="flex items-center gap-3"><button onClick={() => void run(updateBusiness(biz), setBizErr, () => setSaved(true))} className={btnPrimary}>Save business details</button>
          {saved && <span role="status" className="flex items-center gap-1 text-sm font-medium text-ok"><Check size={16} />Saved</span>}</div>
        <p className="text-sm text-muted">Currency is Kenya shillings (KES).</p>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-lg font-semibold">Staff</h2>
        <p className="text-sm text-muted">Sales, deliveries and stock counts on this device are recorded under <b className="text-ink">{me}</b>. Pick who is using it. There are no passwords yet, so anyone using the app can switch.</p>
        <Errors list={staffErr} />
        <ul className="divide-y divide-line">
          {staff.map((p) => {
            const isMe = p.id === state.deviceStaffId, used = staffInUse(p.name, { M: state.M, S: state.S, C: state.C, receiptStaff: state.RC.map((r) => r.staff) });
            return (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <span className="flex items-center gap-2"><span className="grid size-10 place-items-center rounded-full bg-soft font-bold text-pdark" aria-hidden>{p.name[0]}</span>
                  <span className="font-medium">{p.name}</span>{isMe && <Badge tone="ok"><Check size={14} />This device</Badge>}{p.archived && <Badge tone="muted">Archived</Badge>}</span>
                <span className="flex flex-wrap gap-2">
                  {!isMe && !p.archived && <button onClick={() => void run(setDeviceStaff(p.id), setStaffErr)} className={btnGhost}>Use this device as {p.name}</button>}
                  <button onClick={() => void run(setStaffArchived(p.id, !p.archived), setStaffErr)} className={btnGhost}>{p.archived ? "Restore" : "Archive"}</button>
                  {!used && !isMe && <button onClick={() => void run(deleteStaff(p.id), setStaffErr)} className={btnGhost}>Delete</button>}
                </span>
              </li>);
          })}
        </ul>
        <div className="flex flex-wrap gap-2">
          <input className={`${fieldCls} flex-1`} placeholder="Add a person, e.g. Wanjiku" aria-label="New staff name" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <button onClick={() => void run(createStaff(newName), setStaffErr, () => setNewName(""))} className={btnPrimary}>Add person</button>
        </div>
        <p className="text-sm text-muted">Names can't be changed, because past records keep the name they were made under. Archive someone who leaves.</p>
      </Card>

      <Card className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">{memory ? <AlertTriangle size={20} className="text-bad" /> : <HardDrive size={20} className="text-muted" />}Where your data is</h2>
        {memory
          ? <p className="font-medium text-bad">This browser is blocking storage, so nothing you enter is being kept. It will be gone when you close or reload the page. Try another browser, or leave private browsing.</p>
          : <p className="font-medium">Everything you enter is saved on this device only.</p>}
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>It is <b>not synced</b> to a server and <b>not backed up</b>. There is no online copy.</li>
          <li>Other phones and computers <b>can't see it</b>. Each device has its own separate data.</li>
          <li>It works without internet. Sales, deliveries and counts save normally while you are offline.</li>
          <li>Clearing this site's data, clearing the browser's history and storage, or uninstalling the app <b>erases it for good</b>.</li>
          <li>Storage protection from automatic clearing: <b>{persisted === null ? "unknown on this browser" : persisted ? "on" : "off (the browser may clear it if the phone runs low on space)"}</b>.</li>
        </ul>
        <p className="text-sm text-muted">This is a demo version for trying the workflow. There is no sign-in, no backup and no sync yet, so please don't enter real business records.</p>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-lg font-semibold">Reset demo data</h2>
        <p className="text-sm text-muted">Deletes everything on this device, including anything you added, and loads fresh demo data. This can't be undone.</p>
        {confirm
          ? <div className="flex flex-wrap gap-2"><button onClick={() => void resetDemo().then(() => { setConfirm(false); setBiz(null); })} className={btnPrimary}>Yes, delete everything on this device</button><button onClick={() => setConfirm(false)} className={btnGhost}>Keep my data</button></div>
          : <button onClick={() => setConfirm(true)} className={btnGhost}>Reset demo data</button>}
      </Card>
    </div>
  );
}
