import type {
  Lawmaker,
  LegislativeSourceAdapter,
  LegislativeSourceName,
} from "#/domain/legislative";
import type { BillGraph } from "#/server/db/repositories";

export interface BillGraphRepository {
  upsertBillGraph(graph: BillGraph): Promise<void>;
  upsertLawmakers(items: Lawmaker[]): Promise<void>;
  findMissingLawmakerExternalIds(
    source: LegislativeSourceName,
    externalIds: readonly string[],
  ): Promise<string[]>;
}

export async function loadBillGraph(
  adapter: LegislativeSourceAdapter,
  billExternalId: string,
): Promise<BillGraph> {
  const [bill, authors, topics, movements, voteEvents] = await Promise.all([
    adapter.getBill(billExternalId),
    adapter.listBillAuthors(billExternalId),
    adapter.listBillTopics(billExternalId),
    adapter.listBillMovements(billExternalId),
    adapter.listBillVoteEvents(billExternalId),
  ]);
  if (bill.source !== adapter.source) {
    throw new Error(`Adapter ${adapter.source} returned a bill from ${bill.source}`);
  }

  const individualVotes = (
    await Promise.all(
      voteEvents
        .filter((voteEvent) => voteEvent.isNominal && !voteEvent.isSecret)
        .map((voteEvent) => adapter.listIndividualVotes(voteEvent.externalId)),
    )
  ).flat();
  return { bill, authors, topics, movements, voteEvents, individualVotes };
}

export async function persistHydratedBillGraph(
  adapter: LegislativeSourceAdapter,
  repository: BillGraphRepository,
  billExternalId: string,
): Promise<BillGraph> {
  const graph = await loadBillGraph(adapter, billExternalId);
  const referencedLawmakerIds = [
    ...graph.authors.flatMap((author) =>
      author.lawmakerExternalId ? [author.lawmakerExternalId] : []
    ),
    ...graph.individualVotes.map((vote) => vote.lawmakerExternalId),
  ];
  const missingLawmakerIds = await repository.findMissingLawmakerExternalIds(
    adapter.source,
    referencedLawmakerIds,
  );
  if (missingLawmakerIds.length > 0) {
    const lawmakers: Lawmaker[] = [];
    for (let index = 0; index < missingLawmakerIds.length; index += 8) {
      const batch = missingLawmakerIds.slice(index, index + 8);
      lawmakers.push(
        ...await Promise.all(
          batch.map((externalId) => adapter.getLawmaker(externalId)),
        ),
      );
    }
    for (const [index, lawmaker] of lawmakers.entries()) {
      const expectedExternalId = missingLawmakerIds[index];
      if (lawmaker.source !== adapter.source || lawmaker.externalId !== expectedExternalId) {
        throw new Error(`Adapter ${adapter.source} returned an unexpected lawmaker`);
      }
    }
    await repository.upsertLawmakers(lawmakers);
  }
  await repository.upsertBillGraph(graph);
  return graph;
}
