import { notFound } from "next/navigation.js";

import { getCandidateDetail } from "#/server/candidates/queries";
import { db } from "#/server/db/client";
import { CandidateFollowButton } from "#/ui/candidate-follow-button";
import { CandidateProfile } from "#/ui/candidate-profile";

export const dynamic = "force-dynamic";

type RawSearchParams = Record<string, string | string[] | undefined>;

function positivePage(value: string | string[] | undefined): number {
  const scalar = Array.isArray(value) ? value[0] : value;
  if (!scalar || !/^\d{1,6}$/.test(scalar)) return 1;
  const parsed = Number(scalar);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 100_000 ? parsed : 1;
}

export default async function CandidateProfilePage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ year: string; externalId: string }>;
  searchParams: Promise<RawSearchParams>;
}>) {
  const { year: rawYear, externalId } = await params;
  if (!/^\d{4}$/.test(rawYear) || !/^\d{1,30}$/.test(externalId)) notFound();
  const year = Number(rawYear);
  if (!Number.isSafeInteger(year) || year < 2026) notFound();
  const rawPages = await searchParams;
  const detail = await getCandidateDetail(db, year, externalId, {
    projectPage: positivePage(rawPages.projetosPagina),
    votePage: positivePage(rawPages.votosPagina),
  });
  if (!detail) notFound();
  const href = `/candidatos/${detail.electionYear}/${encodeURIComponent(detail.externalId)}`;
  return <CandidateProfile candidate={detail} followAction={
    <CandidateFollowButton
      electionYear={detail.electionYear}
      externalId={detail.externalId}
      href={href}
    />
  } />;
}
