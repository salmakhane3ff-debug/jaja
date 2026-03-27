# AI_DEVELOPER_GUIDE.md

## Purpose

This document explains how the AI assistant should work when developing this project.

The AI must always follow the project structure, rules, and features described in the following files:

* PROJECT_STRUCTURE.md
* PROJECT_RULES.md
* FEATURES.md
* TASKS.md

The AI must read these files before implementing any feature.

---

# Development Principles

1. The AI must not create random architecture.

2. The AI must follow the defined project structure.

3. The AI must implement features step by step.

4. The AI must write clean and modular code.

5. Each feature must be implemented in its own module.

6. The system must remain scalable.

---

# Backend Architecture

Backend must use:

Node.js with Express.

Main layers:

Controllers
Services
Models
Routes
Middleware

Each feature must follow this pattern.

Example:

Product feature:

models/Product.js
controllers/productController.js
routes/products.js
services/productService.js

---

# Database

Database must be PostgreSQL.

Use Prisma ORM.

Database must support:

Products
Orders
Feedback
Affiliate
Landing Pages
Tracking

All models must be defined in schema.prisma.

---

# Frontend

Frontend must be component-based.

Main areas:

Homepage
Product pages
Checkout pages
Feedback pages
Affiliate dashboard

Reusable components must be used.

---

# Admin Panel

Admin panel must control all system features.

Admin modules:

Dashboard
Products
Orders
Feedback
Affiliate
Landing Pages
Tracking
Settings

Each module must have clear APIs.

---

# Affiliate Tracking

Affiliate tracking is critical.

Rules:

Affiliate URL format:

site.com/username

If a visitor arrives from an affiliate link:

The affiliate must remain stored in session or cookies.

Affiliate must be attached to:

Orders
Clicks
Page views

Removing the username from the URL must not remove tracking.

---

# Feedback System

Feedback must support:

Text
Image
Audio

Feedback can appear in:

Product page
Homepage slider
Landing pages
Feedback page

Admin must approve or schedule feedback.

---

# Landing Page Builder

Landing pages must support modular sections.

Supported sections:

Hero
Video
BeforeAfter
Gallery
Feedback
FAQ
CTA

Each section must be configurable.

Landing pages must track:

Views
Clicks
Sales
CTR

---

# Tracking System

Tracking system must record:

Clicks
Page views
Campaign source
Affiliate ID
Product ID
Landing page ID

Tracking must allow campaign performance analysis.

---

# Code Quality Rules

The AI must always:

Write modular code
Avoid large monolithic files
Use reusable components
Use clean API structure

---

# Performance

The platform must support high traffic.

Important optimizations:

Caching
Database indexing
Optimized queries

---

# Development Process

The AI must follow TASKS.md step by step.

Do not skip steps.

Do not implement features outside the defined architecture.

---

# Important Rule

The AI must prioritize:

Stability
Performance
Scalability

The system should be built as a long-term platform.
