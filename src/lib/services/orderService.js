/**
 * src/lib/services/orderService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * All order CRUD operations via Prisma.
 *
 * Frontend compatibility notes:
 *   - Input uses MongoDB field names: name/email/phone, shipping, products.items[]
 *   - Output always includes `_id` (alias of Prisma `id`)
 *   - Order.status is stored as plain TEXT so values like "pending", "success",
 *     "failed", "confirmed", "shipped", "delivered", "cancelled" all work
 *   - Timestamp override is supported on PUT (for admin backdating)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import prisma               from '../prisma.js';
import { mapOrder, parseOrderBody } from '../utils/mappers.js';

// ── Analytics helper ──────────────────────────────────────────────────────────
/**
 * Increment ProductAnalytics order counters for every item in a new order.
 *
 * Always increments the grand-total `orders` counter.
 * Additionally increments one source-specific counter based on `orderSource`:
 *   "product"   → productOrders
 *   "landing"   → landingOrders
 *   "affiliate" → affiliateOrders
 *   (anything else / undefined → only the grand total is incremented)
 *
 * Uses upsert so the row is auto-created on first order.
 * Called fire-and-forget — never blocks the order response.
 *
 * @param {Array}  items       — Prisma OrderItem rows (productId + quantity)
 * @param {string} orderSource — "product" | "landing" | "affiliate" | undefined
 */
async function incrementProductOrders(items, orderSource) {
  const updates = (items || []).filter((item) => item.productId);
  if (!updates.length) return;

  // Build the source-specific field name (null → skip source counter)
  const sourceField =
    orderSource === 'product'   ? 'productOrders'   :
    orderSource === 'landing'   ? 'landingOrders'   :
    orderSource === 'affiliate' ? 'affiliateOrders' :
    null;

  await Promise.all(
    updates.map((item) => {
      const qty = item.quantity ?? 1;

      const createData = {
        productId:    item.productId,
        orders:       qty,
        ...(sourceField ? { [sourceField]: qty } : {}),
      };

      const updateData = {
        orders: { increment: qty },
        ...(sourceField ? { [sourceField]: { increment: qty } } : {}),
      };

      return prisma.productAnalytics.upsert({
        where:  { productId: item.productId },
        create: createData,
        update: updateData,
      });
    })
  );
}

// ── Reads ─────────────────────────────────────────────────────────────────────

/** All orders, newest first. */
export async function getAllOrders() {
  const orders = await prisma.order.findMany({
    include:  { items: true },
    orderBy:  { createdAt: 'desc' },
  });
  return orders.map(mapOrder);
}

/**
 * Search orders by orderId (id or sessionId), phone, or email.
 * Any combination of the three may be provided.
 */
export async function searchOrders({ orderId, phone, email }) {
  const OR = [];

  if (orderId) {
    OR.push({ sessionId: orderId });
    OR.push({ id: orderId });
  }
  if (phone) {
    OR.push({ customerPhone: phone });
  }
  if (email) {
    OR.push({ customerEmail: email });
  }

  const orders = await prisma.order.findMany({
    where:   OR.length > 0 ? { OR } : {},
    include: { items: true },
    orderBy: { createdAt: 'desc' },
  });
  return orders.map(mapOrder);
}

// ── Writes ────────────────────────────────────────────────────────────────────

/**
 * Create a new order from the frontend checkout payload.
 *
 * Handles sessionId deduplication: if an order with the same sessionId
 * already exists, returns it without creating a duplicate.
 *
 * Returns: { duplicate: boolean, order: MappedOrder }
 */
