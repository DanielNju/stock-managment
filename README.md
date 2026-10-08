# Stockly

Offline-first stock management for small shops. It does not just record stock. It tells the owner what needs attention.

> **Stockly is a temporary name.** Change `APP_NAME` in `src/config.ts` to rename it.
> **Status:** v0.4.0, early development. Dashboard, Sales, Inventory (stock count), Products and Purchases (with Suppliers) are built. Data is demo data stored in your browser.

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
| Products: list, search and filters, add, edit, details, archive, delete (only with no history) | Built and tested |
| Categories: create, rename, delete (blocked while products use them) | Built and tested |
| Product validation: required name and SKU, unique SKU and barcode, no negative prices or minimums, whole-number rules | Built and tested |
| Sale records with prices frozen at sale time, stock validation, duplicate protection | Built and tested |
| Atomic writes (a sale saves completely or not at all) and an audit log (stored, no screen yet) | Built and tested |
| Local data (IndexedDB via Dexie), upgrade from the v0.1 demo database | Built and tested |
| Installable PWA with service worker | Configured (production build only) |
| Suppliers: add, edit, archive, delete (only with no purchases), purchase history and totals | Built and tested |
| Purchases: draft, ordered, partial and full receiving, cancel, list with search and filters | Built and tested |
| Receiving: partial deliveries, no over-receiving, retry-proof, all-or-nothing | Built and tested |
| Customers, Settings | Placeholders |
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
- **Products never store stock.** The number on a product page comes from its movements. Opening stock entered when adding a product becomes an `opening` movement.
- Editing a product changes the product only. Sales keep the price they were made at, and price or cost changes are written to the audit log with the old and new values.
- A product with any stock or sales history can be **archived** but not deleted. Archived products can't be sold and don't raise alerts.
- **Creating a purchase never changes stock. Receiving does.** A delivery saves its receipt, received quantities, one stock movement per line and an audit entry together or not at all. Each purchase line keeps the cost it was ordered at.
- "Partially received" and "Received" are worked out from the receipts, not stored, so they can't drift out of step with the stock.
- You can't receive more than is outstanding, and a delivery's ID is reused on retry, so tapping twice (or a lost connection) can't add the stock twice.
- A purchase with any received stock can't be cancelled. Stock never disappears silently.
- Suppliers with purchase history can be archived but not deleted. Archived suppliers still show on old purchases.
- Product IDs are UUIDs, so two phones can add products offline without clashing.
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
│   ├── Products.tsx     Product list, filters, categories
│   ├── ProductForm.tsx  Add and edit product
│   ├── ProductDetail.tsx Stock, value, movements, sales, archive/delete
│   ├── Purchases.tsx    Purchase list and suppliers tab
│   ├── PurchaseForm.tsx Create or edit a draft purchase
│   ├── PurchaseDetail.tsx Lines, receive stock, deliveries, cancel
│   ├── SupplierForm.tsx
│   ├── SupplierDetail.tsx
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
- Quantities are whole numbers only, so the unit list is whole units (piece, pack, bottle, carton, bag, box, dozen). Weighed units such as kg and litres need decimal quantities and are not offered yet.
- Receipt numbers count up on one device. With several devices they could collide, so the server will need to assign them.
- Any signed-in-looking user can cancel a sale or adjust stock. Roles and permissions come with authentication.
- Credit sales are not available until Customers is built.
- Upgrading from an earlier version clears the browser's demo data and reloads fresh demo data (v0.3 changed product IDs). Once real data exists, upgrades will need proper migrations.
- Products have no images, variants or multiple suppliers yet.
- Receiving does not change a product's cost price. Whether to use the latest cost or an average is still to be decided.
- A partly delivered purchase can't be closed short or cancelled yet, and returning stock to a supplier isn't built. Both need their own steps so stock never vanishes silently.
- No supplier balances, payments or accounts payable (kept out on purpose until research shows they matter).
- Only a draft purchase can be edited. An ordered purchase's lines are locked.
- The PWA icons are placeholders. Replace them in `public/` before launch.
- The active sidebar item and avatar initials are slightly under the 4.5:1 contrast minimum. See DESIGN.md for the one-line fix.
- The bundle is about 680 KB (203 KB gzipped). Split by route as screens are added.
- No authentication, roles or multi-business isolation yet. Do not store real business data in this version.

## Roadmap

1. ~~Sales screen~~ and ~~stock count~~ (done)
2. ~~Products~~ and ~~Purchases with suppliers~~ (done)
3. Customers and credit sales; close-short and supplier returns
4. Working search, and an audit log screen
5. Database design and offline sync rules
6. Backend API, PostgreSQL, authentication, roles and per-business data isolation
7. Interviews with shop owners to confirm priorities. **Research decides what stays in V1.**

## License

Not yet chosen.
