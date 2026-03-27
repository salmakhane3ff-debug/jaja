/**
 * src/lib/utils/mappers.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Field-name adapters between Prisma models (PostgreSQL) and the shapes the
 * existing Next.js frontend expects (originally from MongoDB / Mongoose).
 *
 * KEY RULE: every response mapper must expose `_id` so that all existing
 * frontend code that accesses `resource._id` continues to work unchanged.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Products ─────────────────────────────────────────────────────────────────

/**
 * Map a Prisma Product record to the frontend-expected shape.
 * Adds `_id` alias + optional currency fields from store settings.
 */
export function mapProduct(product, storeSettings = {}) {
  if (!product) return null;
  return {
    ...product,
    _id: product.id,                                     // backward-compat alias
    currencySymbol: storeSettings.currencySymbol || '$',
    storeCurrency:  storeSettings.storeCurrency  || 'USD',
  };
}

// ── Orders ───────────────────────────────────────────────────────────────────

/**
 * Map a Prisma Order (with included items) to the frontend-expected shape.
 *
 * MongoDB shape the frontend expects:
 *   { _id, name, email, phone, shipping: {...}, products: { items: [...] },
 *     paymentDetails: {...}, status, sessionId, utm_source, createdAt, updatedAt }
 */
export function mapOrder(order) {
  if (!order) return null;
  const {
    id,
    customerName,
    customerEmail,
    customerPhone,
    shippingAddress,
    utmSource,
    items,
    paymentDetails,
    paymentMethod,
    paymentStatus,
    paymentTotal,
    ...rest
  } = order;

  // Reconstruct the paymentDetails object expected by the frontend
  const payDetails = paymentDetails && typeof paymentDetails === 'object'
    ? paymentDetails
    : {};

  // Merge Prisma payment columns back into the paymentDetails object
  const mergedPaymentDetails = {
    paymentMethod: payDetails.paymentMethod || paymentMethod || null,
    status:        payDetails.status        || paymentStatus  || null,
    paymentStatus: payDetails.paymentStatus || paymentStatus  || null,
    total:         payDetails.total         || paymentTotal   || null,
    ...payDetails,
  };

  return {
    // ── MongoDB-compatible fields ──────────────────────────────────────────
    _id:            id,
    name:           customerName,
    email:          customerEmail,
    phone:          customerPhone,
    shipping:       shippingAddress || {},
    products: {
      items: (items || []).map((item) => ({
        _id:          item.id,
        id:           item.id,
        productId:    item.productId,
        quantity:     item.quantity,
        price:        item.price,
        sellingPrice: item.price,
        regularPrice: item.regularPrice,
        ...(item.productSnapshot && typeof item.productSnapshot === 'object'
          ? item.productSnapshot
          : {}),
      })),
    },
    paymentDetails: mergedPaymentDetails,
    utm_source:     utmSource,

    // ── Prisma-native fields (for admin pages that might use them) ─────────
    id,
    customerName,
    customerEmail,
    customerPhone,
    shippingAddress: shippingAddress || {},
    utmSource,

    ...rest,
  };
}

/**
 * Parse a POST/PUT order body (frontend format) into a Prisma-compatible
 * create/update input.
 *
 * Returns:
 *   { ...prismaFields, _items: OrderItem[] }  — caller handles items separately.
 */
export function parseOrderBody(body) {
  const {
    _id, id,
    // Frontend field names
    name, email, phone, shipping,
    // Prisma field names (may arrive on PUT)
    customerName, customerEmail, customerPhone, shippingAddress,
    // Products nested shape
    products,
    // Payment
    paymentDetails,
    paymentMethod,
    paymentStatus,
    paymentTotal,
    // Attribution
    status,
    utm_source, utmSource,
    sessionId,
    affiliateId,
    campaignSource,
    userId,
    // Strip timestamps — we manage these ourselves
    createdAt, updatedAt,
    // Anything else is ignored (prevents unknown-field errors in Prisma)
    ...ignored
  } = body;

  const pymtDetails = paymentDetails && typeof paymentDetails === 'object'
    ? paymentDetails
    : {};

  const addr = shipping || shippingAddress || {};
  const orderItems = products?.items || [];

  return {
    customerName:    name           || customerName    || '',
    customerEmail:   email          || customerEmail   || null,
    customerPhone:   phone          || customerPhone   || null,
    shippingAddress: addr,
    paymentMethod:   pymtDetails.paymentMethod  || paymentMethod  || null,
    paymentStatus:   pymtDetails.status         || pymtDetails.paymentStatus
                     || paymentStatus           || null,
    paymentTotal:    pymtDetails.total          || paymentTotal   || null,
    paymentDetails:  pymtDetails,
    status:          status || 'pending',
    utmSource:       utm_source || utmSource    || null,
    sessionId:       sessionId                  || null,
    affiliateId:     affiliateId                || null,
    campaignSource:  campaignSource             || null,
    userId:          userId                     || null,
    // Timestamp overrides (PUT only)
    ...(createdAt ? { createdAt: new Date(createdAt) } : {}),
    ...(updatedAt ? { updatedAt: new Date(updatedAt) } : {}),
    // Items extracted separately
    _items: orderItems,
  };
}

// ── Users / Admin Profile ─────────────────────────────────────────────────────

/**
 * Strip the password field and expose `_id` for an admin/user profile response.
 */
export function mapUserProfile(user) {
  if (!user) return null;
  // eslint-disable-next-line no-unused-vars
  const { password, ...rest } = user;
  return {
    ...rest,
    _id: user.id,
  };
}
