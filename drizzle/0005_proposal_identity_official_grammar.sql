WITH matched AS (
  SELECT
    "id",
    regexp_match(
      upper(btrim("official_code")),
      '^([A-Z]+(?:[._-][A-Z]+)*)[[:space:]]+(?:N[º°O]?[[:space:]]*)?([0-9]{1,9})(?:[[:space:]]*[/,][[:space:]]*(?:DE[[:space:]]*)?([0-9]{4})(?:[^0-9]|$))?'
    ) AS identity
  FROM "bills"
), parsed AS (
  SELECT
    "id",
    identity[1] AS proposal_type,
    identity[2]::integer AS proposal_number,
    CASE
      WHEN identity[3]::integer BETWEEN 1000 AND 9999 THEN identity[3]::integer
      ELSE NULL
    END AS proposal_year
  FROM matched
  WHERE identity IS NOT NULL
    AND char_length(identity[1]) BETWEEN 2 AND 20
)
UPDATE "bills" AS bill
SET
  "proposal_type" = CASE
    WHEN bill."proposal_type" IS NULL
      AND parsed.proposal_type IS NOT NULL
      AND bill."proposal_type" IS DISTINCT FROM parsed.proposal_type
    THEN parsed.proposal_type
    ELSE bill."proposal_type"
  END,
  "proposal_number" = CASE
    WHEN bill."proposal_number" IS NULL
      AND parsed.proposal_number IS NOT NULL
      AND bill."proposal_number" IS DISTINCT FROM parsed.proposal_number
    THEN parsed.proposal_number
    ELSE bill."proposal_number"
  END,
  "proposal_year" = CASE
    WHEN bill."proposal_year" IS NULL
      AND parsed.proposal_year IS NOT NULL
      AND bill."proposal_year" IS DISTINCT FROM parsed.proposal_year
    THEN parsed.proposal_year
    ELSE bill."proposal_year"
  END
FROM parsed
WHERE bill."id" = parsed."id"
  AND (
    (
      bill."proposal_type" IS NULL
      AND parsed.proposal_type IS NOT NULL
      AND bill."proposal_type" IS DISTINCT FROM parsed.proposal_type
    )
    OR (
      bill."proposal_number" IS NULL
      AND parsed.proposal_number IS NOT NULL
      AND bill."proposal_number" IS DISTINCT FROM parsed.proposal_number
    )
    OR (
      bill."proposal_year" IS NULL
      AND parsed.proposal_year IS NOT NULL
      AND bill."proposal_year" IS DISTINCT FROM parsed.proposal_year
    )
  );
