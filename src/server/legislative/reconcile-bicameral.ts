import type {
  Bill,
  LegislativeSourceAdapter,
  LegislativeSourceName,
} from "#/domain/legislative";
import type { BillGraph } from "#/server/db/repositories";

export type BicameralBillIdentity = Pick<
  Bill,
  | "source"
  | "externalId"
  | "proposalType"
  | "proposalNumber"
  | "proposalYear"
  | "congressionalKey"
  | "originHouse"
  | "currentHouse"
>;

interface BicameralRepository {
  findBillByOfficialIdentity(
    source: LegislativeSourceName,
    proposalType: string,
    proposalNumber: number,
    proposalYear: number,
  ): Promise<{
    source: LegislativeSourceName;
    externalId: string;
    congressionalKey?: string | null;
  } | null>;
  upsertBillGraph(graph: BillGraph): Promise<void>;
}

interface BicameralDependencies {
  repository: BicameralRepository;
  adapters: Record<LegislativeSourceName, LegislativeSourceAdapter>;
  hydrate(
    source: LegislativeSourceName,
    externalId: string,
  ): Promise<unknown>;
}

export interface ResolvedBicameralPartner {
  source: LegislativeSourceName;
  externalId: string;
  bill?: Bill;
}

function partnerSource(bill: BicameralBillIdentity): LegislativeSourceName | null {
  if (bill.source === "senado" && bill.originHouse === "camara") return "camara";
  if (bill.source === "camara" && bill.currentHouse === "senado") return "senado";
  return null;
}

function summaryGraph(bill: Bill): BillGraph {
  return {
    bill,
    authors: [],
    topics: [],
    movements: [],
    voteEvents: [],
    individualVotes: [],
  };
}

export async function resolveBicameralPartner(
  bill: BicameralBillIdentity,
  dependencies: Pick<BicameralDependencies, "repository" | "adapters">,
): Promise<ResolvedBicameralPartner | null> {
  const source = partnerSource(bill);
  if (
    !source
    || !bill.proposalType
    || bill.proposalNumber == null
    || bill.proposalYear == null
  ) {
    return null;
  }

  const local = await dependencies.repository.findBillByOfficialIdentity(
    source,
    bill.proposalType,
    bill.proposalNumber,
    bill.proposalYear,
  );
  if (local) {
    if (local.congressionalKey !== bill.congressionalKey) return null;
    return local;
  }

  const adapter = dependencies.adapters[source];
  if (!adapter.findBillsByOfficialIdentity) return null;
  const matches = await adapter.findBillsByOfficialIdentity({
    proposalType: bill.proposalType,
    proposalNumber: bill.proposalNumber,
    proposalYear: bill.proposalYear,
  });
  if (matches.length !== 1) return null;

  const [partner] = matches;
  if (
    !partner
    || partner.source !== source
    || partner.proposalType !== bill.proposalType
    || partner.proposalNumber !== bill.proposalNumber
    || partner.proposalYear !== bill.proposalYear
    || partner.congressionalKey !== bill.congressionalKey
  ) {
    return null;
  }

  return { source, externalId: partner.externalId, bill: partner };
}

export async function ensureBicameralPartner(
  bill: BicameralBillIdentity,
  dependencies: BicameralDependencies,
): Promise<{ source: LegislativeSourceName; externalId: string } | null> {
  const partner = await resolveBicameralPartner(bill, dependencies);
  if (!partner) return null;
  if (partner.bill) {
    await dependencies.repository.upsertBillGraph(summaryGraph(partner.bill));
  }
  await dependencies.hydrate(partner.source, partner.externalId);
  return { source: partner.source, externalId: partner.externalId };
}
