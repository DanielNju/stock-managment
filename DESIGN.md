# Stockly: Design README

How the interface is designed, why, and how to change it safely.
Describes what is **implemented in the code today** (`src/index.css`, `src/components/AppShell.tsx`, `src/pages/Dashboard.tsx`). Open items are listed at the end.

The product name is a placeholder: change `APP_NAME` in `src/config.ts`.

---

## 1. Design goal

Every screen should help the owner answer three questions:

1. **What do I have?**
2. **What am I losing?**
3. **What needs my attention?**

The dashboard is a decision surface, not a report. Show what needs action first, then the supporting numbers.

### Principles

| Principle | In practice |
|---|---|
| Phone first | Design the sale, receive-stock and count screens at phone size first, then widen for desktop. |
| Attention over statistics | "Low stock: 12" becomes a list of which products, how few are left, and what to review. |
| Explainable stock | Every change has a reason and a person. The UI never shows an unexplained number. |
| Plain business language | Users see "Damaged", "Expired", "Missing", not `DAMAGE` or `StockAdjustmentType`. |
| Calm brand | White is the workspace, pink is identity and interaction. Never flood a screen with pink. |
| Trust under bad connectivity | The user can always see that their work is saved on the device. |

---

## 2. Design tokens

All colors live in **one place**: the `:root` block of `src/index.css`. They are mapped into the Tailwind theme (`@theme inline`), so components use names like `bg-soft` and `text-pdark`, never hex values.

| Token | Tailwind class | Light | Dark | Use |
|---|---|---|---|---|
| `--primary` | `primary` | `#E83E8C` | same | Fills, icons, charts, focus ring. **Not for small text.** |
| `--primary-dark` | `pdark` | `#C72C72` | `#F472B6` | Text, links, active nav, button fills |
| `--primary-soft` | `soft` | `#FCE7F3` | `#3A1A2B` | Active nav background, avatars, hover |
| `--bg` | `bg` | `#FAFAFA` | `#0F1115` | Page background |
| `--surface` | `surface` | `#FFFFFF` | `#181B21` | Cards, header, sidebar |
| `--text` | `ink` | `#1F2937` | `#F3F4F6` | Body text |
| `--muted` | `muted` | `#6B7280` | `#9CA3AF` | Secondary text, labels |
| `--border` | `line` | `#E5E7EB` | `#2A2F38` | Borders, dividers |
| `--success` | `ok` | `#15803D` | `#4ADE80` | Healthy, saved |
| `--warning` | `warn` | `#B45309` | `#FBBF24` | Needs a check |
| `--danger` | `bad` | `#DC2626` | `#F87171` | Urgent, low, out |

**Rule:** to change the brand pink, edit the three `--primary*` variables. If you find a hex value in a component, that is a bug.

Dark mode follows the device (`prefers-color-scheme`). There is no manual toggle yet.

### Contrast (WCAG 2.1, measured)

Normal text needs **4.5:1**, large text and UI components **3:1**.

| Pair | Ratio | Verdict |
|---|---:|---|
| Body text on background | 14.06 | Pass |
| Muted text on white / on background | 4.83 / 4.63 | Pass |
| White on `#C72C72` (button) | 5.21 | Pass |
| `#C72C72` text on white | 5.21 | Pass |
| White on `#E83E8C` | 3.82 | **Fails for text.** Fills and icons only |
| `#E83E8C` text on white | 3.82 | **Fails for text** |
| **`#C72C72` on `#FCE7F3` (active nav, avatars)** | **4.43** | **Fails by a hair** (see Known issues) |
| Success / warning / danger on white | 5.02 / 5.02 / 4.83 | Pass |
| Dark mode: pink, muted, status colors on surface | 6.2 to 10.3 | Pass |

---

## 3. Typography

- **Font:** system UI stack (`system-ui, -apple-system, "Segoe UI", Roboto`). No font download, so it is fast on mobile data and renders well on cheap Android phones.
- A self-hosted Inter subset can replace it later, but only if it is small and has a system fallback.

| Role | Size / weight |
|---|---|
| Page title | `text-2xl` (`sm:text-3xl`), bold |
| Section title | `text-lg`, semibold |
| Counter value | `text-2xl`, bold |
| Body | base |
| Meta and labels | `text-xs` to `text-sm`, muted |

