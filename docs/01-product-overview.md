\# Stock Management SaaS



\## Product Overview



\*\*Document:\*\* 01 — Product Overview

\*\*Status:\*\* Active / In Development

\*\*Version:\*\* 0.1.0

\*\*Product Name:\*\* Temporary — Stockly

\*\*Last Updated:\*\* October 2026



\---



\# 1. Purpose



This document defines the overall purpose, vision, target users, problems, principles, scope, and direction of the Stock Management SaaS.



It establishes \*\*what the product is\*\*, \*\*who it is for\*\*, and \*\*what it is intended to accomplish\*\*.



This document does not define detailed technical implementation. Technical decisions are documented separately in:



`08-technical-architecture.md`



\---



\# 2. Product Summary



Stock Management SaaS is an \*\*offline-first inventory and stock management application\*\* designed for small and growing businesses.



The system helps businesses understand:



\* What stock they currently have

\* What stock has entered the business

\* What stock has left the business

\* Why stock changed

\* What products are running low

\* Where stock discrepancies exist

\* Which staff members performed stock-related actions

\* What requires attention today



The product is designed to be simple enough for everyday business operations while providing enough structure to support growing businesses.



\---



\# 3. Product Vision



\## Vision Statement



> Build a simple and reliable stock-management system that helps businesses know what they have, understand what is changing, and act before small stock problems become expensive problems.



The application should move beyond simply recording inventory.



It should help business owners \*\*understand their inventory\*\*.



\---



\# 4. The Core Problem



Many small businesses rely on methods such as:



\* Notebooks

\* Excel spreadsheets

\* Basic POS systems

\* Generic inventory applications

\* Memory

\* Manual physical counting



These approaches can create problems when the business grows.



Common problems include:



\### Missing Stock



The recorded quantity says one thing while the physical stock says another.



Example:



```text

System:

35 units



Physical count:

29 units



Difference:

\-6 units

```



The business owner needs to understand what caused the difference.



\---



\### Late Reordering



A business may discover that a product is almost finished only when a customer asks for it.



This can result in:



\* Lost sales

\* Customer dissatisfaction

\* Emergency purchases

\* Higher purchasing costs



\---



\### Stock Discrepancies



Sales, purchases and physical stock may not agree.



Possible causes include:



\* Incorrect sales entries

\* Damaged goods

\* Theft

\* Counting errors

\* Unrecorded stock movements

\* Staff mistakes

\* Manual adjustments



\---



\### Slow-Moving Stock



Some products remain on shelves for long periods.



This can tie up business capital and storage space.



\---



\### Poor Accountability



A business may not know:



\* Who changed stock

\* Who recorded a sale

\* Who adjusted quantities

\* Who received stock



Without activity history, investigating problems becomes difficult.



\---



\### Connectivity Problems



Some businesses cannot depend on continuous internet connectivity.



A stock system that becomes unusable whenever the connection fails creates operational problems.



Therefore, offline capability is a fundamental product requirement.



\---



\# 5. Core Product Questions



The product is built around three questions.



\## Question 1 — What do I have?



The system should provide visibility into:



\* Current quantities

\* Product value

\* Low-stock products

\* Recent purchases

\* Recent sales

\* Inventory changes



\---



\## Question 2 — What am I losing?



The system should help identify:



\* Stock discrepancies

\* Damaged stock

\* Unexpected adjustments

\* Unexplained stock changes

\* Differences between expected and physical quantities



\---



\## Question 3 — What needs my attention?



The system should highlight:



\* Products approaching minimum stock

\* Critical stock shortages

\* Stock discrepancies

\* Important adjustments

\* Significant recent activity



The dashboard should therefore function as a \*\*decision-support surface\*\*, not merely a collection of statistics.



\---



\# 6. Target Market



The initial target market is:



> Small and growing product-based businesses that need simple, affordable and reliable stock management.



Potential business categories include:



\* Retail shops

\* Mini-markets

\* Hardware shops

\* Cosmetic businesses

\* Clothing shops

\* Electronics shops

\* Pharmacies

\* Small wholesalers

\* Distributors

\* Food and beverage businesses



The exact primary segment is not yet final.



Customer research will determine which segment has the strongest combination of:



\* Pain

\* Frequency

\* Market size

\* Willingness to pay

\* Existing solution dissatisfaction



\---



\# 7. Primary User



The primary user is expected to be a:



\*\*Business owner or manager\*\*



They need to quickly understand the condition of their inventory without spending significant time analyzing spreadsheets or complicated reports.



Typical goals include:



\* Check today's sales

\* Check current stock

\* Identify products running low

\* Investigate discrepancies

