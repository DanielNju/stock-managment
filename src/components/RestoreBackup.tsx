import { useRef, useState } from "react";
import { validateBackup, type BackupSummary } from "../lib/backup";
import type { StockCtx } from "../lib/store";
import { Errors, btnGhost, btnPrimary } from "./ui";

const MAX_BYTES = 40 * 1024 * 1024;
/** Choose a backup file, see what is in it, then confirm. Nothing changes until the user confirms. */
export default function RestoreBackup({
  ctx,
  hasData,
  onRestored,
}: {
  ctx: StockCtx;
  hasData: boolean;
  onRestored?: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [raw, setRaw] = useState<unknown>(null),
    [sum, setSum] = useState<BackupSummary | null>(null),
    [errors, setErrors] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState("");
  const reset = () => {
    setRaw(null);
    setSum(null);
    setErrors([]);
    if (input.current) input.current.value = "";
  };
  const choose = async (file: File | undefined) => {
    reset();
    setDone("");
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setErrors(["That file is too large to be a backup."]);
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      setErrors(["That file isn't a backup. It couldn't be read."]);
      return;
    }
    const v = validateBackup(parsed);
    if (!v.ok) {
      setErrors(v.errors);
      return;
    }
    setRaw(parsed);
    setSum(v.summary);
  };
  const confirm = async () => {
    setBusy(true);
    const r = await ctx.restoreBackup(raw);
    setBusy(false);
    if (!r.ok) {
      setErrors(r.errors);
      return;
    }
    reset();
    setDone(
      `Restored: ${r.value.products} products, ${r.value.sales} sales, ${r.value.customers} customers.`,
    );
    onRestored?.();
  };
  return (
    <div className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-sm font-medium">
          Backup file (.json)
        </span>
        <input
          ref={input}
          type="file"
          accept=".json,application/json"
          onChange={(e) => void choose(e.target.files?.[0])}
          aria-label="Choose a backup file"
          className="block w-full min-h-12 rounded-xl border border-line bg-surface p-2 text-sm"
        />
      </label>
      <Errors list={errors} />
      {done && (
        <p
          role="status"
          className="rounded-xl border border-ok p-3 font-medium text-ok"
        >
          {done}
        </p>
      )}
      {sum && (
        <div
          role="region"
          aria-label="Backup contents"
          className="space-y-2 rounded-xl bg-bg p-3"
        >
          <p className="font-semibold">
            {sum.business}
            {sum.demo ? " (demo data)" : ""}
          </p>
          <p className="text-sm text-muted">
            Made{" "}
            {sum.exportedAt
              ? new Date(sum.exportedAt).toLocaleString("en-KE", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })
              : "at an unknown time"}
            : {sum.products} products, {sum.sales} sales, {sum.customers}{" "}
            customers, {sum.suppliers} suppliers, {sum.staff} staff.
          </p>
          {hasData && (
            <p className="text-sm font-medium text-warn">
              This will replace everything currently on this device. Make a
              backup of it first if you may need it.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              disabled={busy}
              onClick={() => void confirm()}
              className={btnPrimary}
            >
              {busy
                ? "Restoring…"
                : hasData
                  ? "Replace everything with this backup"
                  : "Restore this backup"}
            </button>
            <button onClick={reset} className={btnGhost}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