Keep sentence case. No all-caps labels except the product wordmark.

---

## 4. Layout and navigation

### V1 navigation (locked)

`Dashboard · Sales · Products · Inventory · Purchases · Customers · Settings`

- Suppliers live inside **Purchases**.
- Reports are deferred.
- Alerts are shown through **Dashboard → Needs attention**, not a separate screen.

### Desktop (≥ 1024px)

- Fixed white sidebar, **250px** wide, product wordmark on top.
- Active item: `bg-soft` + `text-pdark`.
- Sticky header: search, save-status indicator, user avatar.
- Content is capped at `max-w-[1600px]` and centered.

### Phone (< 1024px)

- Header shows the wordmark instead of the sidebar.
- **Bottom navigation:** 4 primary items (Dashboard, Sales, Products, Inventory) plus **More** (Purchases, Customers, Settings).
- Bottom bar respects the iPhone/Android safe area (`env(safe-area-inset-bottom)`).

### Touch targets

Every tappable control is **at least 48px** tall (`min-h-12`). Bottom-nav tabs are 64px (`min-h-16`).

---

## 5. Dashboard anatomy

```text
Greeting + "New sale" button
┌────────────┬────────────┬────────────┬────────────┐
│ Today's    │ Stock      │ Low stock  │ Stock      │   2 columns on phone,
│ sales      │ value      │            │ issues     │   4 on wide screens
└────────────┴────────────┴────────────┴────────────┘
┌───────────────────────────────┬────────────────────┐
│ Sales overview (7 days)       │ Needs attention    │   stacked on phone
└───────────────────────────────┴────────────────────┘
┌────────────────────────────────────────────────────┐
│ Recent activity: who did what, to which product    │
└────────────────────────────────────────────────────┘
```

- **Counters** show one number, one label, one line of context. Low stock and Stock issues are tappable and lead to Inventory.
- **Sales overview** is a single pink area chart with a text alternative (`aria-label`) for screen readers.
- **Needs attention** lists real products with reasons, not totals only.
- **Recent activity** is the accountability feature: every row shows the staff member, the action, the product, the quantity and the time.

### Recent activity row

```text
(J)  James  Sold
     Coca-Cola 500ml × 3                      10:42 AM
```

| Movement | Action label | Quantity shown |
|---|---|---|
| sale | Sold | `× 3` |
| purchase | Received stock | `× 50` |
| adjustment | Adjusted stock | `−2` |
| damage | Reported damage | `−1` |
| count | Counted stock | `−6` |

Times: today shows the clock time, yesterday shows "Yesterday", older shows the date.

---

## 6. Status language

**Color is never the only signal.** Every status has an icon and a word.

| Status | Word | Color token | Meaning |
|---|---|---|---|
| Out of stock / below minimum | **Out** / **Low** | `bad` | Reorder now |
| Count does not match | **Check** | `warn` | Investigate a discrepancy |
| No sale for 30+ days | **Slow** | `muted` | Capital tied up |
| Healthy | (none) | `ok` | Nothing to show |

A discrepancy is always **Check** (amber), never orange or red. Keep the status set this small.

---

## 7. Component rules

| Component | Rule |
|---|---|
| Primary button | `bg-pdark` with white text, `rounded-xl`, 48px tall. Never white text on the bright pink. |
| Card | `rounded-2xl`, 1px `line` border, `surface` background. Use cards for summaries, not for every list. |
| Badge | Outlined pill, icon plus word, colored by status. |
| Avatar | Initial on `bg-soft`. |
| Links / text actions | `text-pdark`. |
| Focus | 2px `primary` outline on every focusable element. |
| Empty state | Say what the area is for and give the action. Example: "All clear. Nothing needs your attention right now." |
| Errors | Plain language, say what to do. Never show raw error text. |
| Motion | Only in response to an action. No decorative entrance animations. |

---

## 8. Offline and trust

- The header always shows storage state: **"Saved on this phone"** (IndexedDB working) or **"Memory only (storage blocked)"**.
- The UI updates immediately from local data. Network is never needed to record a sale.
- When sync is added, the indicator gains two more states: **Syncing** and **Waiting for connection (N changes saved)**.