\* Review staff activity

\* Record purchases

\* Record sales

\* Understand inventory value



\---



\# 8. Secondary Users



The system may also support:



\### Sales Staff



Responsible for recording customer purchases and sales.



\### Stock Staff



Responsible for receiving and counting inventory.



\### Managers



Responsible for monitoring operations and staff activity.



\### Business Owners



Responsible for overall business decisions.



Different users may eventually receive different permissions.



\---



\# 9. Product Philosophy



The product follows several principles.



\## 9.1 Simplicity First



Users should not require technical knowledge to operate the application.



\---



\## 9.2 Action Over Information



The application should prioritize information that requires action.



Instead of displaying:



> Low Stock: 12



it should help answer:



> Which 12 products are low, how urgent are they, and what should I do?



\---



\## 9.3 Explainable Inventory



Every significant stock change should have a reason.



Examples:



```text

PURCHASE

SALE

DAMAGE

STOCK\_COUNT

ADJUSTMENT

RETURN

```



The system should avoid unexplained changes wherever possible.



\---



\## 9.4 Offline First



The application should remain useful without an active internet connection.



Offline functionality is part of the architecture, not an optional add-on.



\---



\## 9.5 Accountability



Important actions should be associated with the person who performed them.



Example:



```text

James

Sold

Coca-Cola 500ml × 3

10:42 AM

```



\---



\## 9.6 Progressive Complexity



The initial interface should remain simple.



Advanced functionality can be introduced as the business grows.



\---



\# 10. Core Product Workflow



The primary inventory workflow is:



```text

SUPPLIER

&#x20;   ↓

PURCHASE

&#x20;   ↓

STOCK RECEIVED

&#x20;   ↓

INVENTORY

&#x20;   ↓

CUSTOMER PURCHASE

&#x20;   ↓

SALE RECORDED

&#x20;   ↓

STOCK DECREASES

&#x20;   ↓

INVENTORY MONITORED

&#x20;   ↓

ATTENTION REQUIRED

&#x20;   ↓

BUSINESS ACTION

```



Every important inventory transition should be traceable.



\---



\# 11. Stock Movement Concept



Stock is not treated as a number that is manually overwritten.



Instead, stock changes are represented as movements.



Example:



```text

Opening Stock

100



Purchase

+50



Sale

\-10



Sale

\-5



Damaged

\-2



Stock Count Adjustment

\-3

```



Result:



```text

Current Stock

130

```



This approach provides an audit trail.



\---



\# 12. V1 Product Scope



The first version focuses on the essential inventory workflow.



\## Included



\### Dashboard



\* Today's sales

\* Stock value

\* Low-stock count

\* Stock issues

\* Sales overview

\* Needs Attention

\* Recent Activity



\### Sales



\* Create sale

\* Add products

\* Set quantities

\* Calculate totals

\* Record staff member

\* Reduce stock

\* View sales history



\### Products



\* Create product

\* Edit product

\* Archive product

\* Categories

\* SKU

\* Purchase price

\* Selling price

\* Minimum stock

\* Search

\* Filtering



\### Inventory



\* Current stock

\* Stock value

\* Stock movements

\* Stock counts

\* Adjustments

\* Damaged stock



\### Purchases



\* Create purchase

\* Supplier information

\* Purchase items

\* Quantities

\* Purchase prices

\* Receive stock

\* Purchase history



\### Customers



\* Customer records

\* Customer history

\* Customer information

\* Future credit support



\### Settings



\* Business information

\* User profile

\* Staff

\* Roles

\* Permissions

\* Application preferences



\---



\# 13. V1 Navigation



The initial navigation is intentionally limited.



```text

Dashboard

Sales

Products

Inventory

Purchases

Customers

Settings

```



\### Suppliers



Suppliers are managed through Purchases rather than appearing as a separate primary navigation item.



\### Reports



Dedicated reports are deferred.



\### Alerts



Dedicated alerts are deferred.



For V1, important alerts are surfaced through:



\*\*Dashboard → Needs Attention\*\*



\---



\# 14. Dashboard Philosophy



The dashboard should answer:



> "What do I need to know right now?"



Example:



```text

Good morning, James 👋



Here's what needs your attention today.



Today's Sales       KES 18,450

Stock Value         KES 426,800

Low Stock           12

Stock Issues        3

```



Then:



\### Needs Attention



```text

Critical Stock

Sugar 1kg

Only 4 units remaining



Stock Discrepancy

Cooking Oil 1L

Expected: 35

Counted: 29

Difference: -6



Slow Activity

8 products have had no sale

in the last 30 days

```



Then:



\### Recent Activity



