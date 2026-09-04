import { describe, expect, it, vi } from "vitest";

import {
  buildSummaryInput,
  generateValidatedSummary,
  summaryFingerprint,
} from "#/ai/summary";
import { OpenAiSummaryProvider } from "#/ai/openai-provider";

const input = buildSummaryInput({
  officialCode: "PEC 8/2025",
  officialTitle: "Proposta de Emenda à Constituição nº 8, de 2025",
  officialSummary: "Reduz a jornada semanal e altera a escala de trabalho.",
});

describe("plain-language bill summaries", () => {
  it("creates a stable fingerprint from official input and prompt version", () => {
    expect(summaryFingerprint(input)).toBe(summaryFingerprint({ ...input }));
    expect(summaryFingerprint({ ...input, officialSummary: "Outro texto" })).not.toBe(summaryFingerprint(input));
  });

  it("accepts only the two approved fields within their limits", async () => {
    const provider = { model: "test-model", generate: vi.fn().mockResolvedValue({
      friendlyTitle: "Jornada de trabalho com dois dias de descanso",
      shortDescription: "A proposta muda a jornada semanal e a organização da escala de trabalho.",
    }) };

    await expect(generateValidatedSummary(provider, input)).resolves.toMatchObject({
      friendlyTitle: "Jornada de trabalho com dois dias de descanso",
      model: "test-model",
      promptVersion: "plain-language-v1",
    });
  });

  it("rejects unexpected or oversized model output", async () => {
    const provider = { model: "test-model", generate: vi.fn().mockResolvedValue({
      friendlyTitle: "x".repeat(121),
      shortDescription: "Descrição",
      recommendation: "Apoie",
    }) };

    await expect(generateValidatedSummary(provider, input)).rejects.toThrow("Invalid AI summary");
  });

  it("uses Responses structured output without storing the request", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({
        friendlyTitle: "Escala com dois dias de descanso",
        shortDescription: "A proposta altera a jornada semanal prevista na Constituição.",
      }) }] }],
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const provider = new OpenAiSummaryProvider({ apiKey: "test-key", model: "test-model", fetcher });

    await expect(provider.generate(input)).resolves.toMatchObject({
      friendlyTitle: "Escala com dois dias de descanso",
    });
    const [, request] = fetcher.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(request.body)) as Record<string, unknown>;
    expect(body).toMatchObject({ model: "test-model", store: false });
    expect(body.text).toMatchObject({ format: { type: "json_schema", strict: true } });
    expect((request.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
  });
});
