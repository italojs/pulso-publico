import type { LegislativeSourceName } from "#/domain/legislative";
import { CamaraAdapter } from "#/integrations/camara/client";
import { SenadoAdapter } from "#/integrations/senado/client";
import { withAdvisoryLock } from "#/server/db/advisory-lock";
import { db, sql } from "#/server/db/client";
import { LegislativeRepository } from "#/server/db/repositories";
import { hydrateProject } from "#/server/legislative/hydrate-project";
import { ensureBicameralPartner } from "#/server/legislative/reconcile-bicameral";

const repository = new LegislativeRepository(db);
const adapters = {
  camara: new CamaraAdapter(),
  senado: new SenadoAdapter(),
};

async function hydrateOne(source: LegislativeSourceName, externalId: string) {
  return hydrateProject({
    source,
    externalId,
    adapter: adapters[source],
    repository,
    withLock: (name, operation) => withAdvisoryLock(sql, name, operation),
  });
}

export async function prepareProjectHistory(
  source: LegislativeSourceName,
  externalId: string,
) {
  const identity = await repository.getBillIdentity(source, externalId);
  if (!identity) return { status: "missing" as const };

  const hydration = await hydrateOne(source, externalId);
  try {
    await ensureBicameralPartner(identity, {
      repository,
      adapters,
      hydrate: hydrateOne,
    });
  } catch {
    return hydration.status === "complete" || hydration.status === "cached"
      ? { status: "partial" as const }
      : hydration;
  }
  return hydration;
}
