/**
 * src/lib/services/landingPageService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Landing page system backed by the `landing_pages` table.
 *
 * Each landing page is a modular, section-based marketing page.
 * Sections are stored as a JSON array — the frontend renders them based on type.
 *
 * Section types (open string — extend freely):
 *   hero | image | text | video | beforeAfter | features | reviews | cta
 *   countdown | productCard | trustBadges | faq | spacer
 *
 * Performance counters (views, clicks, sales) are incremented atomically.
 * LandingEvent rows are inserted for granular analytics.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import prisma from '../prisma.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapLandingPage(lp, includeProducts = false, product = null) {
  if (!lp) return null;
  return {
    _id: lp.id,
    ...lp,
    product: product ? {
      _id:              product.id,
      title:            product.title,
      images:           product.images,
      regularPrice:     product.regularPrice,
      salePrice:        product.salePrice,
      rating:           product.rating,
      ratingsCount:     product.ratingsCount,
      reviewsCount:     product.reviewsCount,
      shortDescription: product.shortDescription,
      description:      product.description,
      stockStatus:      product.stockStatus,
    } : undefined,
    products: includeProducts && lp.products
      ? lp.products.map((p) => ({
          _id: p.id, title: p.title, images: p.images,
          regularPrice: p.regularPrice, salePrice: p.salePrice,
        }))
      : undefined,
  };
}

function makeSlug(title) {
  if (!title) return `page-${Date.now()}`;
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || `page-${Date.now()}`;
}

// ── Product fields to select ───────────────────────────────────────────────────

const PRODUCT_SELECT = {
  id: true, title: true, images: true,
  regularPrice: true, salePrice: true,
  rating: true, ratingsCount: true, reviewsCount: true,
  shortDescription: true, description: true, stockStatus: true,
};

// ── Reads ─────────────────────────────────────────────────────────────────────

/** List all landing pages (admin — includes inactive). */
export async function getAllLandingPages() {
  const rows = await prisma.landingPage.findMany({
    orderBy: { createdAt: 'desc' },
  });
  return rows.map((lp) => mapLandingPage(lp));
}

