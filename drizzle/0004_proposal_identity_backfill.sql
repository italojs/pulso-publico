WITH parsed AS (
  SELECT
    "id",
    regexp_match(
      upper(btrim("official_code")),
      '^([[:alpha:]]{2,10}(?:-[[:alpha:]]{1,3})?)[[:space:]]+(?:N[º°O]?[[:space:]]*)?([0-9]{1,9})(?:[[:space:]]*[/,][[:space:]]*(?:DE[[:space:]]*)?([0-9]{4})(?:[^0-9]|$))?'
    ) AS identity
  FROM "bills"
)
UPDATE "bills" AS bill
SET
  "proposal_type" = coalesce(bill."proposal_type", upper(parsed.identity[1])),
  "proposal_number" = coalesce(bill."proposal_number", parsed.identity[2]::integer),
  "proposal_year" = coalesce(
    bill."proposal_year",
    CASE
      WHEN parsed.identity[3]::integer BETWEEN 1000 AND 9999 THEN parsed.identity[3]::integer
      ELSE NULL
    END
  )
FROM parsed
WHERE bill."id" = parsed."id"
  AND parsed.identity IS NOT NULL
  AND (
    bill."proposal_type" IS NULL
    OR bill."proposal_number" IS NULL
    OR bill."proposal_year" IS NULL
  );