```text

James

Sold

Coca-Cola 500ml × 3

10:42 AM



Mary

Received stock

Milk 500ml × 50

09:18 AM



James

Adjusted stock

Sugar 1kg -2

Yesterday

```



The dashboard should make the next action obvious.



\---



\# 15. Offline-First Vision



The product should support this workflow:



```text

User performs action

&#x20;       ↓

Local application

&#x20;       ↓

IndexedDB

&#x20;       ↓

UI updates immediately

&#x20;       ↓

Action enters sync queue

&#x20;       ↓

Internet becomes available

&#x20;       ↓

Server synchronization

&#x20;       ↓

PostgreSQL

```



The user should not need to stop working simply because the connection temporarily disappears.



\---



\# 16. SaaS Vision



The long-term product is intended to operate as a multi-tenant SaaS.



Conceptually:



```text

Stock Management Platform

│

├── Business A

│   ├── Users

│   ├── Products

│   ├── Sales

│   ├── Purchases

│   └── Customers

│

├── Business B

│   ├── Users

│   ├── Products

│   ├── Sales

│   ├── Purchases

│   └── Customers

│

└── Business C

&#x20;   ├── Users

&#x20;   ├── Products

&#x20;   ├── Sales

&#x20;   ├── Purchases

&#x20;   └── Customers

```



Business data must remain isolated.



\---



\# 17. Design Direction



The interface uses a:



\*\*Modern SaaS + pink/white + mobile-first design system\*\*



Primary colors:



```text

Primary Pink       #E83E8C

Primary Dark       #C72C72

Soft Pink          #FCE7F3

Very Light Pink    #FFF5F9

White              #FFFFFF

Background         #FAFAFA

Text               #1F2937

Muted Text         #6B7280

Border             #E5E7EB

```



The design should feel:



\* Professional

\* Clean

\* Modern

\* Friendly

\* Fast

\* Trustworthy

\* Accessible



Pink should reinforce the product identity without overwhelming the interface.



\---



\# 18. Mobile-First Principle



The application should be designed for real business usage on phones.



Mobile users should be able to perform common tasks such as:



\* Record a sale

\* Check stock

\* Search products

\* Receive stock

\* Check alerts

\* View recent activity



The mobile interface should use a bottom navigation bar.



Desktop users should receive a full sidebar navigation.



\---



\# 19. V1 Non-Goals



The following are intentionally outside the initial scope:



\* Advanced AI forecasting

\* AI chatbot

\* Full accounting system

\* Payroll

\* Complex CRM

\* Multi-branch management

\* Advanced analytics

\* Native mobile applications

\* Every payment integration

\* Complete ERP functionality

\* Large-scale enterprise workflows



These features may be reconsidered after customer research.



\---



\# 20. Research-Driven Development



The product is being developed alongside market research.



The development process should continuously compare:



```text

Research

&#x20;  +

User Problems

&#x20;  +

Competitor Analysis

&#x20;  +

Product Data

&#x20;  ↓

Product Decisions

```



Features should not be added simply because they sound impressive.



A feature should have a clear reason.



\---



\# 21. Assumptions



The following are currently assumptions and must be validated:



1\. Small businesses need simpler inventory software.

2\. Stock discrepancies are a significant problem.

3\. Low-stock visibility is valuable.

4\. Offline operation is important to the target market.

5\. Staff accountability is valuable.

6\. Businesses will prefer actionable dashboards over complex reports.

7\. The initial target businesses are willing to pay for a focused stock-management solution.



These assumptions should be tested through interviews, observation and real-world product testing.



\---



\# 22. Success Criteria



The product should eventually demonstrate that users can:



\* Understand their stock quickly

\* Record sales without confusion

\* Receive stock accurately

\* Investigate stock differences

\* Identify products requiring attention

\* Work during temporary internet outages

\* Understand staff activity

\* Reduce manual stock-management work



Business success will ultimately depend on measurable outcomes such as:



\* Active businesses

\* Weekly active users

\* Transactions recorded

\* Retention

\* Feature usage

\* Stock discrepancies identified

\* Customer satisfaction

\* Conversion to paid plans



\---



\# 23. Current Status



\*\*Stage:\*\* Product discovery + frontend foundation



Current priorities:



1\. Documentation

2\. Market research

3\. User research

4\. UI/UX foundation

5\. Frontend application shell

6\. Working dashboard

7\. Movement-based mock data

8\. Offline foundation

9\. Core inventory workflows

10\. Backend integration



\---



\# 24. Product Guiding Statement



> \*\*Don't just show businesses their stock. Help them understand what needs attention.\*\*



This statement should guide product, design and engineering decisions throughout development.



