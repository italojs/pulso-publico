import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";
import postgres from "postgres";

async function applyMigration(
  database: ReturnType<typeof postgres>,
  filename: string,
  schemaName: string,
) {
  const contents = (await readFile(new URL(filename, import.meta.url), "utf8"))
    .replaceAll('"public".', `"${schemaName}".`);
  let affectedRows = 0;

  for (const statement of contents.split("--> statement-breakpoint")) {
    const query = statement.trim();
    if (query) {
      const result = await database.unsafe(query);
      affectedRows += result.count;
    }
  }

  return affectedRows;
}

describe("advanced filters migration", () => {
  it("updates only materially changed rows for the real official type grammar", async () => {
    const schemaName = `migration_${randomUUID().replaceAll("-", "")}`;
    const database = postgres(process.env.DATABASE_URL!, { max: 1 });

    try {
      await database.unsafe(`CREATE SCHEMA "${schemaName}"`);
      await database.unsafe(`SET search_path TO "${schemaName}"`);
      await applyMigration(database, "../../../drizzle/0000_icy_prodigy.sql", schemaName);
      await applyMigration(database, "../../../drizzle/0001_left_wallflower.sql", schemaName);
      await applyMigration(database, "../../../drizzle/0002_futuristic_venom.sql", schemaName);
      await database`
        INSERT INTO bills (
          id, source, external_id, official_code, official_title, origin_house,
          status_label, official_url, checked_at
        )
        SELECT
          ('00000000-0000-4000-8000-' || lpad(series::text, 12, '0'))::uuid,
          CASE WHEN series <= 2 THEN 'camara'::legislative_source ELSE 'senado'::legislative_source END,
          'official-real-' || series,
          CASE
            WHEN series <= 2 THEN 'ATA_PRE ' || series || '/2025'
            WHEN series <= 8 THEN 'R.C ' || (series - 2) || '/2026'
            ELSE 'R.S ' || (series - 8) || '/2024'
          END,
          'Tipo oficial real ' || series,
          CASE WHEN series <= 2 THEN 'camara'::legislative_house ELSE 'senado'::legislative_house END,
          'Em análise',
          'https://example.test/official-real-' || series,
          now()
        FROM generate_series(1, 48) AS series
      `;
      await database`
        INSERT INTO bills (
          id, source, external_id, official_code, official_title, origin_house,
          status_label, official_url, checked_at
        )
        SELECT
          ('00000000-0000-4000-8001-' || lpad(series::text, 12, '0'))::uuid,
          'camara',
          'complete-yearless-' || series,
          'PRL ' || series || '/0',
          'Identidade já completa sem ano ' || series,
          'camara',
          'Em análise',
          'https://example.test/complete-yearless-' || series,
          now()
        FROM generate_series(1, 512) AS series
      `;
      await database`
        INSERT INTO bills (
          id, source, external_id, official_code, official_title, origin_house,
          status_label, official_url, checked_at
        ) VALUES (
          '00000000-0000-4000-8002-000000000001', 'camara', 'invalid-type',
          'TIPO/INTERNO 4/2026', 'Texto pesquisável', 'camara', 'Em análise',
          'https://example.test/invalid', now()
        )
      `;

      await applyMigration(database, "../../../drizzle/0003_advanced_filters.sql", schemaName);
      await applyMigration(database, "../../../drizzle/0004_proposal_identity_backfill.sql", schemaName);
      await database.unsafe(`
        CREATE TEMP TABLE before_0005 AS
        SELECT id, ctid::text AS row_ctid, proposal_type, proposal_number, proposal_year
        FROM "${schemaName}".bills
        WHERE external_id LIKE 'complete-yearless-%' OR external_id = 'invalid-type'
      `);

      const firstUpdated = await applyMigration(database, "../../../drizzle/0005_proposal_identity_official_grammar.sql", schemaName);
      const secondUpdated = await applyMigration(database, "../../../drizzle/0005_proposal_identity_official_grammar.sql", schemaName);

      expect(firstUpdated).toBe(48);
      expect(secondUpdated).toBe(0);
      expect(await database<{ type: string; count: number }[]>`
        SELECT proposal_type AS type, count(*)::int AS count
        FROM bills
        WHERE external_id LIKE 'official-real-%'
        GROUP BY proposal_type
        ORDER BY proposal_type
      `).toEqual([
        { type: "ATA_PRE", count: 2 },
        { type: "R.C", count: 6 },
        { type: "R.S", count: 40 },
      ]);
      expect(await database<{ rewritten: number }[]>`
        SELECT count(*) FILTER (WHERE bill.ctid::text <> before.row_ctid)::int AS rewritten
        FROM bills AS bill
        JOIN before_0005 AS before USING (id)
        WHERE bill.external_id LIKE 'complete-yearless-%'
      `).toEqual([{ rewritten: 0 }]);
      expect(await database<{ code: string; type: string | null; number: number | null; year: number | null; sameCtid: boolean }[]>`
        SELECT
          bill.official_code AS code,
          bill.proposal_type AS type,
          bill.proposal_number AS number,
          bill.proposal_year AS year,
          bill.ctid::text = before.row_ctid AS "sameCtid"
        FROM bills AS bill
        JOIN before_0005 AS before USING (id)
        WHERE bill.external_id = 'invalid-type'
      `).toEqual([{
        code: "TIPO/INTERNO 4/2026",
        type: null,
        number: null,
        year: null,
        sameCtid: true,
      }]);
    } finally {
      await database.unsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      await database.end({ timeout: 5 });
    }
  }, 30_000);

  it("forward-fills type and number without requiring a valid four-digit year", async () => {
    const schemaName = `migration_${randomUUID().replaceAll("-", "")}`;
    const database = postgres(process.env.DATABASE_URL!, { max: 1 });

    try {
      await database.unsafe(`CREATE SCHEMA "${schemaName}"`);
      await database.unsafe(`SET search_path TO "${schemaName}"`);
      await applyMigration(database, "../../../drizzle/0000_icy_prodigy.sql", schemaName);
      await applyMigration(database, "../../../drizzle/0001_left_wallflower.sql", schemaName);
      await applyMigration(database, "../../../drizzle/0002_futuristic_venom.sql", schemaName);
      await database`
        INSERT INTO bills (
          id, source, external_id, official_code, official_title, origin_house,
          status_label, official_url, checked_at
        ) VALUES
          ('00000000-0000-0000-0000-000000000011', 'camara', 'legacy-sbt', 'SBT-A 3/2026', 'Substitutivo', 'camara', 'Em análise', 'https://example.test/sbt', now()),
          ('00000000-0000-0000-0000-000000000012', 'camara', 'legacy-emc', 'EMC-A 14/2025', 'Emenda', 'camara', 'Em análise', 'https://example.test/emc', now()),
          ('00000000-0000-0000-0000-000000000013', 'camara', 'legacy-sbe', 'SBE-A 7/2024', 'Subemenda', 'camara', 'Em análise', 'https://example.test/sbe', now()),
          ('00000000-0000-0000-0000-000000000014', 'camara', 'legacy-prl', 'PRL 1/0', 'Parecer', 'camara', 'Em análise', 'https://example.test/prl', now())
      `;

      await applyMigration(database, "../../../drizzle/0003_advanced_filters.sql", schemaName);
      await applyMigration(database, "../../../drizzle/0004_proposal_identity_backfill.sql", schemaName);

      expect(await database<{ code: string; type: string | null; number: number | null; year: number | null }[]>`
        SELECT official_code AS code, proposal_type AS type, proposal_number AS number, proposal_year AS year
        FROM bills
        ORDER BY external_id
      `).toEqual([
        { code: "EMC-A 14/2025", type: "EMC-A", number: 14, year: 2025 },
        { code: "PRL 1/0", type: "PRL", number: 1, year: null },
        { code: "SBE-A 7/2024", type: "SBE-A", number: 7, year: 2024 },
        { code: "SBT-A 3/2026", type: "SBT-A", number: 3, year: 2026 },
      ]);
    } finally {
      await database.unsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      await database.end({ timeout: 5 });
    }
  }, 30_000);

  it("backfills negated historical vote results as other", async () => {
    const schemaName = `migration_${randomUUID().replaceAll("-", "")}`;
    const database = postgres(process.env.DATABASE_URL!, { max: 1 });

    try {
      await database.unsafe(`CREATE SCHEMA "${schemaName}"`);
      await database.unsafe(`SET search_path TO "${schemaName}"`);
      await applyMigration(database, "../../../drizzle/0000_icy_prodigy.sql", schemaName);
      await applyMigration(database, "../../../drizzle/0001_left_wallflower.sql", schemaName);
      await applyMigration(database, "../../../drizzle/0002_futuristic_venom.sql", schemaName);

      await database`
        INSERT INTO bills (
          id, source, external_id, official_code, official_title, origin_house,
          status_label, official_url, checked_at
        ) VALUES (
          '00000000-0000-0000-0000-000000000001', 'camara', 'legacy-bill',
          'PEC 8/2025', 'Proposta histórica', 'camara', 'Em votação',
          'https://www.camara.leg.br/propostas-legislativas/legacy-bill', now()
        )
      `;
      await database`
        INSERT INTO vote_events (
          source, external_id, bill_id, occurred_at, house, description, result,
          is_nominal, is_secret, official_url, checked_at
        ) VALUES
          (
            'camara', 'legacy-vote-1', '00000000-0000-0000-0000-000000000001', now(),
            'camara', 'Resultado histórico', 'Não foram aprovados', false, false,
            'https://www.camara.leg.br/votacoes/legacy-vote-1', now()
          ),
          (
            'camara', 'legacy-vote-2', '00000000-0000-0000-0000-000000000001', now(),
            'camara', 'Resultado histórico', 'Não foi rejeitada', false, false,
            'https://www.camara.leg.br/votacoes/legacy-vote-2', now()
          ),
          (
            'camara', 'legacy-vote-3', '00000000-0000-0000-0000-000000000001', now(),
            'camara', 'Resultado histórico', 'Não foram aprovados!', false, false,
            'https://www.camara.leg.br/votacoes/legacy-vote-3', now()
          ),
          (
            'camara', 'legacy-vote-4', '00000000-0000-0000-0000-000000000001', now(),
            'camara', 'Resultado histórico', '(Não foram aprovados)', false, false,
            'https://www.camara.leg.br/votacoes/legacy-vote-4', now()
          ),
          (
            'camara', 'legacy-vote-5', '00000000-0000-0000-0000-000000000001', now(),
            'camara', 'Resultado histórico', 'Resultado:(Não foram aprovados)', false, false,
            'https://www.camara.leg.br/votacoes/legacy-vote-5', now()
          ),
          (
            'camara', 'legacy-vote-6', '00000000-0000-0000-0000-000000000001', now(),
            'camara', 'Resultado histórico', 'Não foram rejeitados!', false, false,
            'https://www.camara.leg.br/votacoes/legacy-vote-6', now()
          ),
          (
            'camara', 'legacy-vote-7', '00000000-0000-0000-0000-000000000001', now(),
            'camara', 'Resultado histórico', '(Não foram rejeitados)', false, false,
            'https://www.camara.leg.br/votacoes/legacy-vote-7', now()
          ),
          (
            'camara', 'legacy-vote-8', '00000000-0000-0000-0000-000000000001', now(),
            'camara', 'Resultado histórico', 'Resultado:(Não foram rejeitados)', false, false,
            'https://www.camara.leg.br/votacoes/legacy-vote-8', now()
          )
      `;

      await applyMigration(database, "../../../drizzle/0003_advanced_filters.sql", schemaName);

      expect(await database<{ result: string; category: string }[]>`
        SELECT result, result_category::text AS category
        FROM vote_events
        ORDER BY external_id
      `).toEqual([
        { result: "Não foram aprovados", category: "other" },
        { result: "Não foi rejeitada", category: "other" },
        { result: "Não foram aprovados!", category: "other" },
        { result: "(Não foram aprovados)", category: "other" },
        { result: "Resultado:(Não foram aprovados)", category: "other" },
        { result: "Não foram rejeitados!", category: "other" },
        { result: "(Não foram rejeitados)", category: "other" },
        { result: "Resultado:(Não foram rejeitados)", category: "other" },
      ]);
    } finally {
      await database.unsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      await database.end({ timeout: 5 });
    }
  }, 30_000);
});