---

## 9. Copy rules

- Name things the way a shopkeeper would: *Received stock*, *Counted stock*, *Reported damage*.
- Adjustment reasons shown to users: **Damaged, Expired, Missing, Returned, Counting correction, Other**. The code stores its own technical values.
- A button says exactly what happens: "New sale", not "Submit".
- Currency is `KES 18,450` (no decimals on the dashboard).

---

## 10. Design reference: Innap

The dashboard borrows *patterns* from the Innap admin template (DexignZone): a top row of counters, a statistics chart, an activity list with avatars, and a grouped sidebar. Stockly is a separate implementation with its own tokens, components and workflows.

**Licensing:** Innap is a commercial template. Using its code in a product you charge for requires the Extended License (check the ThemeForest terms). This project recreates layout patterns in its own components and does **not** include Innap code, CSS or assets. Keep it that way.

What was deliberately *not* taken: chat, email, calendar, the many chart libraries, and the 60+ page set.

---

## 10b. Products screens

- **List:** one card per product (name, SKU, category, price and cost, stock, status). Search covers name, SKU and barcode. Filters: category, status, archived.
- **Status words:** In stock (green, with a check), Low stock and Out of stock (red, with a warning icon), Archived (grey). Color is never the only signal.
- **Form:** one column on phones, two on wider screens. Money fields use the decimal keypad, count fields the numeric keypad. A price below cost shows an amber warning but does not block saving.
- **Detail:** stats grid, then Edit, Archive/Restore, Delete. Delete is offered only when a product has no history, and needs a second tap to confirm.
- **Categories:** a tab on the same page. Rename in place. Deleting a category in use shows how many products still use it.
- **Units:** whole units only for now (piece, pack, bottle, carton, bag, box, dozen).

---

## 10c. Purchases screens

- **List:** one row per purchase: reference, supplier, date, total, status badge. Search by reference or supplier, filter by status and date. A second tab lists suppliers.
- **Status words:** Draft, Ordered (grey), Partially received (amber), Received (green), Cancelled (grey). Always a word, never color alone.
- **New purchase:** supplier, then products with quantity and unit cost (cost starts at the product's current cost), live total. A supplier can be added without leaving the form. Two buttons: save and mark as ordered, or save as draft. A line of text states that saving does not change stock.
- **Receive stock:** a panel on the purchase page. One number field per outstanding item, with "Fill all outstanding". Blank means nothing arrived. Over-receiving is refused with a message.
- **Dashboard:** low-stock rows say how many are already on order, and an "On order" row shows purchases awaiting delivery.

---

## 11. Known issues and open decisions

1. **Active-nav and avatar contrast is 4.43:1 (needs 4.5:1).** `#C72C72` on `#FCE7F3`. A verified fix: change `--primary-dark` to **`#C0286B`** (4.75:1 on soft pink, 5.59:1 on white and as a button fill). One variable, no component changes.
2. **PWA icons are placeholders.** Replace `public/icon-192.png`, `icon-512.png` and `icon.svg` with real brand icons before launch.
3. **Only the Dashboard is built.** Next: Sales (phone-first), then Stock Count so the "Stock issues" counter has real data.
4. **Bundle is about 680 KB** (203 KB gzipped). Split by route when more screens exist.
5. **No manual dark-mode toggle** and no search behavior yet (the field is visual).
6. **Product name is temporary.** Check domain, social handles, app stores and Kenyan trademark availability before building branding.
7. **Target segment not final.** Design decisions that assume retail shops should be revisited after interviews.

---

## 12. How to change things safely

| I want to... | Edit |
|---|---|
| Change the brand color | the three `--primary*` variables in `src/index.css` |
| Rename the product | `APP_NAME` in `src/config.ts` |
| Add or reorder nav items | the `NAV` array in `src/components/AppShell.tsx` |
| Add a dashboard card | a `Metric` in `src/pages/Dashboard.tsx`, with the number computed in `src/lib/engine.ts` |
| Add a stock status | the engine first (`engine.ts`), then a badge using the existing tones |

Business logic never goes in components. If a number appears on screen, it is computed in `src/lib/engine.ts` from stock movements.
