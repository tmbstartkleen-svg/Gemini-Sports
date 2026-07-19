-- Remove duplicate recalls that share the same official recall number.
-- Keeps the highest-priority and most recently updated record.

DELETE FROM recall_events
WHERE id IN (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY
          UPPER(TRIM(source)),
          UPPER(TRIM(recall_number))
        ORDER BY
          CASE priority
            WHEN 'Critical' THEN 4
            WHEN 'High' THEN 3
            WHEN 'Medium' THEN 2
            WHEN 'Low' THEN 1
            ELSE 0
          END DESC,
          score DESC,
          datetime(updated_at) DESC,
          datetime(created_at) DESC,
          id ASC
      ) AS duplicate_position
    FROM recall_events
    WHERE TRIM(COALESCE(recall_number, '')) <> ''
  )
  WHERE duplicate_position > 1
);

-- Remove duplicates that do not have an official recall number.
-- These are compared using source, event ID, firm, date and product.

DELETE FROM recall_events
WHERE id IN (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY
          UPPER(TRIM(source)),
          UPPER(TRIM(COALESCE(event_id, ''))),
          UPPER(TRIM(COALESCE(firm_name, ''))),
          TRIM(COALESCE(report_date, '')),
          UPPER(TRIM(COALESCE(product, '')))
        ORDER BY
          CASE priority
            WHEN 'Critical' THEN 4
            WHEN 'High' THEN 3
            WHEN 'Medium' THEN 2
            WHEN 'Low' THEN 1
            ELSE 0
          END DESC,
          score DESC,
          datetime(updated_at) DESC,
          datetime(created_at) DESC,
          id ASC
      ) AS duplicate_position
    FROM recall_events
    WHERE TRIM(COALESCE(recall_number, '')) = ''
  )
  WHERE duplicate_position > 1
);

-- Prevent future duplicates when an official recall number exists.

CREATE UNIQUE INDEX IF NOT EXISTS idx_recall_unique_source_number
ON recall_events(
  UPPER(TRIM(source)),
  UPPER(TRIM(recall_number))
)
WHERE TRIM(COALESCE(recall_number, '')) <> '';

-- Improve matching performance for recalls without an official number.

CREATE INDEX IF NOT EXISTS idx_recall_fallback_match
ON recall_events(
  source,
  event_id,
  firm_name,
  report_date
);
