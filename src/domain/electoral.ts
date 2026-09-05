import { z } from "zod";

export const CandidateOffice = z.enum([
  "presidente",
  "vice_presidente",
  "governador",
  "vice_governador",
  "senador",
  "primeiro_suplente",
  "segundo_suplente",
  "deputado_federal",
  "deputado_estadual",
  "deputado_distrital",
]);

export const ElectoralCandidateRecord = z.object({
  electionYear: z.number().int().min(2026),
  externalId: z.string().min(1),
  fullName: z.string().min(1),
  ballotName: z.string().min(1),
  socialName: z.string().nullable(),
  number: z.number().int().nonnegative(),
  office: CandidateOffice,
  round: z.number().int().positive(),
  region: z.string().min(2).max(3),
  electoralUnit: z.string().min(1),
  status: z.string().min(1),
  statusDetail: z.string().nullable(),
  partyAcronym: z.string().min(1),
  partyNumber: z.number().int().positive(),
  partyName: z.string().min(1),
  federation: z.string().nullable(),
  coalition: z.string().nullable(),
  seekingReelection: z.boolean().nullable(),
  birthDate: z.iso.date().nullable(),
  ageAtInauguration: z.number().int().nonnegative().nullable(),
  gender: z.string().nullable(),
  race: z.string().nullable(),
  education: z.string().nullable(),
  occupation: z.string().nullable(),
  maritalStatus: z.string().nullable(),
  nationality: z.string().nullable(),
  birthRegion: z.string().nullable(),
  birthCity: z.string().nullable(),
  officialUrl: z.url(),
  checkedAt: z.iso.datetime(),
}).strict();

export const CandidateAssetRecord = z.object({
  electionYear: z.number().int().min(2026),
  candidateExternalId: z.string().min(1),
  sourceOrder: z.number().int().positive(),
  category: z.string().min(1),
  description: z.string().nullable(),
  valueCents: z.bigint(),
}).strict();

export const CampaignEntryKind = z.enum(["receipt", "expense"]);

export const CampaignEntryRecord = z.object({
  electionYear: z.number().int().min(2026),
  candidateExternalId: z.string().min(1),
  kind: CampaignEntryKind,
  category: z.string().nullable(),
  valueCents: z.bigint().nonnegative(),
}).strict();

export const CandidateSocialLinkRecord = z.object({
  electionYear: z.number().int().min(2026),
  candidateExternalId: z.string().min(1),
  label: z.string().min(1),
  url: z.url().refine((value) => {
    try {
      const parsed = new URL(value);
      return (parsed.protocol === "http:" || parsed.protocol === "https:")
        && parsed.username === ""
        && parsed.password === "";
    } catch {
      return false;
    }
  }, "Social link must be credential-free HTTP(S)"),
}).strict();

export const CandidateGovernmentPlanRecord = z.object({
  electionYear: z.number().int().min(2026),
  candidateExternalId: z.string().min(1),
  officialUrl: z.url(),
  storageKey: z.string().min(1).nullable(),
  originalFilename: z.string().min(1).nullable(),
  sourceExtractedAt: z.iso.datetime().nullable(),
  checkedAt: z.iso.datetime(),
}).strict();

export const CandidateDocumentRecord = z.object({
  electionYear: z.number().int().min(2026),
  candidateExternalId: z.string().min(1),
  label: z.string().min(1),
  officialUrl: z.url(),
  storageKey: z.string().min(1).nullable(),
  originalFilename: z.string().min(1).nullable(),
  sourceExtractedAt: z.iso.datetime().nullable(),
  checkedAt: z.iso.datetime(),
}).strict();

export type CandidateOffice = z.infer<typeof CandidateOffice>;
export type ElectoralCandidate = z.infer<typeof ElectoralCandidateRecord>;
export type CandidateAsset = z.infer<typeof CandidateAssetRecord>;
export type CampaignEntry = z.infer<typeof CampaignEntryRecord>;
export type CandidateSocialLink = z.infer<typeof CandidateSocialLinkRecord>;
export type CandidateGovernmentPlan = z.infer<typeof CandidateGovernmentPlanRecord>;
export type CandidateDocument = z.infer<typeof CandidateDocumentRecord>;
