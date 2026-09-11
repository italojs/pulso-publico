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
  officialDocumentText: "O projeto reduz a jornada semanal e estabelece dois dias consecutivos de descanso.",
});

describe("plain-language bill summaries", () => {
  it("creates a stable fingerprint from official input and prompt version", () => {
    expect(summaryFingerprint(input)).toBe(summaryFingerprint({ ...input }));
    expect(summaryFingerprint({ ...input, officialSummary: "Outro texto" })).not.toBe(summaryFingerprint(input));
    expect(summaryFingerprint({ ...input, officialDocumentText: "Outro documento oficial" })).not.toBe(summaryFingerprint(input));
  });

  it("accepts a grounded practical impact within its limits", async () => {
    const provider = { model: "test-model", generate: vi.fn().mockResolvedValue({
      friendlyTitle: "Jornada de trabalho com dois dias de descanso",
      shortDescription: "A proposta muda a jornada semanal e a organização da escala de trabalho para trabalhadores abrangidos pela nova regra.",
      practicalImpact: "Na prática: a escala passaria a prever dois dias consecutivos de descanso, se o texto for aprovado e entrar em vigor.",
    }) };

    await expect(generateValidatedSummary(provider, input)).resolves.toMatchObject({
      friendlyTitle: "Jornada de trabalho com dois dias de descanso",
      model: "test-model",
      promptVersion: "plain-language-full-text-v3",
      practicalImpact: expect.stringMatching(/^Na prática:/),
    });
  });

  it("rejects unexpected or oversized model output", async () => {
    const provider = { model: "test-model", generate: vi.fn().mockResolvedValue({
      friendlyTitle: "x".repeat(121),
      shortDescription: "Descrição",
      practicalImpact: "Na prática: uma explicação que não deve ser aceita porque o restante do conteúdo é inválido.",
      recommendation: "Apoie",
    }) };

    await expect(generateValidatedSummary(provider, input)).rejects.toThrow("Invalid AI summary");
  });

  it("uses Responses structured output without storing the request", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({
        friendlyTitle: "Escala com dois dias de descanso",
        shortDescription: "A proposta altera a jornada semanal prevista na Constituição para criar uma nova regra geral de organização do trabalho.",
        practicalImpact: "Na prática: trabalhadores abrangidos teriam uma escala com dois dias consecutivos de descanso, se a mudança for aprovada.",
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
