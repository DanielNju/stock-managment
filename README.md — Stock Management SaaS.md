# Stock Management SaaS

> An offline-first stock management system designed to help small and growing businesses know what they have, what needs attention, and where stock is changing.

## Overview

This project is a modern stock management SaaS application for small and growing businesses.

The goal is not to build another complicated inventory system. The product is designed around a simple question:

**"What needs my attention today?"**

The system helps businesses:

- Track products and stock levels
- Record sales and purchases
- Monitor stock movements
- Identify low-stock products
- Detect stock discrepancies
- Track customer information
- See who performed stock-related actions
- Continue working when internet connectivity is unavailable
- Synchronize data when connectivity returns

The product is being developed with a **mobile-first and offline-first approach**, while maintaining a professional desktop experience.

---

## Product Vision

Build a simple, reliable and intelligent stock-management system that allows business owners and staff to understand their inventory without needing complicated accounting or technical knowledge.

The system should turn raw stock records into useful business information.

Instead of only showing:

> "Current stock: 27"

the system should help answer:

> "Why is the stock 27, what changed, and does anything need my attention?"

---

## Target Users

The initial target market is small and growing businesses that regularly handle physical products.

Potential users include:

- Retail shops
- Mini-markets
- Hardware shops
- Beauty and cosmetic businesses
- Clothing shops
- Electronics shops
- Pharmacies
- Wholesalers
- Small distributors
- Other product-based businesses

The exact primary customer segment will be refined through customer research.

---

## Problem

Many small businesses struggle with:

- Missing or unexplained stock
- Stock numbers that do not match physical counts
- Finding out about low stock too late
- Products remaining unsold for long periods
- Poor visibility into stock movements
- Manual notebook or spreadsheet tracking
- Difficulty knowing who changed stock
- Customer credit tracking
- Dependence on internet connectivity

The product aims to address the most important problems first rather than attempting to solve every business-management problem.

---

## Core Product Questions

The application should help a business answer three fundamental questions:

### 1. What do I have?

The owner should quickly understand:

- Current stock
- Product quantities
- Stock value
- Low-stock products
- Recent purchases
- Recent sales

### 2. What am I losing?

The system should help identify:

- Stock discrepancies
- Damaged products
- Manual adjustments
- Unexpected stock reductions
- Differences between expected and physical stock

### 3. What needs my attention?

The dashboard should surface:

- Low-stock products
- Stock discrepancies
- Unusual adjustments
- Important recent activity
- Other actionable inventory issues

---

# V1 Scope

The first version focuses on the core inventory workflow.

## V1 Modules

### Dashboard

The dashboard provides a business overview.

It includes:

- Today's sales
- Stock value
- Low-stock count
- Stock issues
- Sales overview
- Needs Attention
- Recent Activity

The dashboard should prioritize actions and decisions rather than displaying statistics for their own sake.

---

### Sales

Users should be able to:

- Create a sale
- Add products
- Specify quantities
- Calculate totals
- Record the responsible staff member
- Automatically reduce stock
- View recent sales

---

### Products

Users should be able to:

- Create products
- Edit products
- Delete/archive products
- Set selling prices
- Set purchase prices
- Set minimum stock levels
- Assign categories
- Track stock quantities
- Search and filter products

---

### Inventory

Inventory should provide a detailed view of stock.

Users should be able to:

- View current stock
- View stock value
- View stock movements
- Record stock counts
- Record adjustments
- Record damaged stock
- Understand why stock changed

Every important stock change should have a reason.

---

### Purchases

Purchases should allow users to:

- Record purchases
- Add suppliers
- Add purchased products
- Record quantities
- Record purchase prices
- Increase stock automatically
- View purchase history

Suppliers will initially be managed within the Purchases module rather than having a separate main navigation item.

---

### Customers

Users should be able to:

- Add customers
- Edit customer information
- View customer history
- Track relevant customer transactions
- Support customer-credit functionality where required

---

### Settings

Settings will contain:

- Business information
- User profile
- Staff management
- Roles and permissions
- Application preferences
- Offline/synchronization information
- Future integrations

---

# V1 Navigation

The primary navigation is intentionally limited.

```text
Dashboard
Sales
Products
Inventory
Purchases
Customers
Settings
```

The following are intentionally excluded from the main V1 navigation:

- Reports
- Alerts
- Suppliers as a separate module

Reports and alerts may be introduced as dedicated modules later.

For V1, alerts are surfaced through the Dashboard's **Needs Attention** section.

---

# Stock Movement Model

Stock should not simply be stored as an unexplained number.

Every significant change should create a stock movement.

Example:

```text
Purchase
+100 units

Sale
-3 units

Sale
-2 units

Damaged
-1 unit

Sale
-4 units
```

The application can then determine:

```text
Current Stock = Opening Stock + Stock In - Stock Out ± Adjustments
```

This allows the system to explain where inventory changes came from.

---

# Recent Activity

Instead of showing only "Top Products", V1 will show recent business activity.

Example:

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

The purpose is to improve visibility and accountability.

---

# Offline-First Approach

Offline capability is a core architectural requirement rather than a feature that will be added later.

The application should remain useful when the user's internet connection is unavailable.

The initial architecture will use:

- IndexedDB
- Dexie
- PWA capabilities
- Local application state
- Synchronization with the backend when connectivity returns

The application should eventually support:

```text
User Action
    ↓
Local Database
    ↓
UI Updates Immediately
    ↓
Sync Queue
    ↓
Backend
    ↓
PostgreSQL
```

This approach is particularly important for businesses operating with unreliable or expensive internet connectivity.

---

# Technology Stack

