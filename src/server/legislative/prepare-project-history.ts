import type { LegislativeSourceName } from "#/domain/legislative";
import { isLocalDemoRecord } from "#/development/database-url";
import { env } from "#/server/config";
import { CamaraAdapter } from "#/integrations/camara/client";
import { SenadoAdapter } from "#/integrations/senado/client";
import { withAdvisoryLock } from "#/server/db/advisory-lock";
import { db, sql } from "#/server/db/client";
import { LegislativeRepository } from "#/server/db/repositories";
import { hydrateProject } from "#/server/legislative/hydrate-project";
import { ensureBicameralPartner } from "#/server/legislative/reconcile-bicameral";
import { OfficialSourceError } from "#/server/http/retrying-fetch";

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
  // Synthetic demo IDs are never sent to the official APIs, even after cache expiry.
  if (isLocalDemoRecord(env.DATABASE_URL, externalId)) return { status: "cached" as const };

  const hydration = await hydrateOne(source, externalId);
  const needsPartner = (identity.source === "senado" && identity.originHouse === "camara")
    || (identity.source === "camara" && identity.currentHouse === "senado");
  try {
    const partner = await ensureBicameralPartner(identity, {
      repository,
      adapters,
      hydrate: hydrateOne,
    });
    if (needsPartner && !partner) return { status: "partial" as const };
    if (partner) {
      const partnerState = await repository.getHydrationState(partner.source, partner.externalId);
      if (partnerState?.status !== "complete") return { status: "partial" as const };
    }
  } catch (error) {
    if (!(error instanceof OfficialSourceError)) throw error;
    return hydration.status === "complete" || hydration.status === "cached"
      ? { status: "partial" as const }
      : hydration;
  }
  return hydration;
}
