import type { BillSummaryProvider } from "#/ai/summary";
import { generateValidatedSummary } from "#/ai/summary";
import type { AiSummaryRepository } from "#/ai/repository";

export async function generateSummaryBatch(repository: AiSummaryRepository, provider: BillSummaryProvider, limit = 20) {
  const pending = await repository.listPending(Math.min(Math.max(limit, 1), 100));
  let generated = 0;
  const errors: Array<{ billId: string; code: string }> = [];
  for (const item of pending) {
    try {
      await repository.save(item.billId, await generateValidatedSummary(provider, item.input));
      generated += 1;
    } catch (error) {
      errors.push({ billId: item.billId, code: error instanceof Error ? error.message : "UNKNOWN" });
    }
  }
  return { selected: pending.length, generated, failed: errors.length, errors };
}
