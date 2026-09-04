import { createHash } from "node:crypto";

import { z } from "zod";

export const PROMPT_VERSION = "plain-language-v1";

export interface BillSummaryInput {
  officialCode: string;
  officialTitle: string;
  officialSummary: string;
  promptVersion: typeof PROMPT_VERSION;
}

export interface BillSummaryProvider {
  readonly model: string;
  generate(input: BillSummaryInput): Promise<unknown>;
}

const summaryOutput = z
  .object({
    friendlyTitle: z.string().trim().min(8).max(120),
    shortDescription: z.string().trim().min(20).max(420),
  })
  .strict();

export type BillSummaryOutput = z.infer<typeof summaryOutput>;

export function buildSummaryInput(input: Omit<BillSummaryInput, "promptVersion">): BillSummaryInput {
  return { ...input, promptVersion: PROMPT_VERSION };
}

export function summaryFingerprint(input: BillSummaryInput) {
  return createHash("sha256")
    .update(JSON.stringify([
      input.officialCode,
      input.officialTitle,
      input.officialSummary,
      input.promptVersion,
    ]))
    .digest("hex");
}

export async function generateValidatedSummary(provider: BillSummaryProvider, input: BillSummaryInput) {
  const result = summaryOutput.safeParse(await provider.generate(input));
  if (!result.success) throw new Error("Invalid AI summary");
  return {
    ...result.data,
    model: provider.model,
    promptVersion: input.promptVersion,
    sourceFingerprint: summaryFingerprint(input),
    generatedAt: new Date(),
  };
}
