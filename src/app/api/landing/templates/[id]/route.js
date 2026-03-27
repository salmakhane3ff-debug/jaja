/**
 * GET    /api/landing/templates/[id]  → fetch single template
 * PUT    /api/landing/templates/[id]  → update template
 * DELETE /api/landing/templates/[id]  → delete template
 */
import {
  getTemplateByIdHandler,
  updateTemplateHandler,
  deleteTemplateHandler,
} from '@/lib/controllers/landingPageController';
import { withAdminAuth } from '@/lib/middleware/withAdminAuth';

export const GET    = withAdminAuth(getTemplateByIdHandler);
export const PUT    = withAdminAuth(updateTemplateHandler);
export const DELETE = withAdminAuth(deleteTemplateHandler);
