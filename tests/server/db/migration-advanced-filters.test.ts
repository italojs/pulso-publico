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

  for (const statement of contents.split("--> statement-breakpoint")) {
    const query = statement.trim();
    if (query) await database.unsafe(query);
  }
}

describe("advanced filters migration", () => {
  it("forward-fills real underscore and dotted official proposal types", async () => {
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
          ('00000000-0000-0000-0000-000000000021', 'camara', 'official-ata', 'ATA_PRE 1/2025', 'Ata', 'camara', 'Em análise', 'https://example.test/ata', now()),
          ('00000000-0000-0000-0000-000000000022', 'senado', 'official-rc', 'R.C 2/2026', 'Requerimento', 'senado', 'Em análise', 'https://example.test/rc', now()),
          ('00000000-0000-0000-0000-000000000023', 'senado', 'official-rs', 'R.S 3/2024', 'Requerimento', 'senado', 'Em análise', 'https://example.test/rs', now()),
          ('00000000-0000-0000-0000-000000000024', 'camara', 'invalid-type', 'TIPO/INTERNO 4/2026', 'Texto pesquisável', 'camara', 'Em análise', 'https://example.test/invalid', now())
      `;

      await applyMigration(database, "../../../drizzle/0003_advanced_filters.sql", schemaName);
      await applyMigration(database, "../../../drizzle/0004_proposal_identity_backfill.sql", schemaName);
      await applyMigration(database, "../../../drizzle/0005_proposal_identity_official_grammar.sql", schemaName);

      expect(await database<{ code: string; type: string | null; number: number | null; year: number | null }[]>`
        SELECT official_code AS code, proposal_type AS type, proposal_number AS number, proposal_year AS year
        FROM bills
        ORDER BY external_id
      `).toEqual([
        { code: "TIPO/INTERNO 4/2026", type: null, number: null, year: null },
        { code: "ATA_PRE 1/2025", type: "ATA_PRE", number: 1, year: 2025 },
        { code: "R.C 2/2026", type: "R.C", number: 2, year: 2026 },
        { code: "R.S 3/2024", type: "R.S", number: 3, year: 2024 },
      ]);
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
