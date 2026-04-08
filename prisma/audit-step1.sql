SELECT
  COUNT(*)::int                                                 AS total_products,
  COUNT(*) FILTER (WHERE bundles IS NULL)::int                 AS null_bundles,
  COUNT(*) FILTER (WHERE bundles::text = '[]')::int            AS empty_bundles,
  COUNT(*) FILTER (WHERE jsonb_array_length(bundles) > 0)::int AS with_bundles,
  COUNT(*) FILTER (WHERE TRIM(COALESCE(title,'')) = '')::int   AS junk_no_title
FROM products;
