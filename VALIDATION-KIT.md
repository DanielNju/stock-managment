# Stockly: Validation Kit

For testing the prototype with real shop owners and attendants. Print or keep on your phone.

**Rules**
- In sessions you run yourself, use **demo data** (Setup > Load demo data). A tester using the app for real is fine **only if they understand the data lives on their phone only** and make a backup (Settings > Download backup). Nothing is sent to you.
- You are testing the app, not the person. If they get stuck, that is a finding about Stockly.
- Stay quiet. Do not explain screens. Ask them to think aloud.
- Say you are researching how shops manage stock. Do not oversell what the app is.

---

## Part A: Your own QA first (30 minutes, before meeting anyone)

Do this alone, on a phone, and write the numbers down. Every stock change must add up.

| # | Do this | Expected | Result |
|---|---|---|---|
| 1 | Add a product with opening stock 12 | Product shows 12. Movements list shows "Opening stock × 12" | |
| 2 | Create a purchase for it (10 units), save it as ordered | Stock still 12. Dashboard "On order" appears | |
| 3 | Receive 4, then receive 6 | Partly received, then received. Stock 12 → 16 → 22. Never 32 | |
| 4 | Try to receive 1 more | Refused | |
| 5 | Sell 3 of it | Stock 19. Sale in history. Dashboard sales go up | |
| 6 | Try to sell more than is in stock | Refused, with the amount available | |
| 7 | Cancel that sale | Stock back to 22. Sale marked cancelled. Not counted in today's sales | |
| 8 | Count it: 20 on the shelf, reason "Missing" | Shows −2. Stock 20. Appears under Stock issues on the dashboard | |
| 9 | Close the browser tab and reopen | Everything still there | |
| 10 | Turn on airplane mode, make a sale, close the browser, reopen it (still in airplane mode) | Header shows "Offline" and "Saved on this device only". The sale is still in History and stock is correct | |
| 11 | Open Settings | Says the data is not synced or backed up, and other phones can't see it | |
| 13 | Dashboard: sell 3 of any product, then cancel it | Today's sales and gross profit go up by price and (price − cost) × 3, then return to where they were | |
| 14 | Dashboard on a phone: scroll to the bottom | Nothing runs off the right edge of the screen | |
| 17 | Fresh install (clear the site's data first): open the app | The Setup screen appears with no demo products, and the privacy link opens the policy | |
| 18 | Finish setup, add a product with opening stock, sell some, then Settings > Download backup | A file is saved. The banner and Settings say the last backup was today | |
| 19 | Settings > Erase all data (type DELETE), then on the Setup screen choose Restore from a backup and pick that file | Shop name, staff, product, stock and the sale are all back, exactly as before | |
| 20 | On Android Chrome: menu > Install app (or Add to Home screen), open it from the icon, switch on airplane mode | It opens full-screen with no address bar and keeps working offline | |
| 15 | Customers: add one, sell to them, open their page; then cancel that sale | Total spent shows the sale, then returns to 0 after the cancel. Delete is not offered while they have purchases | |
| 16 | Settings: add a person, switch the device to them, make a sale | The header avatar and dashboard greeting show their name, and Recent activity says they sold it | |
| 12 | Dashboard: tap the Slow row | Lists Soap Bar and Biscuits Pack with days since last sale | |

Anything that does not match is a bug. Fix those before testing with owners. Steps 9 to 12 are also covered by `node e2e/phone-checks.mjs`.

---

## Part B: Session with an owner or attendant (about 30 minutes)

### 1. Warm-up (5 min), before showing anything
- What do you sell, and roughly how many different products?
- Who handles stock? Who records sales? Who receives deliveries?
- How do you track stock today? (notebook, Excel, POS, memory)
- Tell me about the **last time** your stock did not match.

### 2. Tasks (15 min)
Hand them the phone. Read each task out loud. Do not say which button to press.

| # | Task (say it like this) | Success means |
|---|---|---|
| T1 | "A customer wants 2 Coca-Cola and 1 bread and pays by M-Pesa. Record it." | Sale completed with the right items and payment |
| T2 | "You think you made a mistake on that sale. Undo it." | Sale cancelled |
| T3 | "Which products are running low? What would you do about it?" | Finds the Low items, says something sensible |
| T4 | "A supplier delivered only 8 of the 12 bottles of Cooking Oil you ordered. Record it." | Partial receipt recorded |
| T5 | "You counted 23 packs of Sugar on the shelf. Check it against the system." | Count recorded with a reason |
| T6 | "Add a new product: Blue Band 250g, cost 90, selling price 110, 12 on the shelf." | Product added with opening stock |
| T7 | "Who sold the most recently? What did they sell?" | Finds Recent activity |
| T8 | "Which products have not sold for a month?" | Opens the Slow row on the dashboard or the Slow-moving filter in Inventory and names them |
| T10 | "You have KES 20,000 to spend on stock today. What would you buy?" | Uses the Restock table or Needs attention, and says whether the suggestions make sense to them |
| T11 | "Did you make a profit this week? Which product earns you the most?" | Finds the Sales and profit section and Top products, and says whether the profit figure matches how they think about it |
| T12 | "Wanjiru is a regular. Record a sale for her, then show me what she has bought from you." | Chooses the customer on the sale (or adds one), then finds the customer page and the purchase |
| T13 | "Your attendant Wanjiku will use this phone this afternoon. Set it up so her sales are recorded under her name." | Adds her in Settings and switches the device to her |
| T14 | "You just installed this. Set it up for your shop." | Finishes setup unaided and understands the two names it asks for |
| T15 | "If you lost this phone tonight, how would you get your records back? Show me." | Finds Back up, saves the file, and says where they would keep it. If they can't answer, the backup step needs to be clearer |
| T9 | "If you open this on your brother's phone, will he see these sales?" | Understands the data stays on this phone (check whether they read the banner) |

For each task record: **Done alone / Done after a hint / Failed**, the time it took, and what they said.

### 3. Afterwards (10 min)
- What was the most confusing part?
- What did you expect to find that wasn't there?
- Which part would you use every day? Which would you never use?
- How do your staff handle this today? Would they use a phone for it?
- Does this look like something you would pay for? What do you pay for now? *(Listen. Do not suggest a price.)*

---

## Part C: Credit and other research questions

Ask these in the warm-up, before the app comes out.

**Credit**
1. Do customers ever take goods now and pay later? How often (daily, weekly, rarely)?
2. How do you record who owes you? Walk me through the last one.
3. How much was owed to you last month? How much did you not get back?
4. Have you ever lost track of a balance or had a disagreement about one?
5. Do you give credit to everyone, or only some customers? Who decides?

**Customers**
12. Do you know your regular customers by name? Do you write down what they buy?
13. Would you want to see what a customer has bought from you over time? What would you do with that?

**Other problems**
6. What happens when a product runs out? When did you last lose a sale because of it?
7. How do you decide how much to order?
8. How often do you count stock, and how long does it take?
9. How do you handle damaged or expired goods?
10. Do you buy goods on credit from suppliers? How do you track what you owe?
11. What happens when the internet goes down, or the phone battery dies?

---

## Observation sheet (one per session)

```text
Date:            Participant (initials only):
Role:            Business type:        Size (staff / products):
Current method:  Phone used (model, browser):

TASKS        Done alone / hint / failed    Time    Notes and quotes
T1
T2
T3
T4
T5
T6
T7
T8

CONFUSING STEPS (what, where, what they said or did):

MISSING FEATURES (their words, not yours):

CREDIT: how often?     how tracked?     amount at risk?

QUOTE I want to remember:

CONFIDENCE (how sure am I about these findings?)  low / medium / high
```

**Severity for each problem:** 0 = not a problem, 1 = cosmetic, 2 = slowed them down, 3 = they could not continue.

---

## Privacy and consent

- Tell them what you are writing down and why. Ask before taking notes, and again before recording audio.
- Record initials or an ID, not names, phone numbers or business names, unless they agree.
- Keep notes somewhere private. If you end up holding personal data about people in Kenya, check what the Data Protection Act requires of you (including whether you need to register).
- Thank them. Offer to share a summary of what you learned.

---

## After 5 to 10 sessions: decide

Fill this in before you read your notes, then compare.

| Question | Evidence needed |
|---|---|
| **Build Customers with credit next** | Most shops (say 6 of 10) give credit often, track it badly, and can name a real loss or dispute |
| **Skip credit; improve what exists** | Credit is rare, or already handled well enough in a notebook |
| **Fix usability first** | Two or more people fail the same task, or the same step confuses most people |
| **Add stock adjustments (damage, expiry)** | Several people look for a way to record damage and don't find it |
| **Rethink the target customer** | The problems you hear most are in a different kind of shop than the one you tested |

These numbers are guidelines, not statistics. A few repeated, specific stories beat many vague agreements.

**Do not count as evidence:** "That looks nice." "I would use that." A feature someone asked for once. Anything about the app that you explained before they tried it.

---

## Findings log

| Date | Who | Finding | Severity (0 to 3) | How many people | Action |
|---|---|---|---|---|---|
| | | | | | |
