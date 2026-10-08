import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { Check, Layers, LayoutDashboard, MoreHorizontal, Package, Receipt, Search, ShoppingCart, SlidersHorizontal, Users, type LucideIcon } from "lucide-react";
import { APP_NAME } from "../config";
import type { StockCtx } from "../lib/store";

const NAV: { to: string; label: string; icon: LucideIcon }[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard }, { to: "/sales", label: "Sales", icon: ShoppingCart },
  { to: "/products", label: "Products", icon: Package }, { to: "/inventory", label: "Inventory", icon: Layers },
  { to: "/purchases", label: "Purchases", icon: Receipt }, { to: "/customers", label: "Customers", icon: Users },
  { to: "/settings", label: "Settings", icon: SlidersHorizontal },
];
const link = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-12 items-center gap-3 rounded-xl px-3 font-medium ${isActive ? "bg-soft text-pdark" : "text-ink hover:bg-soft"}`;
const tab = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs font-medium ${isActive ? "text-pdark" : "text-muted"}`;

export default function AppShell({ stock }: { stock: StockCtx }) {
  const [more, setMore] = useState(false);
  const mode = stock.state?.mode;
  return (
    <div className="min-h-screen pt-[env(safe-area-inset-top)]">
      <aside className="fixed inset-y-0 left-0 hidden w-[250px] flex-col gap-1 border-r border-line bg-surface p-4 lg:flex">
        <div className="mb-2 flex items-center gap-2 px-3 py-3 text-xl font-extrabold"><span className="text-primary">✦</span>{APP_NAME.toUpperCase()}</div>
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === "/"} className={link}><Icon size={20} />{label}</NavLink>
        ))}
      </aside>
      <div className="pb-24 lg:ml-[250px] lg:pb-8">
        <header className="sticky top-[env(safe-area-inset-top)] z-10 flex items-center gap-3 border-b border-line bg-surface px-4 py-3 sm:px-6">
          <span className="font-extrabold lg:hidden"><span className="text-primary">✦</span> {APP_NAME}</span>
          <label className="hidden min-h-11 max-w-md flex-1 items-center gap-2 rounded-xl border border-line bg-bg px-3 text-muted sm:flex">
            <Search size={18} /><input aria-label="Search" placeholder="Search products, sales, customers…" className="flex-1 bg-transparent text-ink outline-none" />
          </label>
          <span className="ml-auto inline-flex items-center gap-1.5 text-xs font-semibold text-ok">
            <Check size={16} />{mode === "memory" ? "Memory only (storage blocked)" : "Saved on this phone"}
          </span>
          <span className="grid size-10 place-items-center rounded-full bg-soft font-bold text-pdark" aria-label="James">J</span>
        </header>
        <main className="mx-auto max-w-[1600px] p-4 sm:p-6 lg:p-8">
          <Outlet context={stock} />
          <p className="mt-8 text-xs text-muted">Demo data lives in this browser's IndexedDB.{" "}
            <button className="min-h-11 underline" onClick={() => void stock.resetDemo()}>Reset demo data</button></p>
        </main>
      </div>
      {more && (
        <div className="fixed inset-x-0 bottom-16 z-20 mx-3 rounded-2xl border border-line bg-surface p-2 shadow-lg lg:hidden">
          {NAV.slice(4).map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} onClick={() => setMore(false)} className={link}><Icon size={20} />{label}</NavLink>
          ))}
        </div>
      )}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
        {NAV.slice(0, 4).map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === "/"} className={tab}><Icon size={20} />{label}</NavLink>
        ))}
        <button onClick={() => setMore(!more)} className="flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs font-medium text-muted"><MoreHorizontal size={20} />More</button>
      </nav>
    </div>
  );
}
