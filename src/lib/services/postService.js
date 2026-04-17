/**
 * src/lib/services/postService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * CRUD for the `posts` table (Blog posts AND CMS Pages share the same table,
 * differentiated by the `category` column: "Blog" | "Page").
 *
 * Frontend compatibility:
 *   - MongoDB used a flat document with all fields at the top level.
 *   - Prisma promotes title/slug/category/status to proper columns for
 *     indexing; everything else lives in the `data` JSONB column.
 *   - mapPost() re-flattens the record before returning to callers so the
 *     API response shape is identical to the old MongoDB output.
 *   - `_id` alias matches MongoDB `_id` field.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import prisma from '../prisma.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Generate a URL-safe slug from a title string.
 * Fallback: `prefix-<timestamp>`
 */
function makeSlug(title, prefix = 'post') {
  if (!title) return `${prefix}-${Date.now()}`;
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || `${prefix}-${Date.now()}`;
}

/**
 * Separate promoted columns from the flexible data bag.
 * Returns { promoted, extra } where:
 *   promoted — fields that have their own Prisma column
 *   extra    — everything else (stored in JSONB `data`)
 */
function splitBody(body) {
  const { _id, id: _id2, title, slug, category, status, createdAt: _createdAt, updatedAt: _updatedAt, ...extra } = body ?? {};
  return {
    promoted: { title, slug, category, status },
    extra,
  };
}

/**
 * Re-flatten a Prisma Post row into the MongoDB-compatible shape the frontend
 * expects:  { _id, title, slug, category, status, ...data fields, createdAt, updatedAt }
 */
function mapPost(post) {
  const { id, data, ...rest } = post;
  return {
    _id: id,
    ...(data && typeof data === 'object' ? data : {}),
    ...rest,   // promoted columns override anything in data with the same key
  };
}

// ── Reads ─────────────────────────────────────────────────────────────────────

/**
 * Fetch all posts for the given category, newest first.
 */
export async function getAllPosts(category) {
  const posts = await prisma.post.findMany({
    where:   { category },
    orderBy: { createdAt: 'desc' },
  });
  return posts.map(mapPost);
}

/**
 * Fetch a single post by its UUID id for the given category.
 * Returns null when not found.
 */
export async function getPostById(id, category) {
  const post = await prisma.post.findFirst({
    where: { id, category },
  });
  return post ? mapPost(post) : null;
}

// ── Writes ────────────────────────────────────────────────────────────────────

/**
 * Find a unique slug by appending -2, -3, … until no collision is found.
 */
async function uniqueSlug(base) {
  let candidate = base;
  let counter   = 2;
  while (await prisma.post.findUnique({ where: { slug: candidate } })) {
    candidate = `${base}-${counter++}`;
  }
  return candidate;
}

/**
 * Create a new post.
 * Accepts the flat frontend body; splits it into promoted cols + JSONB data.
 * Auto-deduplicates the slug if it already exists (appends -2, -3, …).
 */
export async function createPost(body, defaultCategory) {
  const { promoted, extra } = splitBody(body);

  const category = promoted.category || defaultCategory;
  const status   = promoted.status   || 'Draft';
  const title    = promoted.title    || '';
  const prefix   = category === 'Blog' ? 'blog' : 'page';
  const baseSlug = promoted.slug || makeSlug(title, prefix);
  const slug     = await uniqueSlug(baseSlug);

  const post = await prisma.post.create({
    data: {
      title,
      slug,
      category,
      status,
      data: Object.keys(extra).length > 0 ? extra : undefined,
    },
  });
  return mapPost(post);
}

/**
 * Update an existing post by its UUID id.
 * Accepts the flat frontend body; only changes supplied fields.
 * Returns the updated post, or null when not found.
 */
export async function updatePost(id, body) {
  const { promoted, extra } = splitBody(body);

  // Merge new data with existing so unmentioned fields are preserved
  const existing = await prisma.post.findUnique({ where: { id } });
  if (!existing) return null;

  const mergedData = {
    ...(existing.data && typeof existing.data === 'object' ? existing.data : {}),
    ...extra,
  };

  const update = {};
  if (promoted.title    !== undefined) update.title    = promoted.title;
  if (promoted.status   !== undefined) update.status   = promoted.status;
  if (promoted.category !== undefined) update.category = promoted.category;
  if (promoted.slug !== undefined) {
    // Only deduplicate if the slug actually changed
    if (promoted.slug !== existing.slug) {
      update.slug = await uniqueSlug(promoted.slug);
    } else {
      update.slug = promoted.slug;
    }
  } else if (promoted.title && !body.slug) {
    // Auto-regenerate slug when title changes but slug not explicitly supplied
    const prefix = (promoted.category || existing.category) === 'Blog' ? 'blog' : 'page';
    const baseSlug = makeSlug(promoted.title, prefix);
    update.slug = baseSlug !== existing.slug ? await uniqueSlug(baseSlug) : existing.slug;
  }

  update.data = mergedData;

  const post = await prisma.post.update({
    where: { id },
    data:  update,
  });
  return mapPost(post);
}

/**
 * Delete a post by its UUID id.
 * Returns the deleted post (mapped), or null when not found.
 */
export async function deletePost(id) {
  const existing = await prisma.post.findUnique({ where: { id } });
  if (!existing) return null;
  const deleted = await prisma.post.delete({ where: { id } });
  return mapPost(deleted);
}
