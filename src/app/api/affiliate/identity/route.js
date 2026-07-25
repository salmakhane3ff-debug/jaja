/**
 * /api/affiliate/identity
 * GET  → this affiliate's verification status (NO document keys/urls ever)
 * POST → submit/resubmit both CIN images (multipart: front, back)
 *
 * Auth: withAffiliateAuth — the affiliate can only ever touch their OWN record
 * (affiliateId comes from the verified token, never from the request body).
 */
import { withAffiliateAuth } from '@/lib/middleware/withAffiliateAuth';
import { getIdentityStatus, submitIdentity } from '@/lib/services/identityService';
import { CIN_MAX_BYTES } from '@/lib/identityStorage';

export const dynamic = 'force-dynamic';

async function getHandler(req, _ctx, decoded) {
  try {
    const status = await getIdentityStatus(decoded.affiliateId);
    return Response.json(status);
  } catch (err) {
    console.error('affiliate/identity GET error:', err);
    return Response.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

async function readFile(form, field) {
  const f = form.get(field);
  if (!f || typeof f.arrayBuffer !== 'function') return null;
  const buffer = Buffer.from(await f.arrayBuffer());
  return { buffer, mime: f.type || '', size: buffer.length };
}

async function postHandler(req, _ctx, decoded) {
  try {
    const form = await req.formData();
    const front = await readFile(form, 'front');
    const back  = await readFile(form, 'back');
    if (!front || !back) {
      return Response.json({ error: 'Les deux faces de la CIN sont requises.', code: 'CIN_BOTH_REQUIRED' }, { status: 400 });
    }
    // Cheap size guard before any heavy processing.
    if (front.size > CIN_MAX_BYTES || back.size > CIN_MAX_BYTES) {
      return Response.json({ error: 'Chaque image doit faire au maximum 5 Mo.', code: 'CIN_INVALID_FILE' }, { status: 400 });
    }

    const result = await submitIdentity(decoded.affiliateId, { front, back });
    return Response.json(result);
  } catch (err) {
    const clientCodes = new Set([
      'CIN_BOTH_REQUIRED', 'CIN_INVALID_FILE', 'CIN_INVALID_IMAGE',
      'IDENTITY_ALREADY_APPROVED', 'IDENTITY_ALREADY_PENDING',
    ]);
    if (clientCodes.has(err.code)) {
      return Response.json({ error: err.message, code: err.code, details: err.details }, { status: 400 });
    }
    console.error('affiliate/identity POST error:', err);
    return Response.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export const GET  = withAffiliateAuth(getHandler);
export const POST = withAffiliateAuth(postHandler);
