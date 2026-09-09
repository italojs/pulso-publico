import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  migrateTestDatabase,
  testSql,
} from "../../setup-database.ts";

describe("historical collector migration", () => {
  beforeAll(migrateTestDatabase);
  afterAll(() => testSql.end());

  it("installs the durable task tables, enums and reservation indexes", async () => {
    const [shape] = await testSql<{
      tasks: boolean;
      runs: boolean;
      statusEnum: boolean;
      phaseEnum: boolean;
      schedulingIndex: boolean;
      leaseIndex: boolean;
    }[]>`
      select
        to_regclass('public.historical_collection_tasks') is not null as tasks,
        to_regclass('public.historical_collection_runs') is not null as runs,
        exists(select 1 from pg_type where typname = 'historical_collection_status') as "statusEnum",
        exists(select 1 from pg_type where typname = 'historical_collection_phase') as "phaseEnum",
        to_regclass('public.historical_collection_tasks_schedule_idx') is not null as "schedulingIndex",
        to_regclass('public.historical_collection_tasks_lease_idx') is not null as "leaseIndex"
    `;

    expect(shape).toEqual({
      tasks: true,
      runs: true,
      statusEnum: true,
      phaseEnum: true,
      schedulingIndex: true,
      leaseIndex: true,
    });
  });
});
