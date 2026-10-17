import { useState } from "react";
import {
  Link,
  useNavigate,
  useOutletContext,
  useParams,
} from "react-router-dom";
import { validateCustomer } from "../lib/people";
import type { StockCtx } from "../lib/store";
import {
  Card,
  Empty,
  Errors,
  btnGhost,
  btnPrimary,
  fieldCls,
} from "../components/ui";

const Field = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <label className="block">
    <span className="mb-1 block text-sm font-medium">{label}</span>
    {children}
  </label>
);

export default function CustomerForm({ mode }: { mode: "new" | "edit" }) {
  const { state, createCustomer, updateCustomer } =
    useOutletContext<StockCtx>();
  const { id } = useParams();
  const nav = useNavigate();
  const existing =
    mode === "edit" ? state?.CUS.find((c) => c.id === id) : undefined;
  const [f, setF] = useState({
    name: existing?.name ?? "",
    phone: existing?.phone ?? "",
    email: existing?.email ?? "",
    location: existing?.location ?? "",
    notes: existing?.notes ?? "",
  });
  const [errors, setErrors] = useState<string[]>([]);
  if (!state) return <p className="text-muted">Loading…</p>;
  if (mode === "edit" && !existing)
    return (
      <Card>
        <Empty title="Customer not found" hint="They may have been deleted." />
        <Link to="/customers" className={btnGhost}>
          Back to customers
        </Link>
      </Card>
    );
  const set =
    (k: keyof typeof f) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setF((x) => ({ ...x, [k]: e.target.value }));
  const warnings = validateCustomer(f, state.CUS, existing?.id).warnings;
  const save = async () => {
    const r =
      mode === "new"
        ? await createCustomer(f)
        : await updateCustomer(existing!.id, f);
    if (!r.ok) {
      setErrors(r.errors);
      window.scrollTo({ top: 0 });
      return;
    }
    nav(`/customers/${r.value.customer.id}`);
  };
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold sm:text-3xl">
        {mode === "new" ? "Add customer" : `Edit ${existing!.name}`}
      </h1>
      <Errors list={errors} />
      <Card className="space-y-4">
        <Field label="Name">
          <input
            className={fieldCls}
            value={f.name}
            onChange={set("name")}
            autoFocus
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone (optional)">
            <input
              className={fieldCls}
              value={f.phone}
              onChange={set("phone")}
              inputMode="tel"
              placeholder="0712 345 678"
            />
          </Field>
          <Field label="Email (optional)">
            <input
              className={fieldCls}
              value={f.email}
              onChange={set("email")}
              inputMode="email"
            />
          </Field>
        </div>
        <Field label="Location (optional)">
          <input
            className={fieldCls}
            value={f.location}
            onChange={set("location")}
          />
        </Field>
        <Field label="Notes (optional)">
          <textarea
            className={`${fieldCls} min-h-24 py-2`}
            value={f.notes}
            onChange={set("notes")}
          />
        </Field>
        {warnings.map((w) => (
          <p
            key={w}
            role="status"
            className="rounded-xl border border-warn p-3 text-sm text-warn"
          >
            {w}
          </p>
        ))}
      </Card>
      <div className="flex gap-2">
        <button onClick={() => void save()} className={btnPrimary}>
          {mode === "new" ? "Save customer" : "Save changes"}
        </button>
        <Link
          to={existing ? `/customers/${existing.id}` : "/customers"}
          className={btnGhost}
        >
          Cancel
        </Link>
      </div>
    </div>
  );
}
