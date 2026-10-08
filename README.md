# Stockly

Offline-first stock management for small shops. It does not just record stock. It tells the owner what needs attention.

> **Stockly is a temporary name.** Change `APP_NAME` in `src/config.ts` to rename it.
> **Status:** v0.1.0, early development. Only the Dashboard is built.

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
| Dashboard (counters, sales chart, Needs attention, Recent activity) | Built |
| App shell (sidebar on desktop, bottom nav on phones) | Built |
| Local data (IndexedDB via Dexie) with demo data | Built |
| Installable PWA with service worker | Configured (production build only) |
| Sales, Products, Inventory, Purchases, Customers, Settings | Placeholders |
| Stock count flow, sync, backend API, authentication | Not started |

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
Stock movements  (stored in IndexedDB)
      ↓
Inventory calculation        src/lib/engine.ts
      ↓
Dashboard metrics
      ↓
Needs attention  +  Recent activity
```

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
│   └── AppShell.tsx     Sidebar, header, bottom navigation
├── pages/
│   ├── Dashboard.tsx
│   └── Placeholder.tsx  Stand-in for unbuilt screens
└── lib/
    ├── engine.ts        Inventory and dashboard calculations (pure)
    ├── store.ts         Dexie database and data hook
    └── seed.ts          Demo data
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

- Only the Dashboard exists, and its data is demo data.
- The PWA icons are placeholders. Replace them in `public/` before launch.
- The active sidebar item and avatar initials are slightly under the 4.5:1 contrast minimum. See DESIGN.md for the one-line fix.
- The bundle is about 680 KB (203 KB gzipped). Split by route as screens are added.
- No authentication, roles or multi-business isolation yet. Do not store real business data in this version.

## Roadmap

1. Sales screen (phone-first), which creates sale movements
2. Stock count flow, which makes "Stock issues" real
3. Products and Purchases (receive stock)
4. Database design and offline sync rules
5. Backend API, PostgreSQL, authentication and per-business data isolation
6. Interviews with shop owners to confirm priorities. **Research decides what stays in V1.**

## License

Not yet chosen.
