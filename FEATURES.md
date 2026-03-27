# FEATURES.md

## Project Overview

This project is an ecommerce platform focused on high-conversion sales funnels, affiliate marketing, and traffic tracking.
The system must be optimized for high traffic from TikTok, Instagram, push ads, and native ads.

---

# Core Features

## 1. Products System

The platform must allow the admin to manage products.

Features:

* Create product
* Edit product
* Delete product
* Clone product
* Product images gallery
* Product rating display
* Product feedback display
* Product landing page connection

Admin capabilities:

* Enable/disable product
* Duplicate product quickly
* Assign landing page to product

---

# 2. Feedback System

Feedback must support multiple formats:

Types:

* Text feedback
* Image feedback
* Audio feedback

Locations where feedback can appear:

* Product page
* Dedicated feedback page
* Homepage slider
* Landing pages

Admin capabilities:

* Approve feedback
* Schedule feedback publication
* Delete feedback
* Feature feedback

Feedback scheduling:
Admin can schedule feedback posts automatically.

Example:
Every X hours publish a new feedback.

---

# 3. Homepage Feedback Slider

The homepage must support feedback display.

Options:

* Enable/disable slider
* Select number of feedback to display
* Choose feedback type (audio/image/text)
* Button to open full feedback page

---

# 4. Affiliate System

Affiliate system must support:

Affiliate URL format:
site.com/username

Behavior:
If a visitor enters from an affiliate link:

* Affiliate ID must be saved
* Affiliate must stay attached to session
* Affiliate must stay attached to product links
* Removing affiliate from URL should not remove tracking

Affiliate dashboard must show:

* Total clicks
* Total orders
* Total commission
* Conversion rate

Admin panel must allow:

* Create affiliate manually
* Access affiliate account
* Manage payouts
* View affiliate statistics

---

# 5. Landing Page Builder

The platform must include a landing page builder.

Admin must be able to:

* Create landing pages
* Edit landing pages
* Clone landing pages
* View statistics

Landing page sections:

* Hero section
* Video section
* Before/After comparison
* Image gallery
* Feedback section
* FAQ section
* CTA section

Each section must be modular.

Landing pages must show statistics:

* Views
* Clicks
* Sales
* CTR

---

# 6. Checkout System

Checkout contains 3 steps.

Step 1:
Customer information.

Step 2:
Shipping details.

Step 3:
Order confirmation.

Checkout must support:

* Delivery companies
* Payment methods
* Dynamic form configuration from admin panel

---

# 7. Orders System

Admin must be able to:

* View orders
* Filter orders
* Export orders
* Track orders
* Assign delivery company

Order statuses:

* Pending
* Confirmed
* Shipped
* Delivered
* Cancelled

Orders must store:

* Product
* Customer info
* Affiliate
* Campaign source

---

# 8. Tracking System

The platform must track marketing performance.

Tracked data:

* Page views
* Clicks
* Campaign source
* Affiliate
* Product
* Landing page

Supported traffic sources:

* TikTok
* Instagram
* Push Ads
* Native Ads
* Direct traffic

Tracking must allow analysis of:

* CTR
* Conversion rate
* Sales per campaign

---

# 9. Admin Panel

Admin panel must include:

Dashboard

Products
Orders
Feedback
Affiliates
Landing Pages
Tracking
Settings

Admin must have full control over all features.

---

# 10. Performance Requirements

The platform must be optimized for:

* High traffic
* Fast loading
* SEO friendly pages

The system must support:

* caching
* CDN
* optimized database queries

---

# 11. Future Expansion

The architecture must allow adding:

* email marketing
* SMS notifications
* push notifications
* analytics dashboard
* multi store support
