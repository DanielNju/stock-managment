# Stockly

Offline-first stock management for small shops. It does not just record stock. It tells the owner what needs attention.

> **Stockly is a temporary name.** Change `APP_NAME` in `src/config.ts` to rename it.
> **Status:** v0.2.0, early development. Dashboard, Sales and Inventory (stock count) are built. Data is demo data stored in your browser.

---

## What it does

The app answers three questions:

1. **What do I have?** Current stock and stock value.
2. **What am I losing?** Stock that does not match a count, and damaged or missing stock.
3. **What needs my attention?** Low and out-of-stock products, discrepancies, and slow-moving stock.

Every stock change is recorded as a **movement** (a sale, a purchase, an adjustment, damage or a count) with the person who made it. Stock is never typed in directly. It is calculated from the movements, so you can always see where it went.

## Current status

| Area | State |
|---|---|
| Dashboard (counters, sales chart, Needs attention, Recent activity) | Built, runs on real sales and counts |
| Sales: cart, cash or M-Pesa (recorded manually), receipt, history, cancel with stock returned | Built |
| Inventory: stock list and **stock count** with reasons | Built |
| Sale records with prices frozen at sale time, stock validation, duplicate protection | Built and tested |
| Atomic writes (a sale saves completely or not at all) and an audit log (stored, no screen yet) | Built and tested |
| Local data (IndexedDB via Dexie), upgrade from the v0.1 demo database | Built and tested |
| Installable PWA with service worker | Configured (production build only) |
| Products, Purchases, Customers, Settings | Placeholders |
| Sign-in and roles, business isolation, sync, backend API | Not started |

## Quick start

Requires **Node.js 20 or newer**.

```bash
npm install
npm run dev        # development server
```

| Command | Purpose |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Type-check, then produce a production build in `dist/` |
| `npm test` | Run the engine and storage tests |
| `npm run preview` | Serve the production build. **Use this to test install and offline**, because the service worker is only generated in the production build |

The app seeds demo data into your browser on first load. The **New sale (demo)** button adds a real sale movement, and **Reset demo data** at the bottom of the page restores the starting data.

## Tech stack

- React 18, TypeScript, Vite
- Tailwind CSS v4 (design tokens mapped into the theme)
- React Router
- Dexie (IndexedDB) for local storage
- vite-plugin-pwa for the service worker and manifest
- Lucide icons, Recharts

## How it works

```text
Sale ──► Sale items (price and cost frozen at sale time)
  │
  └──► Stock movements ──► Inventory calculation ──► Dashboard
Stock count ──► Count record + movement for the difference
Every action ──► Audit entry
```

- A sale is **validated** (whole quantities above zero, no overselling) and saved with its items, movements and audit entry in **one transaction**, so it saves completely or not at all.
- Prices are copied onto each sale item. Changing a product price later does not change past sales.
- Cancelling a sale does not delete it. It marks the sale cancelled and adds `return` movements that put the stock back.
- A stock count compares the shelf with the system and records the difference with a reason.
- Every record carries a `businessId` (a placeholder for now), ready for multi-business isolation.

- `src/lib/engine.ts` is **pure logic**: no UI, no storage. It is designed to run unchanged once a backend exists.
- `src/lib/store.ts` loads and saves data. If IndexedDB is blocked, it falls back to memory and the header says so.
- Business logic stays out of components. Any number shown on screen is computed in the engine.

### Planned path

```text
Today:   IndexedDB  →  engine  →  UI
Later:   IndexedDB  →  sync queue  →  API  →  PostgreSQL
                     same engine, same UI
```

Because stock is a list of movements, syncing is mostly a matter of merging movement lists. Rules for conflicts, negative stock and duplicate delivery still need to be written (see the offline architecture doc when it exists).

## Project structure

```text
src/
├── config.ts            Product name
├── index.css            Design tokens and Tailwind theme
├── App.tsx              Routes
├── main.tsx
├── components/
│   ├── AppShell.tsx     Sidebar, header, bottom navigation
│   └── ui.tsx           Card, Badge, buttons, empty state
├── pages/
│   ├── Dashboard.tsx
│   ├── Sales.tsx        New sale, receipt, history, cancel
│   ├── Inventory.tsx    Stock list and stock count
│   └── Placeholder.tsx  Stand-in for unbuilt screens
└── lib/
    ├── engine.ts        Sales, counts, validation, dashboard (pure)
    ├── store.ts         Dexie database, atomic writes, data hook
    ├── seed.ts          Demo data
    ├── format.ts        Money and time formatting
    └── *.test.ts        Engine and storage tests
public/                  Icons
vite.config.ts           Vite, Tailwind and PWA setup
```

## Navigation (V1)

Dashboard · Sales · Products · Inventory · Purchases · Customers · Settings

Suppliers are managed inside Purchases. Reports are deferred. Alerts appear in Dashboard → Needs attention.

## Design

See **[DESIGN.md](./DESIGN.md)** for the design system: tokens, contrast figures, layout, component rules and known issues.

The dashboard borrows layout patterns from the Innap admin template. This project contains none of Innap's code, CSS or assets. Do not copy them in unless you hold the right license (an Extended License is needed for a product you charge for).

## Known limitations

- Data is demo data. Staff are fixed placeholders (`CURRENT_STAFF` in `src/config.ts`) until sign-in exists, so "who did it" is not yet trustworthy.
- Quantities are whole numbers only. Decimal units (kg, litres) need a unit on the product.
- Receipt numbers count up on one device. With several devices they could collide, so the server will need to assign them.
- Any signed-in-looking user can cancel a sale or adjust stock. Roles and permissions come with authentication.
- Credit sales are not available until Customers is built.
- The v0.1 demo database is cleared when upgrading, because it held demo data only.
- The PWA icons are placeholders. Replace them in `public/` before launch.
- The active sidebar item and avatar initials are slightly under the 4.5:1 contrast minimum. See DESIGN.md for the one-line fix.
- The bundle is about 680 KB (203 KB gzipped). Split by route as screens are added.
- No authentication, roles or multi-business isolation yet. Do not store real business data in this version.

## Roadmap

1. ~~Sales screen~~ and ~~stock count~~ (done)
2. Products (create, edit, archive) and Purchases (receive stock)
3. Customers and credit sales
4. Working search, and an audit log screen
5. Database design and offline sync rules
6. Backend API, PostgreSQL, authentication, roles and per-business data isolation
7. Interviews with shop owners to confirm priorities. **Research decides what stays in V1.**

## License

Not yet chosen.
