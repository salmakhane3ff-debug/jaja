/**
 * GET  /api/landing/templates  → list all saved templates
 * POST /api/landing/templates  → create / save current page as template
 */
import { getTemplatesHandler, createTemplateHandler } from '@/lib/controllers/landingPageController';
import { withAdminAuth } from '@/lib/middleware/withAdminAuth';

export const GET  = withAdminAuth(getTemplatesHandler);
export const POST = withAdminAuth(createTemplateHandler);
