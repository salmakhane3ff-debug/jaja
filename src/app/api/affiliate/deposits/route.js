/**
 * /api/affiliate/deposits
 * GET  → { summary:{approvedBalance,pendingTotal}, deposits:[…] } for THIS affiliate
 * POST → submit a new deposit request (multipart: amount, paymentMethod,
 *        transferReference?, affiliateNote?, proof file)
 *
 * affiliateId always comes from the verified session token — never the body.
 */
import { withAffiliateAuth } from '@/lib/middleware/withAffiliateAuth';
import { rateLimit } from '@/lib/rateLimit';
import { getDepositSummary, getAffiliateDeposits, submitDeposit } from '@/lib/services/depositService';
import { DEPOSIT_MAX_BYTES } from '@/lib/depositStorage';

export const dynamic = 'force-dynamic';

async function getHandler(req, _ctx, decoded) {
  try {
    const [summary, deposits] = await Promise.all([
      getDepositSummary(decoded.affiliateId),
      getAffiliateDeposits(decoded.affiliateId),
    ]);
    return Response.json({ summary, deposits });
  } catch (err) {
    console.error('affiliate/deposits GET error:', err);
    return Response.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

async function postHandler(req, _ctx, decoded) {
  const limited = rateLimit(req, 'deposit_submit', { max: 10, windowMs: 60_000 });
  if (limited) return limited;
  try {
    const form = await req.formData();
    const file = form.get('proof');
    if (!file || typeof file.arrayBuffer !== 'function') {
      return Response.json({ error: 'La preuve du virement est requise.', code: 'DEPOSIT_NO_PROOF' }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.length > DEPOSIT_MAX_BYTES) {
      return Response.json({ error: 'Fichier trop volumineux (max 8 Mo).', code: 'DEPOSIT_INVALID_FILE' }, { status: 400 });
    }

    const created = await submitDeposit(decoded.affiliateId, {
      amount:            form.get('amount'),
      paymentMethod:     form.get('paymentMethod'),
      transferReference: form.get('transferReference'),
      affiliateNote:     form.get('affiliateNote'),
      proof: { buffer, mime: file.type || '', size: buffer.length },
    });
    return Response.json(created, { status: 201 });
  } catch (err) {
    const clientCodes = new Set(['DEPOSIT_INVALID_AMOUNT', 'DEPOSIT_NO_METHOD', 'DEPOSIT_NO_PROOF', 'DEPOSIT_INVALID_FILE', 'DEPOSIT_PENDING_EXISTS']);
    if (clientCodes.has(err.code)) {
      return Response.json({ error: err.message, code: err.code }, { status: 400 });
    }
    console.error('affiliate/deposits POST error:', err);
    return Response.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export const GET  = withAffiliateAuth(getHandler);
export const POST = withAffiliateAuth(postHandler);
