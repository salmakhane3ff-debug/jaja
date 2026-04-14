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
/**
 * Create a new order with FULL server-side price resolution.
 *
 * SECURITY MODEL:
 *   - item.price / item.sellingPrice / item.discount are IGNORED entirely
 *   - Every paid item's price is fetched from prisma.product
 *   - Gift items require a valid giftId that resolves in prisma.gift
 *   - order.status is ALWAYS forced to 'pending'
 *   - All financial values come from the database, never from the client
 */
export async function createOrder(body) {
  const { sessionId, orderSource } = body;
  const validSource = ['product', 'landing', 'affiliate'].includes(orderSource)
    ? orderSource
    : undefined;

  // ── Dedup check ──────────────────────────────────────────────────────────
  if (sessionId) {
    const existing = await prisma.order.findUnique({
      where:   { sessionId },
      include: { items: true },
    });
    if (existing) return { duplicate: true, order: mapOrder(existing) };
  }

  const { _items, createdAt: _createdAt, updatedAt: _updatedAt, ...orderData } = parseOrderBody(body);

  // SECURITY: Force status — never trust client
  orderData.status = 'pending';

  // ── Validate affiliateId FK to prevent P2003 ──────────────────────────────
  // The client stores affiliateId in localStorage which can be stale, from a
  // different environment, or simply wrong. A bad ID causes a FK violation and
  // kills the entire order. Verify it exists; null it out silently if not.
  if (orderData.affiliateId) {
    const affiliateExists = await prisma.affiliate.count({
      where: { id: orderData.affiliateId },
    });
    if (affiliateExists === 0) {
      console.warn(`[order] affiliateId "${orderData.affiliateId}" not found — cleared`);
      orderData.affiliateId = null;
    }
  }

  if (orderData.userId) {
    const userExists = await prisma.user.count({
      where: { id: orderData.userId },
    });
    if (userExists === 0) {
      orderData.userId = null;
    }
  }

  if (!_items || _items.length === 0) {
    throw Object.assign(new Error('Order must contain at least one item'), { code: 'EMPTY_ORDER' });
  }

  // ── Batch-fetch gifts first, then all products in one query ─────────────
  // ORDER: gifts → paid products + gift products together.
  // This prevents P2003 FK violations: OrderItem.productId must exist in
  // the products table. Gift items use the productId from the Gift DB record
  // (not the client-supplied value). We verify it exists before using it.
  const clientGiftIds = [...new Set(
    _items.map((i) => i.giftId || i._giftId).filter(Boolean),
  )];

  const paidProductIds = [...new Set(
    _items
      .filter((i) => !(i.isFreeGift && (i.giftId || i._giftId)))
      .map((i) => i.productId || i._id)
      .filter(Boolean),
  )];

  // Step 1: fetch gifts
  const dbGifts = clientGiftIds.length > 0
    ? await prisma.gift.findMany({
        where:  { id: { in: clientGiftIds }, active: true },
        select: { id: true, productId: true },
      })
    : [];

  // Step 2: collect all productIds we need (paid + gift product refs)
  const giftProductIds = dbGifts.map((g) => g.productId).filter(Boolean);
  const allProductIds  = [...new Set([...paidProductIds, ...giftProductIds])];

  // Step 3: single product fetch covers both paid items and gift products
  const dbProducts = allProductIds.length > 0
    ? await prisma.product.findMany({
        where:  { id: { in: allProductIds } },
        select: { id: true, salePrice: true, regularPrice: true, isActive: true },
      })
    : [];

  const productMap   = new Map(dbProducts.map((p) => [p.id, p]));
  const validGiftIds = new Set(dbGifts.map((g) => g.id));
  // giftId → verified DB productId (null when the product row is missing)
  const giftProductMap = new Map(
    dbGifts.map((g) => [g.id, productMap.has(g.productId) ? g.productId : null]),
  );

  // ── Resolve server-authoritative price for every item ────────────────────
  const resolvedItems = [];

  for (const item of _items) {
    const rawId          = item.productId || item._id || null;
    const resolvedGiftId = item.giftId || item._giftId || null;
    const isGift         = Boolean(item.isFreeGift && resolvedGiftId && validGiftIds.has(resolvedGiftId));

    if (isGift) {
      // Use the DB-verified productId from giftProductMap (satisfies FK constraint).
      // Falls back to null — OrderItem.productId is optional in schema.
      resolvedItems.push({
        productId:       giftProductMap.get(resolvedGiftId) ?? null,
        quantity:        1,
        price:           0,
        regularPrice:    null,
        productSnapshot: { title: item.title, images: item.images || [], variants: item.variants || [] },
      });
      continue;
    }

    // ── Paid item: must have a real productId with a live DB price ────────
    if (!rawId) {
      throw Object.assign(
        new Error('productId is required for all non-gift items'),
        { code: 'MISSING_PRODUCT_ID' },
      );
    }

    const dbProduct = productMap.get(rawId);
    if (!dbProduct) {
      throw Object.assign(
        new Error(`Product not found: ${rawId}`),
        { code: 'PRODUCT_NOT_FOUND' },
      );
    }
    if (!dbProduct.isActive) {
      throw Object.assign(
        new Error(`Product is unavailable: ${rawId}`),
        { code: 'PRODUCT_INACTIVE' },
      );
    }

    // Canonical server-side price: salePrice takes precedence over regularPrice
    const price = dbProduct.salePrice ?? dbProduct.regularPrice ?? 0;
    if (!Number.isFinite(price) || price < 0) {
      throw Object.assign(new Error(`Product has an invalid price: ${rawId}`), { code: 'INVALID_PRICE' });
    }

    const qty = parseInt(item.quantity, 10) || 1;
    if (!Number.isInteger(qty) || qty < 1 || qty > 1000) {
      throw Object.assign(new Error('Quantity must be between 1 and 1000'), { code: 'INVALID_QUANTITY' });
    }

    resolvedItems.push({
      productId:       rawId,
      quantity:        qty,
      price,                                    // ← always from DB
      regularPrice:    dbProduct.regularPrice ?? null,
      productSnapshot: { title: item.title, images: item.images || [], variants: item.variants || [] },
    });
  }

  // ── Persist inside a transaction so order + items are atomic ─────────────
  const order = await prisma.$transaction(async (tx) => {
    return tx.order.create({
      data: {
        ...orderData,
        items: { create: resolvedItems },
      },
      include: { items: true },
    });
  });

  // Fire-and-forget analytics — never blocks the order response
  incrementProductOrders(order.items, validSource).catch((err) =>
    console.error('[productAnalytics] increment failed:', err?.message ?? err),
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
    if (pymtDetails.total) {
      const pt = parseFloat(pymtDetails.total);
      if (Number.isFinite(pt) && pt >= 0 && pt <= 1_000_000) data.paymentTotal = pt;
    }
  }
  if (paymentMethod  !== undefined) data.paymentMethod  = paymentMethod;
  if (paymentStatus  !== undefined) data.paymentStatus  = paymentStatus;
  if (paymentTotal   !== undefined) {
    const pt = parseFloat(paymentTotal);
    if (!Number.isFinite(pt) || pt < 0 || pt > 1_000_000) {
      throw Object.assign(new Error('paymentTotal must be a finite number between 0 and 1,000,000'), { code: 'INVALID_PAYMENT_TOTAL' });
    }
    data.paymentTotal = pt;
  }

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