## Frontend

- React
- TypeScript
- Vite
- React Router
- Tailwind CSS
- Lucide React
- Recharts

## Offline/PWA

- PWA plugin
- Service Worker
- IndexedDB
- Dexie

## Backend

Planned:

- Node.js
- REST API
- PostgreSQL

The exact backend framework will be finalized during the architecture stage.

## Database

Planned production database:

**PostgreSQL**

Business-related records will use tenant/business ownership so the system can safely support multiple businesses.

---

# Multi-Tenant Architecture

The product is intended to become a SaaS application.

Therefore, business data should be designed around a business/tenant identifier from the beginning.

Conceptually:

```text
Business A
 ├── Products
 ├── Sales
 ├── Purchases
 ├── Customers
 └── Staff

Business B
 ├── Products
 ├── Sales
 ├── Purchases
 ├── Customers
 └── Staff
```

A business must never be able to access another business's data.

---

# Design System

The application uses a modern **pink and white SaaS interface**.

## Core Colors

```text
Primary Pink       #E83E8C
Primary Dark       #C72C72
Soft Pink          #FCE7F3
Very Light Pink    #FFF5F9
White              #FFFFFF
Background         #FAFAFA
Primary Text       #1F2937
Secondary Text     #6B7280
Border             #E5E7EB
Success            #16A34A
Warning            #F59E0B
Danger             #DC2626
```

Pink should be used primarily for:

- Branding
- Primary actions
- Active navigation
- Important interface elements
- Focus states
- Selected states

The interface should remain predominantly white and clean.

---

# Responsive Design

The application is mobile-first.

### Mobile

Under 640px:

- Bottom navigation
- Touch-friendly controls
- Responsive cards
- Simplified tables
- Sticky actions where appropriate
- Mobile-friendly forms

### Tablet

640px–1024px:

- Responsive dashboard
- Adaptive navigation
- Optimized tables and forms

### Desktop

1024px+:

- Sidebar navigation
- Full dashboard layout
- Multi-column content
- Expanded tables
- Larger information density

The application should not simply shrink the desktop interface on mobile.

---

# Design Principles

The product should be:

### Simple

A business owner should understand the interface without technical training.

### Fast

Common actions should require as few steps as possible.

### Action-oriented

The application should highlight what requires attention.

### Reliable

Data should not disappear because the internet connection temporarily fails.

### Transparent

Stock changes should have traceable reasons.

### Professional

The interface should look like a legitimate commercial SaaS product rather than a developer prototype.

### Scalable

The architecture should allow future businesses, users, branches and integrations without rebuilding the application.

---

# Current Development Strategy

Development will happen incrementally.

## Phase 1 — Product Foundation

- Product documentation
- Market research
- User research
- Product requirements
- Architecture
- Design system

## Phase 2 — Frontend Foundation

- React/Vite setup
- TypeScript
- Tailwind
- Application shell
- Sidebar
- Mobile navigation
- Header
- Routing
- Design tokens

## Phase 3 — Working Dashboard

- Dashboard
- Counter row
- Sales chart
- Needs Attention
- Recent Activity
- Movement-based mock data
- Responsive design
- Loading states
- Empty states
- Error states

## Phase 4 — Core Inventory

- Products
- Inventory
- Stock movements
- Purchases
- Sales

## Phase 5 — Offline Capability

- PWA
- IndexedDB
- Dexie
- Offline operations
- Synchronization queue

## Phase 6 — Backend

- API
- Authentication
- PostgreSQL
- Multi-tenancy
- Server-side validation
- Synchronization

## Phase 7 — Real-World Testing

Test with real businesses and observe:

- What they use
- What they ignore
- Where they get confused
- What they repeatedly ask for
- What they currently do manually
- What causes them the most pain

The product should then be modified based on evidence.

---

# Features Intentionally Deferred

The following are not part of the initial V1:

- AI chatbot
- Advanced AI forecasting
- Payroll
- Full accounting
- Complex CRM
- Multi-branch management
- Advanced reporting
- Every possible payment integration
- Native Android/iOS application
- Complex ERP functionality

These may become future features if customer research demonstrates demand.

---

# Product Research Principle

The product should not be built around assumptions alone.

Research should continuously answer:

```text
What problem happens?
How often does it happen?
How expensive is it?
How do businesses solve it today?
What existing software do they use?
What do they dislike?
Would solving it save time or money?
```

Customer interviews and observations should focus on actual experiences rather than hypothetical questions such as:

> "Would you use my app?"

---

# Naming

The product name is currently temporary.

Development may use:

**Stockly**

The application name must be stored in one configuration location so that it can easily be changed later.

Before final launch, the chosen name should be checked for:

- Domain availability
- Social media handles
- App-store availability
- Trademark conflicts
- Kenyan business/trademark considerations

No final product name has been selected yet.

---

# Project Status

**Current stage: Product discovery + frontend foundation**

The immediate goal is to build a polished working frontend while continuing research.

The frontend should be treated as a real product from the beginning, even while mock data is being used.

---

# Success Criteria for the First Preview

The first working preview should demonstrate:

- Professional pink/white design
- Responsive desktop interface
- Mobile bottom navigation
- Functional sidebar
- Dashboard
- Business metric counters
- Sales chart
- Needs Attention section
- Recent Activity
- Movement-based mock data
- Consistent design tokens
- Good typography
- Loading states
- Empty states
- Interactive buttons and navigation

The result should feel like a **real SaaS product**, not a template or static dashboard.

---

# Guiding Principle

> **Don't just show the business data. Help the business understand what needs attention.**

That principle should guide product decisions throughout development.