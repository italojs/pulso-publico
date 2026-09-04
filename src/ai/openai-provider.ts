import type { BillSummaryInput, BillSummaryProvider } from "#/ai/summary";

interface OpenAiProviderOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  fetcher?: typeof fetch;
}

function outputText(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const direct = Reflect.get(payload, "output_text");
  if (typeof direct === "string") return direct;
  const output = Reflect.get(payload, "output");
  if (!Array.isArray(output)) return null;
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = Reflect.get(item, "content");
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      if (Reflect.get(part, "type") === "output_text" && typeof Reflect.get(part, "text") === "string") {
        return Reflect.get(part, "text") as string;
      }
    }
  }
  return null;
}

export class OpenAiSummaryProvider implements BillSummaryProvider {
  readonly model: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor({ apiKey, model, baseUrl = "https://api.openai.com/v1", fetcher = fetch }: OpenAiProviderOptions) {
    this.apiKey = apiKey;
    this.model = model;
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.fetcher = fetcher;
  }

  async generate(input: BillSummaryInput): Promise<unknown> {
    const response = await this.fetcher(`${this.baseUrl}/responses`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        store: false,
        instructions: [
          "Você transforma linguagem legislativa brasileira em português simples e neutro.",
          "Use somente os dados oficiais fornecidos. Não acrescente impacto, intenção, opinião, previsão ou recomendação.",
          "O título deve explicar o assunto, sem sensacionalismo. A descrição deve ter uma ou duas frases para alguém leigo em política.",
        ].join(" "),
        input: `Identificação oficial: ${input.officialCode}\nTítulo oficial: ${input.officialTitle}\nEmenta oficial: ${input.officialSummary || "Não informada."}`,
        text: {
          format: {
            type: "json_schema",
            name: "bill_plain_language_summary",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                friendlyTitle: { type: "string", minLength: 8, maxLength: 120 },
                shortDescription: { type: "string", minLength: 20, maxLength: 420 },
              },
              required: ["friendlyTitle", "shortDescription"],
            },
          },
        },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`OpenAI summary request failed (${response.status})`);
    const text = outputText(await response.json());
    if (!text) throw new Error("OpenAI summary response did not contain output text");
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new Error("OpenAI summary response was not valid JSON");
    }
  }
}
