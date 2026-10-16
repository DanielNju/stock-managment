# Google Play listing text

Copy these into Play Console > Grow > Store presence > Main store listing. Limits are Google's. Counts below were checked.

## App name (max 30 characters)
`Stockly`  **<- placeholder. Other inventory apps called "Stockly" already exist on Google Play. Choose a different, distinctive name in `brand.json` first.**

Rules: no emoji, no keyword stuffing, no words like "best" or "#1".

## Short description (max 80 characters)
```
Track stock, sales and purchases for your shop. Works without internet.
```

## Full description (max 4000 characters)
```
Run your shop with less guesswork.

This app helps small shops keep track of what they have, what is selling and what needs attention, even when the internet is down.

WHAT YOU CAN DO
• Know your stock: every change is recorded with who made it and why, so you can see where stock went.
• Record sales fast: cash or M-Pesa, in a few taps, optionally for a named customer. M-Pesa is recorded by you. The app does not process payments.
• Buy stock: write down purchases from your suppliers and record what actually arrives, including part deliveries.
• Count your shelves: compare what is on the shelf with the system and record any difference and the reason.
• See what needs attention: products that are out or running low, count mismatches, deliveries still waiting, and slow-moving stock.
• Understand your business: estimated gross profit, top products and 7 or 30 day trends.
• Plan restocking: simple suggestions based on your recent sales.
• Know your customers: keep a list and see what each customer has bought.
• Know who did what: record sales and stock changes under each staff member's name.

WORKS WITHOUT INTERNET
Everything is saved on your phone and works offline. Open it, sell, count, receive stock, even with no signal.

YOUR DATA STAYS WITH YOU
There is no account, no ads and no tracking. Nothing you enter is uploaded. Because your records live on your phone, there is no automatic online backup. Use Back up in Settings regularly and before you change phones. A backup is one file you can keep, email or send to yourself, and restore on any phone.

GOOD TO KNOW
• Profit shown is an estimate: sales minus the cost you recorded. It does not include rent, wages or other expenses.
• Restock suggestions are a simple estimate, not a guarantee.
• Made for small retail shops and built for phones.

Questions or ideas? Contact us from the details on this page.
```

## What's new (max 500 characters), first release
```
First release. Track stock, sales, purchases, customers and staff. Works offline. Back up your data from Settings.
```

## Other fields
| Field | Value |
|---|---|
| App category | Business |
| Tags | Business, Productivity (pick what Play offers) |
| Contact email | the one in `brand.json` (shown publicly) |
| Privacy policy URL | `https://YOUR-SITE/privacy.html` |
| Website (optional) | your site |
| Price | Free |
| Ads | No |
| In-app purchases | No |

## Graphics (all in this folder)
| What | File | Requirement |
|---|---|---|
| App icon | `icon-512.png` | 512 x 512 PNG, under 1 MB |
| Feature graphic | `feature-graphic.png` | 1024 x 500 |
| Phone screenshots | `phone-screenshots/01..06` | 2 to 8, each side 320 to 3840 px, long side at most 2x the short side. These are 1080 x 1920. |

Screenshot captions to keep in mind (they show the real app): 1 Dashboard, 2 Sales and profit, 3 New sale, 4 Restock suggestions, 5 Products, 6 Customers.

## App content questionnaires
**Content rating (IARC):** answer No to violence, fear, sexual content, language, gambling, drugs, user-generated content sharing, and location sharing. Expect the lowest rating.

**Target audience:** 18 and over (business users). Not designed for children.

**Data safety.** Be accurate and re-read Google's current guidance before you submit.
| Question | Suggested answer | Why |
|---|---|---|
| Does the app collect or share user data? | No | What you enter is stored only on the phone and never sent anywhere. |
| Is all data encrypted in transit? | Not applicable (nothing transmitted) | |
| Can users request data deletion? | Users delete their own data: Settings > Erase all data, or uninstall | There is no server copy. |
| Account creation | None | |
| Permissions requested | None | |

One thing to check yourself: the app opens from your website, so your web host sees ordinary request details (such as an IP address) when the app loads or updates. The privacy policy says so. Read Google's data safety help to decide whether that needs to be declared for your setup. If you want the app to make no network requests at all, ask for a bundled (Capacitor) build instead.

## Policies to keep in mind
- **Name and icon must be your own.** Do not copy another app's name or look.
- **Honest claims only.** The text above says "simple estimate" for restock and profit on purpose. Do not describe it as AI or guaranteed.
- **No payment processing claims.** M-Pesa is only recorded, not processed.
- **Reply to reviews and keep the support email working.**
