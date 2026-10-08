# Stock Management SaaS
## Market Research

**Document:** 02 — Market Research  
**Status:** Active / In Progress  
**Version:** 0.1.0  
**Last Updated:** October 2026

---

# 1. Purpose

This document records the market research supporting the development of the Stock Management SaaS.

The purpose is to understand:

- Existing inventory solutions
- Target-market problems
- Competitor positioning
- Common features
- Potential market gaps
- Customer frustrations
- Opportunities for differentiation
- Assumptions that require validation

This document should be updated as new research is collected.

---

# 2. Research Principle

The product should not attempt to compete simply by having more features.

The objective is to identify a meaningful problem that existing solutions do not solve sufficiently well for the intended customer.

The research process follows:

```text
Market
   ↓
Competitors
   ↓
Existing Solutions
   ↓
Customer Problems
   ↓
Unmet Needs
   ↓
Product Opportunity
```

---

# 3. Initial Market Hypothesis

The initial hypothesis is:

> Small and growing businesses need a stock-management system that is easier to use than complex inventory/ERP platforms while providing more useful operational visibility than notebooks, spreadsheets, or basic stock trackers.

The product should potentially compete on:

- Simplicity
- Reliability
- Offline usability
- Actionable stock visibility
- Accountability
- Ease of adoption
- Local business relevance

This remains a hypothesis until validated through customer research.

---

# 4. Existing Market Categories

The current market can broadly be divided into several categories.

## 4.1 Manual Methods

Examples:

- Notebooks
- Paper stock cards
- Physical counting
- Calculator-based tracking

### Advantages

- Very cheap
- Familiar
- No internet required
- No software learning curve

### Problems

- Easy to lose records
- Difficult to search
- Difficult to analyze
- Poor accountability
- Difficult to track historical changes
- High possibility of human error

### Opportunity

Provide digital convenience without introducing unnecessary complexity.

---

# 5. Spreadsheet-Based Inventory

Common tools include:

- Microsoft Excel
- Google Sheets
- Custom spreadsheets

### Advantages

- Flexible
- Familiar
- Relatively inexpensive
- Can work offline depending on the setup
- Businesses can customize them

### Problems

- Manual data entry
- Formula errors
- Poor user experience for nontechnical users
- Weak accountability
- Difficult multi-user workflows
- No purpose-built stock workflow
- Limited real-time operational guidance

### Opportunity

Provide the flexibility users need while automating common stock operations.

---

# 6. POS and Inventory Platforms

Another major category combines:

- Point of sale
- Inventory
- Customers
- Payments
- Reporting

These systems can provide significantly more functionality than manual methods.

However, additional functionality can also introduce:

- More configuration
- More screens
- More training
- Higher complexity
- More expensive plans
- Features that small businesses may never use

The product opportunity is not necessarily to build a larger system.

It may be to build a **more focused system**.

---

# 7. Global Competitors

Several established platforms operate in inventory management and related business software.

Examples include:

- Zoho Inventory
- Odoo
- Loyverse
- Square
- Shopify
- QuickBooks-related inventory workflows

These products demonstrate that inventory management is an established software category.

They also provide useful references for:

- Product management
- Sales
- Purchases
- Inventory tracking
- Reporting
- Customer management
- Business analytics

---

# 8. Zoho Inventory

## Category

Cloud inventory management.

## Commonly associated capabilities

- Inventory tracking
- Orders
- Purchasing
- Warehouses
- Product management
- Reports
- Integrations

## Strengths

- Mature product
- Broad functionality
- Professional interface
- Integrations
- Suitable for growing businesses

## Potential Opportunity

A smaller business may not need the full breadth of a mature inventory platform.

The opportunity is to investigate whether smaller businesses prefer:

- Fewer screens
- Simpler workflows
- Faster setup
- Better mobile-first operation
- Localized workflows

These points require customer validation.

---

# 9. Odoo

## Category

Enterprise/business management platform.

Odoo covers inventory alongside many other business functions.

Examples include:

- Accounting
- CRM
- Sales
- Purchasing
- Inventory
- Manufacturing
- HR
- Website
- E-commerce

## Strengths

- Extremely broad
- Highly customizable
- Large ecosystem
- Suitable for complex businesses

## Potential Opportunity

The breadth of Odoo can be unnecessary for a small business whose immediate need is simply:

> "Help me manage my stock."

The product opportunity is therefore **focused simplicity**, not feature competition.

---

# 10. Loyverse

## Category

POS and inventory management.

Common capabilities include:

- Point of sale
- Product management
- Inventory
- Sales tracking
- Employee management
- Customer management
- Analytics

## Market Lesson

Loyverse demonstrates that small businesses can adopt integrated POS and inventory systems when the workflow is accessible.

The product should therefore study:

- Speed of sale entry
- Product search
- Staff workflows
- Inventory visibility
- Mobile usability

---

# 11. Kenyan and African Market