/** List only active landing pages (public). */
export async function getActiveLandingPages() {
  const rows = await prisma.landingPage.findMany({
    where:   { isActive: true },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map((lp) => mapLandingPage(lp));
}

/**
 * Get a landing page by its slug (public).
 * Increments the view counter atomically.
 * Includes linked products + primary product.
 */
export async function getLandingPageBySlug(slug) {
  const [, lp] = await prisma.$transaction([
    prisma.landingPage.updateMany({
      where: { slug, isActive: true },
      data:  { views: { increment: 1 } },
    }),
    prisma.landingPage.findFirst({
      where:   { slug, isActive: true },
      include: { products: { select: PRODUCT_SELECT } },
    }),
  ]);
  if (!lp) return null;
  // Fetch primary product if set
  const product = lp.productId
    ? await prisma.product.findUnique({ where: { id: lp.productId }, select: PRODUCT_SELECT })
    : null;
  return mapLandingPage(lp, true, product);
}

/** Get a landing page by id (admin, no view increment). */
export async function getLandingPageById(id) {
  const lp = await prisma.landingPage.findUnique({
    where:   { id },
    include: { products: { select: PRODUCT_SELECT } },
  });
  if (!lp) return null;
  const product = lp.productId
    ? await prisma.product.findUnique({ where: { id: lp.productId }, select: PRODUCT_SELECT })
    : null;
  return mapLandingPage(lp, true, product);
}

// ── Writes ────────────────────────────────────────────────────────────────────

/** Create a new landing page. */
export async function createLandingPage({
  title, slug, isActive = true, sections = [],
  heroTitle, heroSubtitle, description, images = [], productId,
  templateType = 'classic',
}) {
  const finalSlug = slug || makeSlug(title);

  const lp = await prisma.landingPage.create({
    data: {
      title,
      slug:         finalSlug,
      isActive:     Boolean(isActive),
      sections:     sections ?? [],
      heroTitle:    heroTitle    || null,
      heroSubtitle: heroSubtitle || null,
      description:  description  || null,
      images:       images       ?? [],
      productId:    productId    || null,
      templateType: templateType || 'classic',
    },
  });
  return mapLandingPage(lp);
}

/**
 * Update a landing page.
 * Only supplied fields are changed.
 */
export async function updateLandingPage(id, body) {
  // Strip server-managed / relational fields — everything else is fair game
  // eslint-disable-next-line no-unused-vars
  const { _id, id: bodyId, createdAt, updatedAt, products, landingEvents, views, clicks, sales, ...safe } = body;

  if (safe.title && !safe.slug) {
    safe.slug = makeSlug(safe.title);
  }

  try {
    const lp = await prisma.landingPage.update({ where: { id }, data: safe });
    return mapLandingPage(lp);
  } catch (err) {
    if (err.code === 'P2025') return null;
    throw err;
  }
}

/** Delete a landing page by id. */
export async function deleteLandingPage(id) {
  try {
    await prisma.landingPage.delete({ where: { id } });
    return true;
  } catch (err) {
    if (err.code === 'P2025') return false;
    throw err;
  }
}

// ── Counter increments ────────────────────────────────────────────────────────

/** Increment the click counter (CTA button clicked). */
export async function incrementClicks(id) {
  return prisma.landingPage.update({
    where: { id },
    data:  { clicks: { increment: 1 } },
  }).catch(() => null);
}

/** Increment the sales counter (order completed). */
export async function incrementSales(id) {
  return prisma.landingPage.update({
    where: { id },
    data:  { sales: { increment: 1 } },
  }).catch(() => null);
}

// ── Event tracking ────────────────────────────────────────────────────────────

/**
 * Record a granular tracking event AND increment the matching page counter.
 * type: "view" | "click" | "order"
 */
export async function trackLandingEvent(landingPageId, type, affiliateId = null, metadata = null) {
  const counterField = type === 'view' ? 'views' : type === 'click' ? 'clicks' : type === 'order' ? 'sales' : null;

  await prisma.$transaction([
    prisma.landingEvent.create({
      data: {
        landingPageId,
        type,
        affiliateId: affiliateId || null,
        metadata:    metadata    || undefined,
      },
    }),
    ...(counterField
      ? [prisma.landingPage.update({
          where: { id: landingPageId },
          data:  { [counterField]: { increment: 1 } },
        })]
      : []),
  ]).catch(() => null); // non-blocking — tracking should never crash the page
}

// ── Templates ─────────────────────────────────────────────────────────────────

/** List all saved landing templates. */
export async function getAllTemplates() {
  return prisma.landingTemplate.findMany({ orderBy: { createdAt: 'desc' } });
}

/** Get a single template by id. */
export async function getTemplateById(id) {
  return prisma.landingTemplate.findUnique({ where: { id } });
}

/** Create a new landing template (save current page as template). */
export async function createTemplate({ name, description, templateType, content, previewImage }) {
  return prisma.landingTemplate.create({
    data: {
      name,
      description:  description  || null,
      templateType: templateType || 'custom',
      content:      content      ?? [],
      previewImage: previewImage  || null,
    },
  });
}

/** Update an existing template. */
export async function updateTemplate(id, data) {
  // eslint-disable-next-line no-unused-vars
  const { id: _id, createdAt, updatedAt, ...safe } = data;
  try {
    return await prisma.landingTemplate.update({ where: { id }, data: safe });
  } catch (err) {
    if (err.code === 'P2025') return null;
    throw err;
  }
}

/** Delete a template. */
export async function deleteTemplate(id) {
  try {
    await prisma.landingTemplate.delete({ where: { id } });
    return true;
  } catch (err) {
    if (err.code === 'P2025') return false;
    throw err;
  }
}