export async function createOrder(body) {
  const { sessionId, orderSource } = body;
  // Normalise orderSource — accept only known values, default to undefined
  const validSource = ['product', 'landing', 'affiliate'].includes(orderSource)
    ? orderSource
    : undefined;

  // ── Dedup check ──────────────────────────────────────────────────────────
  if (sessionId) {
    const existing = await prisma.order.findUnique({
      where:   { sessionId },
      include: { items: true },
    });
    if (existing) {
      return { duplicate: true, order: mapOrder(existing) };
    }
  }

  // ── Parse body into Prisma-compatible fields ─────────────────────────────
  const { _items, createdAt: _createdAt, updatedAt: _updatedAt, ...orderData } = parseOrderBody(body);

  const order = await prisma.order.create({
    data: {
      ...orderData,
      items: {
        create: _items.map((item) => ({
          // productId is nullable — null is safe when no valid UUID is available.
          // productSnapshot captures title/images/variants at purchase time, so
          // order display never depends on the product row still existing.
          productId:       item.productId || item._id || null,
          quantity:        item.isFreeGift ? 1 : (item.quantity || 1),
          price:           item.isFreeGift ? 0 : (item.price || item.sellingPrice || 0),
          regularPrice:    item.isFreeGift ? 0 : (item.regularPrice || null),
          productSnapshot: {
            title:    item.title,
            images:   item.images   || [],
            variants: item.variants || [],
          },
        })),
      },
    },
    include: { items: true },
  });

  // ── Fire-and-forget analytics (never blocks order response) ─────────────
  incrementProductOrders(order.items, validSource).catch((err) =>
    console.error('[productAnalytics] increment failed:', err?.message ?? err)
  );

  return { duplicate: false, order: mapOrder(order) };
}

/**
 * Update an order by its Prisma `id` (= the `_id` the frontend sends).
 *
 * Only known Prisma columns are written; extra unknown keys are silently
 * discarded so that the flexible old MongoDB behaviour is preserved without
 * risking Prisma "unknown field" errors.
 *
 * Returns the mapped order, or null when not found.
 */
export async function updateOrder(id, body) {
  // Pull out all known fields; ignore the rest
  const {
    _id, id: _bodyId,
    name, customerName,
    email, customerEmail,
    phone, customerPhone,
    shipping, shippingAddress,
    products: _products,
    paymentDetails,
    paymentMethod,
    paymentStatus,
    paymentTotal,
    status,
    utm_source, utmSource,
    sessionId,
    affiliateId,
    campaignSource,
    userId,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
  } = body;

  const pymtDetails =
    paymentDetails && typeof paymentDetails === 'object' ? paymentDetails : null;

  const data = {};

  if (name          !== undefined) data.customerName    = name;
  if (customerName  !== undefined) data.customerName    = customerName;
  if (email         !== undefined) data.customerEmail   = email;
  if (customerEmail !== undefined) data.customerEmail   = customerEmail;
  if (phone         !== undefined) data.customerPhone   = phone;
  if (customerPhone !== undefined) data.customerPhone   = customerPhone;

  if (shipping        !== undefined) data.shippingAddress = shipping;
  if (shippingAddress !== undefined) data.shippingAddress = shippingAddress;

  if (pymtDetails !== null) {
    data.paymentDetails  = pymtDetails;
    if (pymtDetails.paymentMethod)                data.paymentMethod  = pymtDetails.paymentMethod;
    if (pymtDetails.status || pymtDetails.paymentStatus)
      data.paymentStatus = pymtDetails.status || pymtDetails.paymentStatus;
    if (pymtDetails.total)                        data.paymentTotal   = pymtDetails.total;
  }
  if (paymentMethod  !== undefined) data.paymentMethod  = paymentMethod;
  if (paymentStatus  !== undefined) data.paymentStatus  = paymentStatus;
  if (paymentTotal   !== undefined) data.paymentTotal   = paymentTotal;

  if (status        !== undefined) data.status   = status;
  if (utm_source    !== undefined) data.utmSource = utm_source;
  if (utmSource     !== undefined) data.utmSource = utmSource;
  if (sessionId     !== undefined) data.sessionId = sessionId;
  if (affiliateId   !== undefined) data.affiliateId   = affiliateId;
  if (campaignSource !== undefined) data.campaignSource = campaignSource;
  if (userId        !== undefined) data.userId    = userId;

  // Timestamp overrides (admin backdating)
  if (_createdAt !== undefined) data.createdAt = new Date(_createdAt);
  if (_updatedAt !== undefined) data.updatedAt = new Date(_updatedAt);

  try {
    const order = await prisma.order.update({
      where:   { id },
      data,
      include: { items: true },
    });
    return mapOrder(order);
  } catch (err) {
    if (err.code === 'P2025') return null; // record not found
    throw err;
  }
}

/** Delete an order by its Prisma UUID. Returns true on success, false if not found. */
export async function deleteOrder(id) {
  try {
    await prisma.order.delete({ where: { id } });
    return true;
  } catch (err) {
    if (err.code === 'P2025') return false;
    throw err;
  }
}
