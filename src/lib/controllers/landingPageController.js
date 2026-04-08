/**
 * src/lib/controllers/landingPageController.js
 * ─────────────────────────────────────────────────────────────────────────────
 * GET    /api/landing-page          → admin: all pages  |  public: active pages
 * POST   /api/landing-page          → admin: create
 * PUT    /api/landing-page          → admin: update
 * DELETE /api/landing-page          → admin: delete
 * GET    /api/landing-page/[slug]   → public: page by slug (increments views)
 * POST   /api/landing-page/[slug]   → increment click counter (CTA click)
 *
 * POST   /api/landing/track-view    → track a page view   (public, non-blocking)
 * POST   /api/landing/track-click   → track a CTA click   (public, non-blocking)
 * POST   /api/landing/track-order   → track a conversion  (public, non-blocking)
 *
 * GET    /api/landing/templates     → list all saved templates
 * POST   /api/landing/templates     → create / save-as-template
 * GET    /api/landing/templates/[id]   → single template
 * PUT    /api/landing/templates/[id]   → update template
 * DELETE /api/landing/templates/[id]   → delete template
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  getAllLandingPages,
  getActiveLandingPages,
  getLandingPageBySlug,
  getLandingPageById,
  createLandingPage,
  updateLandingPage,
  deleteLandingPage,
  incrementClicks,
  trackLandingEvent,
  getAllTemplates,
  getTemplateById,
  createTemplate,
  updateTemplate,
  deleteTemplate,
} from '../services/landingPageService.js';
import { badRequest, notFound, serverError } from '../utils/apiResponse.js';

// ── GET /api/landing-page ─────────────────────────────────────────────────────

export async function getLandingPagesHandler(req) {
  try {
    const { searchParams } = new URL(req.url);
    const admin = searchParams.get('admin') === 'true';
    const id    = searchParams.get('id')    || null;

    if (id) {
      const lp = await getLandingPageById(id);
      if (!lp) return notFound('Landing page not found');
      return Response.json(lp);
    }

    const pages = admin
      ? await getAllLandingPages()
      : await getActiveLandingPages();

    return Response.json(pages);
  } catch (err) {
    console.error('LandingPage GET error:', err);
    return serverError('Failed to fetch landing pages');
  }
}

// ── POST /api/landing-page ────────────────────────────────────────────────────

export async function createLandingPageHandler(req) {
  try {
    const body = await req.json();
    const { title, slug, isActive, sections, heroTitle, heroSubtitle, description, images, productId, templateType } = body;

    if (!title) return badRequest('title is required');

    const lp = await createLandingPage({
      title, slug, isActive, sections, heroTitle, heroSubtitle,
      description, images, productId, templateType,
    });
    return Response.json(lp, { status: 201 });
  } catch (err) {
    if (err.code === 'P2002') return badRequest('A landing page with this slug already exists');
    console.error('LandingPage POST error:', err);
    return serverError('Failed to create landing page');
  }
}

// ── PUT /api/landing-page ─────────────────────────────────────────────────────

export async function updateLandingPageHandler(req) {
  try {
    const body = await req.json();
    const { _id, id, ...rest } = body;
    const lpId = _id || id;

    if (!lpId) return badRequest('_id is required for update');

    const lp = await updateLandingPage(lpId, rest);
    if (!lp) return notFound('Landing page not found');

    return Response.json(lp);
  } catch (err) {
    if (err.code === 'P2002') return badRequest('A landing page with this slug already exists');
    console.error('LandingPage PUT error:', err);
    return serverError('Failed to update landing page');
  }
}

// ── DELETE /api/landing-page ──────────────────────────────────────────────────

export async function deleteLandingPageHandler(req) {
  try {
    const body = await req.json();
    const { _id, id } = body;
    const lpId = _id || id;

    if (!lpId) return badRequest('_id is required for delete');

    const deleted = await deleteLandingPage(lpId);
    if (!deleted) return notFound('Landing page not found');

    return Response.json({ message: 'Landing page deleted', _id: lpId });
  } catch (err) {
    console.error('LandingPage DELETE error:', err);
    return serverError('Failed to delete landing page');
  }
}

// ── GET /api/landing-page/[slug] (public) ─────────────────────────────────────

export async function getLandingPageBySlugHandler(req, context) {
  try {
    const { slug } = await context.params;
    const lp = await getLandingPageBySlug(slug);
    if (!lp) return notFound('Landing page not found');
    return Response.json(lp);
  } catch (err) {
    console.error('LandingPage slug GET error:', err);
    return serverError('Failed to fetch landing page');
  }
}

// ── POST /api/landing-page/[slug] (CTA click) ─────────────────────────────────

export async function recordLandingPageClickHandler(req, context) {
  try {
    const { slug } = await context.params;
    const lp = await getLandingPageBySlug(slug);
    if (!lp) return notFound('Landing page not found');
    await incrementClicks(lp.id);
    return Response.json({ ok: true });
  } catch (err) {
    console.error('LandingPage click POST error:', err);
    return serverError('Failed to record click');
  }
}

// ── POST /api/landing/track-view ─────────────────────────────────────────────

export async function trackViewHandler(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const { landingPageId, affiliateId, metadata } = body || {};
    if (!landingPageId) return badRequest('landingPageId is required');
    await trackLandingEvent(landingPageId, 'view', affiliateId, metadata);
    return Response.json({ ok: true });
  } catch (err) {
    console.error('track-view error:', err);
    return Response.json({ ok: false }, { status: 500 });
  }
}

// ── POST /api/landing/track-click ─────────────────────────────────────────────

export async function trackClickHandler(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const { landingPageId, affiliateId, metadata } = body || {};
    if (!landingPageId) return badRequest('landingPageId is required');
    await trackLandingEvent(landingPageId, 'click', affiliateId, metadata);
    return Response.json({ ok: true });
  } catch (err) {
    console.error('track-click error:', err);
    return Response.json({ ok: false }, { status: 500 });
  }
}

// ── POST /api/landing/track-order ─────────────────────────────────────────────

export async function trackOrderHandler(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const { landingPageId, affiliateId, metadata } = body || {};
    if (!landingPageId) return badRequest('landingPageId is required');
    await trackLandingEvent(landingPageId, 'order', affiliateId, metadata);
    return Response.json({ ok: true });
  } catch (err) {
    console.error('track-order error:', err);
    return Response.json({ ok: false }, { status: 500 });
  }
}

// ── Templates ─────────────────────────────────────────────────────────────────

export async function getTemplatesHandler(_req) {
  try {
    const templates = await getAllTemplates();
    return Response.json(templates);
  } catch (err) {
    console.error('Templates GET error:', err);
    return serverError('Failed to fetch templates');
  }
}

export async function createTemplateHandler(req) {
  try {
    const body = await req.json();
    const { name, description, templateType, content, previewImage } = body;
    if (!name) return badRequest('name is required');
    const template = await createTemplate({ name, description, templateType, content, previewImage });
    return Response.json(template, { status: 201 });
  } catch (err) {
    console.error('Template POST error:', err);
    return serverError('Failed to create template');
  }
}

export async function getTemplateByIdHandler(req, context) {
  try {
    const { id } = await context.params;
    const template = await getTemplateById(id);
    if (!template) return notFound('Template not found');
    return Response.json(template);
  } catch (err) {
    console.error('Template GET by id error:', err);
    return serverError('Failed to fetch template');
  }
}

export async function updateTemplateHandler(req, context) {
  try {
    const { id } = await context.params;
    const body = await req.json();
    const updated = await updateTemplate(id, body);
    if (!updated) return notFound('Template not found');
    return Response.json(updated);
  } catch (err) {
    console.error('Template PUT error:', err);
    return serverError('Failed to update template');
  }
}

export async function deleteTemplateHandler(req, context) {
  try {
    const { id } = await context.params;
    const deleted = await deleteTemplate(id);
    if (!deleted) return notFound('Template not found');
    return Response.json({ message: 'Template deleted', id });
  } catch (err) {
    console.error('Template DELETE error:', err);
    return serverError('Failed to delete template');
  }
}
