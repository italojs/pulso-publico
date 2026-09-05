import { compareCandidates } from "#/server/candidates/queries";
import {
  parseCandidateComparisonSearchParams,
  type CandidateRawSearchParams,
} from "#/server/candidates/search-params";
import { db } from "#/server/db/client";
import type { PublicCandidateComparison } from "#/server/candidates/read-models";
import { CandidateComparison } from "#/ui/candidate-comparison";

export const dynamic = "force-dynamic";

export default async function CandidateComparisonPage({ searchParams }: Readonly<{
  searchParams: Promise<CandidateRawSearchParams>;
}>) {
  const selection = parseCandidateComparisonSearchParams(await searchParams);
  let result: PublicCandidateComparison;
  if (!selection.valid) {
    result = { error: "CANDIDATES_NOT_FOUND" };
  } else if (selection.ids.length === 0) {
    result = { candidates: [] };
  } else {
    result = await compareCandidates(db, selection.year, selection.ids);
  }
  return <CandidateComparison result={result} selectedIds={selection.ids} year={selection.year} />;
}