The Kenyan market has its own requirements and constraints.

Potential considerations include:

- Mobile-first usage
- Smartphone-based business operations
- Internet reliability
- Mobile money
- Local tax requirements
- Small-business budgets
- Informal and semi-formal businesses
- Staff sharing devices
- Cash-heavy businesses
- Mixed digital/manual workflows

A solution designed only around assumptions from US or European businesses may miss important local workflows.

---

# 12. Kenyan Competitor Research

Examples of products operating in or targeting the Kenyan/African market include:

- Mokafa Flow
- StockHive
- TukoPOS
- Gigva
- Stockdey
- Dukaa
- Other POS and inventory platforms

These products demonstrate that the local market already has demand for digital stock-management solutions.

Therefore:

> "Inventory software for Kenyan businesses" is not itself a unique product proposition.

Differentiation must come from the problem being solved and the quality of the experience.

---

# 13. Common Feature Patterns

Across competing products, several capabilities appear repeatedly.

### Inventory

- Product management
- Stock quantities
- Categories
- Stock alerts
- Stock adjustments

### Sales

- POS
- Sales recording
- Receipts
- Sales history

### Purchasing

- Suppliers
- Purchase records
- Stock receiving

### Customers

- Customer records
- Customer credit/debt
- Purchase history

### Analytics

- Sales summaries
- Inventory reports
- Performance dashboards

### Payments

Depending on the product:

- Cash
- Mobile money
- Card payments
- Payment integrations

### Business integrations

Some platforms offer:

- Tax integrations
- Accounting
- Messaging
- E-commerce
- Payment integrations

---

# 14. Important Market Lesson

Features such as:

- M-Pesa
- Offline mode
- AI
- Reorder alerts
- Analytics
- POS
- Customer credit

should **not automatically be treated as unique differentiators**.

Competitors already advertise many of these capabilities.

Therefore:

> A feature is not a differentiator simply because it sounds valuable.

The product must determine whether the feature solves a problem **better, faster, or more simply** than alternatives.

---

# 15. Potential Differentiation

The current product hypothesis is to focus on:

## "What needs my attention?"

Instead of presenting hundreds of metrics, the application should surface the most important operational issues.

For example:

```text
Needs Attention

⚠ Sugar 1kg
Only 4 units remaining.

⚠ Cooking Oil 1L
6 units missing compared with stock count.

⚠ Slow-moving stock
8 products have not sold in 30 days.
```

The system should help transform:

```text
Raw Data
```

into:

```text
Business Action
```

---

# 16. Stock Movement as a Foundation

A potential technical and product differentiator is making stock movements central to the system.

Instead of only storing:

```text
Sugar = 29 units
```

the system stores:

```text
Opening stock       35
Purchase           +20
Sale                -12
Sale                 -8
Damage               -2
Adjustment            -4
-----------------------
Current stock        29
```

This creates a history of why inventory changed.

The owner can investigate:

> "Where did those six units go?"

rather than simply discovering that the number is wrong.

---

# 17. Accountability Opportunity

Recent activity can connect stock changes to people.

Example:

```text
Mary
Received
Milk 500ml × 50

James
Sold
Coca-Cola 500ml × 3

John
Adjusted
Sugar 1kg -2
```

This may help businesses identify:

- Errors
- Unusual activity
- Training problems
- Stock discrepancies
- Responsibility

The importance of this feature must be validated with real users.

---

# 18. Offline Opportunity

Offline capability is important to investigate because businesses may operate in environments where:

- Internet is unreliable
- Mobile data is expensive
- Connectivity changes throughout the day

However, offline support alone should not be considered a unique selling proposition.

The real question is:

> Can the product continue essential business operations reliably when connectivity disappears?

The system therefore needs to make offline behavior predictable.

---

# 19. Customer Research

The most important research source is not competitor websites.

It is the people who actually manage stock.

The product should gather information from:

- Business owners
- Managers
- Sales staff
- Stock controllers
- Shop attendants
- Small wholesalers
- Other inventory-related workers

---

# 20. Current Research Question

The initial LinkedIn research question asks businesses to identify their biggest stock-management problem.

The options include:

```text
1 — Missing stock
2 — Reordering
3 — Numbers not matching
4 — Slow stock
5 — Customer credit
0 — Something else
```

The objective is to identify recurring problems rather than promote the product.

---

# 21. Research Questions

Future interviews should ask questions such as:

### Current workflow

- How do you currently track stock?
- What happens when new stock arrives?
- How do you record sales?
- How do you perform stock counts?

### Problems

- What is the biggest stock problem you face?
- How often does it happen?
- What usually causes it?
- What happens when it occurs?

### Discrepancies

- How often does physical stock differ from recorded stock?
- How do you investigate the difference?

### Reordering

- How do you know when to reorder?
- Have you ever run out of an important product unexpectedly?

### Slow stock

