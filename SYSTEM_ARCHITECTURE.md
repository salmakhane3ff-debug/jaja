# SYSTEM_ARCHITECTURE.md

## Overview

This platform is an ecommerce and marketing system designed for high-conversion product sales.

The platform integrates multiple systems:

* Product management
* Feedback system
* Affiliate system
* Landing page builder
* Checkout system
* Order management
* Traffic tracking
* Admin panel

All systems must work together in a modular architecture.

---

# Core System Modules

The system contains the following core modules:

1. Product System
2. Feedback System
3. Affiliate System
4. Landing Page Builder
5. Checkout System
6. Order Management
7. Tracking System
8. Admin Panel

Each module must be independent but connected through APIs.

---

# Product System

Responsibilities:

* Store product information
* Display product pages
* Connect products with landing pages
* Connect products with feedback

Product data must include:

Title
Description
Price
Images
Rating
Feedback count

Products must be clonable from the admin panel.

---

# Feedback System

Feedback must support multiple formats:

Text
Image
Audio

Feedback must be attachable to:

Products
Landing pages
Homepage slider

Feedback can be scheduled by admin.

Example:

Admin can schedule feedback to publish every few hours automatically.

---

# Affiliate System

Affiliate marketing is a core feature.

Affiliate link format:

site.com/username

Example:

site.com/john

Behavior:

If a visitor enters the site using an affiliate link:

The affiliate ID must be stored.

Tracking must continue even if the visitor navigates to other pages.

Affiliate must be attached to:

Clicks
Orders
Campaign data

Affiliate dashboard must show:

Clicks
Orders
Commission
Conversion rate

Admin must manage:

Affiliate users
Affiliate payouts
Affiliate statistics

---

# Landing Page Builder

Landing pages are used for marketing campaigns.

Admin must be able to:

Create landing pages
Edit landing pages
Clone landing pages
Track landing page statistics

Landing pages must support modular sections.

Supported sections:

Hero
Video
BeforeAfter comparison
Image gallery
Feedback section
FAQ
CTA

Landing pages must track:

Views
Clicks
Sales
CTR

---

# Checkout System

Checkout must contain three steps.

Step 1
Customer information

Step 2
Shipping information

Step 3
Order confirmation

Checkout must support:

Delivery companies
Payment methods
Dynamic form fields

Checkout configuration must be editable in the admin panel.

---

# Order Management

Orders must contain:

Product
Customer information
Shipping information
Affiliate ID
Campaign source

Order statuses:

Pending
Confirmed
Shipped
Delivered
Cancelled

Admin must be able to:

Filter orders
Export orders
Update order status

---

# Tracking System

Tracking system must record user activity.

Tracked events:

Page views
Clicks
Checkout started
Order completed

Tracking must record:

Affiliate ID
Campaign source
Product ID
Landing page ID

Supported campaign sources:

TikTok
Instagram
Push ads
Native ads
Direct traffic

Tracking data must allow marketing analysis.

---

# Admin Panel

The admin panel controls the entire system.

Admin modules:

Dashboard
Products
Orders
Feedback
Affiliates
Landing Pages
Tracking
Settings

Admin must have full control over the platform.

---

# System Flow

Example user flow:

1. User clicks marketing link

Example:

site.com/john?campaign=tiktok1

2. Affiliate ID is stored

3. Campaign source is stored

4. User views landing page

5. User clicks product

6. User goes to checkout

7. Order is created

8. Affiliate commission is recorded

9. Tracking data is stored

---

# Performance Requirements

The platform must support high traffic.

Important optimizations:

Caching frequently accessed pages
Optimized database queries
Indexed database tables
Content delivery network support

---

# Scalability

The architecture must support future expansion.

Possible future systems:

Email marketing
Push notifications
Analytics dashboards
Multi-store support
Multi-language support

---

# Important Rule

All systems must be modular.

No system should be tightly coupled with another.

Each module must communicate via APIs.
