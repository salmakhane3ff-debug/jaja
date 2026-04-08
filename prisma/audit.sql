-- ═══════════════════════════════════════════════════════════════════════════
--  PRODUCT DATABASE AUDIT + CLEANUP SCRIPTS
--  Run these one section at a time in psql, pgAdmin, or TablePlus.
--  Database: shopgold  |  Table: products (Prisma-managed, PostgreSQL)
-- ═══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
--  STEP 1 — VERIFY THE bundles COLUMN EXISTS
--  Expected: one row, data_type = jsonb, column_default = '[]'::jsonb
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  column_name,
  data_type,
  column_default
FROM information_schema.columns
WHERE table_name  = 'products'
  AND column_name = 'bundles';


-- ─────────────────────────────────────────────────────────────────────────────
--  STEP 2 — OVERALL HEALTH SNAPSHOT
--  Gives a single-row summary of the whole products table.
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  COUNT(*)::int                                                 AS total_products,
  COUNT(*) FILTER (WHERE bundles IS NULL)::int                 AS null_bundles,
  COUNT(*) FILTER (WHERE bundles::text = '[]')::int            AS empty_bundles,
  COUNT(*) FILTER (WHERE jsonb_array_length(bundles) > 0)::int AS with_bundles_configured,
  COUNT(*) FILTER (WHERE TRIM(title) = '' OR title IS NULL)::int AS junk_no_title,
  COUNT(*) FILTER (WHERE status = 'Active')::int               AS active,
  COUNT(*) FILTER (WHERE status != 'Active')::int              AS inactive
FROM products;


-- ─────────────────────────────────────────────────────────────────────────────
--  STEP 3 — LIST PRODUCTS WITH NULL bundles
--  These should not exist (column default is '[]'), but check anyway.
-- ─────────────────────────────────────────────────────────────────────────────
SELECT id, title, status, "createdAt"
FROM   products
WHERE  bundles IS NULL
ORDER  BY "createdAt" DESC;


-- ─────────────────────────────────────────────────────────────────────────────
--  STEP 4 — FIX: set NULL bundles → empty array  (safe, non-destructive)
--  Run only if STEP 3 returned rows.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE products
SET    bundles = '[]'::jsonb
WHERE  bundles IS NULL;
-- Expected: "UPDATE 0" if the column default was applied correctly.


-- ─────────────────────────────────────────────────────────────────────────────
--  STEP 5 — LIST JUNK / EMPTY PRODUCTS (no title)
--  These were likely created by a misfired bot or test and can be deleted.
-- ─────────────────────────────────────────────────────────────────────────────
SELECT id, title, status, "regularPrice", "salePrice", "createdAt"
FROM   products
WHERE  TRIM(COALESCE(title, '')) = ''
ORDER  BY "createdAt" DESC;


-- ─────────────────────────────────────────────────────────────────────────────
--  STEP 6 — DELETE JUNK PRODUCTS (run only after reviewing STEP 5 output)
--  Wrapped in a transaction so you can ROLLBACK if anything looks wrong.
-- ─────────────────────────────────────────────────────────────────────────────
BEGIN;

  -- First, remove FK-constrained child rows so the DELETE won't fail
  DELETE FROM order_items
  WHERE "productId" IN (
    SELECT id FROM products WHERE TRIM(COALESCE(title, '')) = ''
  );

  DELETE FROM feedbacks
  WHERE "productId" IN (
    SELECT id FROM products WHERE TRIM(COALESCE(title, '')) = ''
  );

  DELETE FROM product_analytics
  WHERE "productId" IN (
    SELECT id FROM products WHERE TRIM(COALESCE(title, '')) = ''
  );

  -- Now delete the junk products
  DELETE FROM products
  WHERE TRIM(COALESCE(title, '')) = '';

ROLLBACK;   -- ← change to COMMIT once you are happy with the row counts above


-- ─────────────────────────────────────────────────────────────────────────────
--  STEP 7 — FIND EXACT DUPLICATE TITLES
--  Duplicates may have been created by the bot running on the wrong page.
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  title,
  COUNT(*)::int       AS copies,
  MIN("createdAt")    AS oldest,
  MAX("createdAt")    AS newest,
  ARRAY_AGG(id)       AS ids
FROM  products
GROUP BY title
HAVING COUNT(*) > 1
ORDER BY copies DESC, newest DESC;


-- ─────────────────────────────────────────────────────────────────────────────
--  STEP 8 — DELETE DUPLICATE PRODUCTS (keep the OLDEST copy, remove the rest)
--  Review STEP 7 output first. Remove the ROLLBACK → COMMIT when ready.
-- ─────────────────────────────────────────────────────────────────────────────
BEGIN;

  -- Identify the IDs to delete (all but the oldest per duplicate group)
  WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY title ORDER BY "createdAt" ASC) AS rn
    FROM   products
    WHERE  title IN (
      SELECT title FROM products
      GROUP  BY title HAVING COUNT(*) > 1
    )
  ),
  to_delete AS (SELECT id FROM ranked WHERE rn > 1)
  SELECT COUNT(*)::int AS will_delete FROM to_delete;
  -- Inspect the count ↑ before proceeding

  -- Remove FK children of duplicates
  WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY title ORDER BY "createdAt" ASC) AS rn
    FROM   products
    WHERE  title IN (
      SELECT title FROM products GROUP BY title HAVING COUNT(*) > 1
    )
  ),
  to_delete AS (SELECT id FROM ranked WHERE rn > 1)
  DELETE FROM order_items  WHERE "productId" IN (SELECT id FROM to_delete);

  WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY title ORDER BY "createdAt" ASC) AS rn
    FROM   products
    WHERE  title IN (
      SELECT title FROM products GROUP BY title HAVING COUNT(*) > 1
    )
  ),
  to_delete AS (SELECT id FROM ranked WHERE rn > 1)
  DELETE FROM feedbacks WHERE "productId" IN (SELECT id FROM to_delete);

  WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY title ORDER BY "createdAt" ASC) AS rn
    FROM   products
    WHERE  title IN (
      SELECT title FROM products GROUP BY title HAVING COUNT(*) > 1
    )
  ),
  to_delete AS (SELECT id FROM ranked WHERE rn > 1)
  DELETE FROM product_analytics WHERE "productId" IN (SELECT id FROM to_delete);

  -- Delete the duplicate products
  WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY title ORDER BY "createdAt" ASC) AS rn
    FROM   products
    WHERE  title IN (
      SELECT title FROM products GROUP BY title HAVING COUNT(*) > 1
    )
  )
  DELETE FROM products WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

ROLLBACK;   -- ← change to COMMIT once you are happy with the counts


-- ─────────────────────────────────────────────────────────────────────────────
--  STEP 9 — FINAL VERIFICATION
--  Should show 0 nulls, 0 junk, 0 duplicates.
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  COUNT(*)::int                                                 AS total_products,
  COUNT(*) FILTER (WHERE bundles IS NULL)::int                 AS null_bundles,
  COUNT(*) FILTER (WHERE TRIM(COALESCE(title,'')) = '')::int   AS junk_no_title,
  (
    SELECT COUNT(DISTINCT title)::int FROM products
    WHERE title IN (SELECT title FROM products GROUP BY title HAVING COUNT(*) > 1)
  )                                                             AS duplicate_title_groups
FROM products;