- How do you identify products that are not selling?

### Software

- Do you currently use software?
- Which software?
- What do you like about it?
- What do you dislike?
- What would you change?

### Cost

- How much does the current solution cost?
- What makes a solution worth paying for?

---

# 22. Research Method

Research should prioritize actual behavior over hypothetical opinions.

Prefer:

> "Tell me about the last time your stock didn't match."

Instead of:

> "Would you use an app that detects stock discrepancies?"

The first question reveals actual behavior.

The second may produce an optimistic but unreliable answer.

---

# 23. Research Data to Capture

Each response should be recorded using a consistent structure.

```text
Respondent
Role
Business Type
Business Size
Current Stock Method
Biggest Stock Problem
Frequency of Problem
Stock Discrepancies
Reordering Method
Slow Stock Problem
Customer Credit
Internet Reliability
Current Software
Software Cost
Main Complaint
Desired Improvement
Willingness to Pay
Additional Notes
```

Personal identifying information should only be collected when necessary and with appropriate consent.

---

# 24. Problem Scoring Framework

Potential problems should be evaluated using:

| Factor | Question |
|---|---|
| Frequency | How often does the problem happen? |
| Pain | How frustrating is it? |
| Financial Impact | Does it cost money? |
| Time Impact | Does it waste significant time? |
| Number Affected | How many businesses experience it? |
| Existing Solutions | Is the problem already solved well? |
| Willingness to Pay | Would businesses pay to solve it? |
| Build Difficulty | Can we solve it realistically? |

A high-value problem should score strongly across multiple categories.

---

# 25. Current Product Hypothesis

The current working hypothesis is:

> Small businesses need a simple system that continuously explains their inventory position and highlights stock problems before they become expensive.

Potential core value:

```text
Know what you have.
Know what changed.
Know what needs attention.
```

This hypothesis is not yet considered proven.

---

# 26. What We Must Not Assume

The project should not assume that:

- Every business wants AI
- Every business wants a mobile app
- Every business needs complex reports
- Every business wants M-Pesa integration
- Every business needs multi-branch support
- Every business will pay a subscription
- Every business has reliable internet
- Every business wants the same workflow

Research must determine these.

---

# 27. Competitive Positioning Hypothesis

The initial positioning direction is:

> **Simple stock management that tells you what needs attention.**

Potential supporting benefits:

- Easy to use
- Mobile-first
- Offline-capable
- Traceable stock movements
- Staff accountability
- Action-oriented dashboard

These are hypotheses and should be refined after customer research.

---

# 28. Market Gap to Investigate

The most important gap to investigate is not:

> "Does another inventory app exist?"

It clearly does.

The more useful question is:

> **Where are existing solutions still frustrating for the specific businesses we want to serve?**

Research should investigate:

- Setup complexity
- Daily usability
- Mobile experience
- Offline behavior
- Stock discrepancy investigation
- Staff accountability
- Actionable insights
- Pricing
- Support
- Local workflows
- Data migration
- Ease of training staff

---

# 29. Evidence Levels

Market findings should be classified.

## Confirmed

Supported by multiple reliable sources or direct customer evidence.

## Observed

Seen in competitor products or individual user reports.

## Hypothesis

A reasonable assumption that has not yet been validated.

## To Validate

Requires interviews, testing or additional research.

Example:

```text
Offline inventory is valuable.

Status:
HYPOTHESIS

Evidence required:
Interview at least 5 businesses about connectivity problems.
```

---

# 30. Research Log

New findings should be added here.

| Date | Source | Finding | Impact | Status |
|---|---|---|---|---|
| Oct 2026 | LinkedIn research | Initial responses being collected | Identify dominant stock problems | In progress |
| Oct 2026 | Competitor research | Many competitors already offer inventory + POS | Generic inventory is insufficient | Observed |
| Oct 2026 | Product analysis | Stock movement history can support discrepancy investigation | Potential product direction | Hypothesis |

This table should grow as research continues.

---

# 31. Market Research Conclusion

The market already contains many inventory-management products.

Therefore, the objective is **not** to create another generic:

> Products + Sales + Stock + Reports

application.

The opportunity is to identify a specific and painful problem and solve it exceptionally well.

The current direction is:

> **Make stock understandable and actionable for small businesses.**

The next stage of research must determine whether this direction matches the real problems experienced by the target market.

---

# 32. Next Research Objectives

Before finalizing the product's long-term positioning, the team should:

1. Collect LinkedIn responses.
2. Conduct direct interviews.
3. Speak to different business types.
4. Record existing stock-management methods.
5. Identify recurring problems.
6. Research current software used by respondents.
7. Document complaints about existing systems.
8. Compare pricing.
9. Score the problems.
10. Select the strongest initial customer segment.
11. Update the product requirements based on evidence.

---

# 33. Guiding Research Principle

> **Do not build what businesses say sounds nice. Build what repeatedly causes them pain.**