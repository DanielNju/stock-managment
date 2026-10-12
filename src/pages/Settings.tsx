import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { AlertTriangle, HardDrive } from "lucide-react";
import type { StockCtx } from "../lib/store";
import { Card, btnGhost, btnPrimary } from "../components/ui";

export default function Settings() {
  const { state, resetDemo } = useOutletContext<StockCtx>();
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    void navigator.storage
      ?.persisted?.()
      .then(setPersisted)
      .catch(() => setPersisted(null));
  }, []);
  const memory = state?.mode === "memory";

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold sm:text-3xl">Settings</h1>
      <Card className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          {memory ? (
            <AlertTriangle size={20} className="text-bad" />
          ) : (
            <HardDrive size={20} className="text-muted" />
          )}
          Where your data is
        </h2>
        {memory ? (
          <p className="font-medium text-bad">
            This browser is blocking storage, so nothing you enter is being
            kept. It will be gone when you close or reload the page. Try another
            browser, or leave private browsing.
          </p>
        ) : (
          <p className="font-medium">
            Everything you enter is saved on this device only.
          </p>
        )}
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>
            It is <b>not synced</b> to a server and <b>not backed up</b>. There
            is no online copy.
          </li>
          <li>
            Other phones and computers <b>can't see it</b>. Each device has its
            own separate data.
          </li>
          <li>
            It works without internet. Sales, deliveries and counts save
            normally while you are offline.
          </li>
          <li>
            Clearing this site's data, clearing the browser's history and
            storage, or uninstalling the app <b>erases it for good</b>.
          </li>
          <li>
            Storage protection from automatic clearing:{" "}
            <b>
              {persisted === null
                ? "unknown on this browser"
                : persisted
                  ? "on"
                  : "off (the browser may clear it if the phone runs low on space)"}
            </b>
            .
          </li>
        </ul>
        <p className="text-sm text-muted">
          This is a demo version for trying the workflow. There is no sign-in,
          no backup and no sync yet, so please don't enter real business
          records.
        </p>
      </Card>
      <Card className="space-y-3">
        <h2 className="text-lg font-semibold">Reset demo data</h2>
        <p className="text-sm text-muted">
          Deletes everything on this device, including anything you added, and
          loads fresh demo data. This can't be undone.
        </p>
        {confirm ? (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => void resetDemo().then(() => setConfirm(false))}
              className={btnPrimary}
            >
              Yes, delete everything on this device
            </button>
            <button onClick={() => setConfirm(false)} className={btnGhost}>
              Keep my data
            </button>
          </div>
        ) : (
          <button onClick={() => setConfirm(true)} className={btnGhost}>
            Reset demo data
          </button>
        )}
      </Card>
    </div>
  );
}
