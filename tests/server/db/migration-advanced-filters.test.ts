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
      ]);
    } finally {
      await database.unsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      await database.end({ timeout: 5 });
    }
  }, 30_000);
});
