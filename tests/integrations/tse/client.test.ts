import { Buffer } from "node:buffer";
import { deflateRawSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import {
  parseCandidateExternalId,
  TseOpenDataClient,
} from "#/integrations/tse/client";

interface ZipFixtureEntry {
  name: string;
  contents: string | Uint8Array;
  compression?: "stored" | "deflate";
  dataDescriptor?: boolean;
  declaredUncompressedSize?: number;
}

function crc32(contents: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of contents) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function storedZip(entries: readonly ZipFixtureEntry[]): Uint8Array {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const fixture of entries) {
    const name = Buffer.from(fixture.name, "utf8");
    const contents = typeof fixture.contents === "string"
      ? Buffer.from(fixture.contents, "latin1")
      : Buffer.from(fixture.contents);
    const compressed = fixture.compression === "deflate" ? deflateRawSync(contents) : contents;
    const checksum = crc32(contents);
    const flags = fixture.dataDescriptor ? 0x08 : 0;
    const compressionMethod = fixture.compression === "deflate" ? 8 : 0;
    const declaredSize = fixture.declaredUncompressedSize ?? contents.byteLength;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(compressionMethod, 8);
    local.writeUInt32LE(fixture.dataDescriptor ? 0 : checksum, 14);
    local.writeUInt32LE(fixture.dataDescriptor ? 0 : compressed.byteLength, 18);
    local.writeUInt32LE(fixture.dataDescriptor ? 0 : declaredSize, 22);
    local.writeUInt16LE(name.byteLength, 26);
    const descriptor = fixture.dataDescriptor ? Buffer.alloc(16) : Buffer.alloc(0);
    if (fixture.dataDescriptor) {
      descriptor.writeUInt32LE(0x08074b50, 0);
      descriptor.writeUInt32LE(checksum, 4);
      descriptor.writeUInt32LE(compressed.byteLength, 8);
      descriptor.writeUInt32LE(contents.byteLength, 12);
    }
    localParts.push(local, name, compressed, descriptor);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(compressionMethod, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.byteLength, 20);
    central.writeUInt32LE(declaredSize, 24);
    central.writeUInt16LE(name.byteLength, 28);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.byteLength + name.byteLength + compressed.byteLength + descriptor.byteLength;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.byteLength, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

function fakeZipFetch(entries: readonly ZipFixtureEntry[]): typeof fetch {
  const archive = storedZip(entries);
  return async () => new Response(archive as BodyInit, {
    headers: { "content-type": "application/zip" },
  });
}

function streamingZipFetch(
  archive: Uint8Array,
  options: { chunkBytes?: number; onPull?: (bytes: number) => void } = {},
): typeof fetch {
  const chunkBytes = options.chunkBytes ?? 1_024;
  return async () => {
    let offset = 0;
    return new Response(new ReadableStream<Uint8Array>({
      pull(controller) {
        if (offset >= archive.byteLength) {
          controller.close();
          return;
        }
        const end = Math.min(offset + chunkBytes, archive.byteLength);
        const chunk = archive.slice(offset, end);
        offset = end;
        options.onPull?.(chunk.byteLength);
        controller.enqueue(chunk);
      },
    }) as BodyInit, { headers: { "content-type": "application/zip" } });
  };
}

const candidateHeader = [
  "ANO_ELEICAO", "SQ_CANDIDATO", "NM_CANDIDATO", "NM_URNA_CANDIDATO",
  "NR_CANDIDATO", "DS_CARGO", "SG_UF", "SG_PARTIDO", "NR_PARTIDO",
  "DS_SITUACAO_CANDIDATURA",
].join(";");

function candidateCsv(rows: readonly [string, string][]): string {
  return `${candidateHeader}\r\n${rows.map(([id, name]) =>
    `2026;${id};${name};${name};1234;DEPUTADO FEDERAL;ES;ABC;12;APTO`
  ).join("\r\n")}\r\n`;
}

async function collectRows(
  client: TseOpenDataClient,
  signal?: AbortSignal,
): Promise<Record<string, string>[]> {
  const rows: Record<string, string>[] = [];
  for await (const row of client.streamRows("candidates", signal)) rows.push(row);
  return rows;
}

async function consume(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

describe("TseOpenDataClient", () => {
  it("streams every Windows-1252 CSV row from the official 2026 resource", async () => {
    const client = new TseOpenDataClient({
      fetch: fakeZipFetch([{
        name: "consulta_cand_2026_ES.csv",
        contents: candidateCsv([
          ["260001234567", "ANA CIDADÃ"],
          ["260009876543", "JOÃO PÚBLICO"],
        ]),
      }]),
      baseUrl: "https://cdn.tse.jus.br/",
    });

    const rows = await collectRows(client);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ SQ_CANDIDATO: "260001234567", NM_CANDIDATO: "ANA CIDADÃ" });
    expect(rows[1]).toMatchObject({ SQ_CANDIDATO: "260009876543", NM_CANDIDATO: "JOÃO PÚBLICO" });
  });

  it("streams deflated entries that use a ZIP data descriptor", async () => {
    const client = new TseOpenDataClient({
      fetch: fakeZipFetch([{
        name: "consulta_cand_2026_ES.csv",
        contents: candidateCsv([["260001234567", "ANA CIDADÃ"]]),
        compression: "deflate",
        dataDescriptor: true,
      }]),
      baseUrl: "https://cdn.tse.jus.br/",
    });

    await expect(collectRows(client)).resolves.toHaveLength(1);
  });

  it("rejects an HTML response instead of treating it as an archive", async () => {
    const client = new TseOpenDataClient({
      fetch: async () => new Response("<html>bloqueado</html>", {
        headers: { "content-type": "text/html" },
      }),
      baseUrl: "https://cdn.tse.jus.br/",
    });

    await expect(collectRows(client)).rejects.toMatchObject({
      code: "INVALID_ARCHIVE_RESPONSE",
    });
  });

  it("rejects an archive without the documented resource entry", async () => {
    const client = new TseOpenDataClient({
      fetch: fakeZipFetch([{ name: "unrelated.csv", contents: "A;B\r\n1;2\r\n" }]),
      baseUrl: "https://cdn.tse.jus.br/",
    });

    await expect(collectRows(client)).rejects.toMatchObject({
      code: "INVALID_ARCHIVE_RESPONSE",
    });
  });

  it("caps the actual uncompressed bytes of each tabular entry", async () => {
    const client = new TseOpenDataClient({
      fetch: fakeZipFetch([{
        name: "consulta_cand_2026_ES.csv",
        contents: candidateCsv([["260001234567", "ANA CIDADÃ"]]),
        declaredUncompressedSize: 8,
      }]),
      baseUrl: "https://cdn.tse.jus.br/",
      limits: { tabularEntryBytes: 16 },
    });

    await expect(collectRows(client, AbortSignal.timeout(1_000))).rejects.toMatchObject({
      code: "ARCHIVE_ENTRY_TOO_LARGE",
    });
  });

  it("caps ignored files and directory entries instead of autodraining them without a limit", async () => {
    const cases: ZipFixtureEntry[][] = [
      [{ name: "ignored.bin", contents: "x".repeat(128), declaredUncompressedSize: 8 }],
      [{ name: "padding/", contents: "x".repeat(128), dataDescriptor: true }],
    ];

    for (const entries of cases) {
      const client = new TseOpenDataClient({
        fetch: fakeZipFetch(entries),
        baseUrl: "https://cdn.tse.jus.br/",
        limits: { tabularEntryBytes: 16 },
      });
      await expect(collectRows(client)).rejects.toMatchObject({ code: "ARCHIVE_ENTRY_TOO_LARGE" });
    }
  });

  it("rejects a declared oversize entry without downloading its full payload", async () => {
    const archive = storedZip([{
      name: "ignored.bin",
      contents: "x".repeat(1024 * 1024),
      declaredUncompressedSize: 1024 * 1024 * 1024,
    }]);
    let pulledBytes = 0;
    const client = new TseOpenDataClient({
      fetch: streamingZipFetch(archive, { onPull: (bytes) => { pulledBytes += bytes; } }),
      baseUrl: "https://cdn.tse.jus.br/",
      limits: { tabularEntryBytes: 16 },
    });

    await expect(collectRows(client)).rejects.toMatchObject({ code: "ARCHIVE_ENTRY_TOO_LARGE" });
    expect(pulledBytes).toBeLessThan(archive.byteLength / 2);
  });

  it("rejects an overlong CSV record independently of the entry limit", async () => {
    const client = new TseOpenDataClient({
      fetch: fakeZipFetch([{
        name: "consulta_cand_2026_ES.csv",
        contents: `${candidateHeader}\r\n2026;260001234567;${"A".repeat(128)};ANA;1234;DEPUTADO FEDERAL;ES;ABC;12;APTO\r\n`,
      }]),
      baseUrl: "https://cdn.tse.jus.br/",
      limits: { tabularEntryBytes: 1_024, tabularRecordBytes: 64 },
    });

    await expect(collectRows(client)).rejects.toMatchObject({ code: "INVALID_TABULAR_RESOURCE" });
  });

  it("applies backpressure instead of reading the whole ZIP before the consumer advances", async () => {
    const rows = Array.from({ length: 5_000 }, (_, index) =>
      [`${260000000000 + index}`, `CANDIDATO ${index}`] as [string, string]
    );
    const archive = storedZip([{
      name: "consulta_cand_2026_ES.csv",
      contents: candidateCsv(rows),
    }]);
    let pulledBytes = 0;
    const client = new TseOpenDataClient({
      fetch: streamingZipFetch(archive, {
        chunkBytes: 256,
        onPull: (bytes) => { pulledBytes += bytes; },
      }),
      baseUrl: "https://cdn.tse.jus.br/",
    });
    const iterator = client.streamRows("candidates")[Symbol.asyncIterator]();

    await expect(iterator.next()).resolves.toMatchObject({ done: false });
    expect(pulledBytes).toBeLessThan(archive.byteLength);
    await iterator.return?.(undefined as never);
  });

  it("rejects nonexistent UF suffixes, duplicate basenames and unexpected schemas", async () => {
    const invalidCases: ZipFixtureEntry[][] = [
      [{ name: "consulta_cand_2026_ZZ.csv", contents: candidateCsv([["260001234567", "ANA"]]) }],
      [
        { name: "a/consulta_cand_2026_ES.csv", contents: candidateCsv([["260001234567", "ANA"]]) },
        { name: "b/consulta_cand_2026_ES.csv", contents: candidateCsv([["260009876543", "JOÃO"]]) },
      ],
      [{ name: "consulta_cand_2026_ES.csv", contents: "FOO;BAR\r\n1;2\r\n" }],
    ];

    for (const entries of invalidCases) {
      const client = new TseOpenDataClient({ fetch: fakeZipFetch(entries), baseUrl: "https://cdn.tse.jus.br/" });
      await expect(collectRows(client)).rejects.toMatchObject({
        code: expect.stringMatching(/INVALID_(?:ARCHIVE_RESPONSE|TABULAR_SCHEMA)|DUPLICATE_ARCHIVE_ENTRY/),
      });
    }
  });

  it("accepts only the three documented campaign-account filename families", async () => {
    const invalid = new TseOpenDataClient({
      fetch: fakeZipFetch([{
        name: "prestacao_de_contas_candidatos_2026_ES.csv",
        contents: "ANO_ELEICAO;SQ_CANDIDATO;VR_RECEITA\r\n2026;260001234567;10,00\r\n",
      }]),
      baseUrl: "https://cdn.tse.jus.br/",
    });
    await expect(async () => {
      for await (const _row of invalid.streamRows("campaignAccounts")) void _row;
    }).rejects.toMatchObject({ code: "INVALID_ARCHIVE_RESPONSE" });

    const valid = new TseOpenDataClient({
      fetch: fakeZipFetch([{
        name: "receitas_candidatos_2026_ES.csv",
        contents: "ANO_ELEICAO;SQ_CANDIDATO;VR_RECEITA\r\n2026;260001234567;10,00\r\n",
      }]),
      baseUrl: "https://cdn.tse.jus.br/",
    });
    const rows = [];
    for await (const row of valid.streamRows("campaignAccounts")) rows.push(row);
    expect(rows).toHaveLength(1);
  });

  it("requires the value column that corresponds to each expense subtype", async () => {
    const cases = [
      {
        filename: "despesas_contratadas_candidatos_2026_ES.csv",
        valueColumn: "VR_DESPESA_CONTRATADA",
        accepted: true,
      },
      {
        filename: "despesas_contratadas_candidatos_2026_ES.csv",
        valueColumn: "VR_PAGTO",
        accepted: false,
      },
      {
        filename: "despesas_pagas_candidatos_2026_ES.csv",
        valueColumn: "VR_PAGTO",
        accepted: true,
      },
      {
        filename: "despesas_pagas_candidatos_2026_ES.csv",
        valueColumn: "VR_DESPESA_CONTRATADA",
        accepted: false,
      },
    ] as const;

    for (const fixture of cases) {
      const client = new TseOpenDataClient({
        fetch: fakeZipFetch([{
          name: fixture.filename,
          contents: `ANO_ELEICAO;SQ_CANDIDATO;${fixture.valueColumn}\r\n2026;260001234567;10,00\r\n`,
        }]),
        baseUrl: "https://cdn.tse.jus.br/",
      });
      const consumeRows = async () => {
        const rows = [];
        for await (const row of client.streamRows("campaignAccounts")) rows.push(row);
        return rows;
      };

      if (fixture.accepted) {
        await expect(consumeRows()).resolves.toHaveLength(1);
      } else {
        await expect(consumeRows()).rejects.toMatchObject({ code: "INVALID_TABULAR_SCHEMA" });
      }
    }
  });

  it("exposes the controlled archive subtype and official provenance for campaign rows", async () => {
    const client = new TseOpenDataClient({
      fetch: fakeZipFetch([
        {
          name: "receitas_candidatos_2026_ES.csv",
          contents: "ANO_ELEICAO;SQ_CANDIDATO;VR_RECEITA\r\n2026;260001234567;10,00\r\n",
        },
        {
          name: "despesas_contratadas_candidatos_2026_ES.csv",
          contents: "ANO_ELEICAO;SQ_CANDIDATO;VR_DESPESA_CONTRATADA\r\n2026;260001234567;8,00\r\n",
        },
        {
          name: "despesas_pagas_candidatos_2026_ES.csv",
          contents: "ANO_ELEICAO;SQ_CANDIDATO;VR_PAGTO\r\n2026;260001234567;7,00\r\n",
        },
      ]),
      baseUrl: "https://cdn.tse.jus.br/",
    });
    const entries = [];

    for await (const entry of client.streamRowEntries("campaignAccounts")) entries.push(entry);

    expect(entries.map(({ entryKind, sourceArchiveUrl, row }) => ({
      entryKind,
      sourceArchiveUrl,
      value: row.VR_RECEITA ?? row.VR_DESPESA_CONTRATADA ?? row.VR_PAGTO,
    }))).toEqual([
      {
        entryKind: "campaignReceipts",
        sourceArchiveUrl: "https://cdn.tse.jus.br/estatistica/sead/odsele/prestacao_contas/prestacao_de_contas_eleitorais_candidatos_2026.zip",
        value: "10,00",
      },
      {
        entryKind: "campaignContractedExpenses",
        sourceArchiveUrl: "https://cdn.tse.jus.br/estatistica/sead/odsele/prestacao_contas/prestacao_de_contas_eleitorais_candidatos_2026.zip",
        value: "8,00",
      },
      {
        entryKind: "campaignPaidExpenses",
        sourceArchiveUrl: "https://cdn.tse.jus.br/estatistica/sead/odsele/prestacao_contas/prestacao_de_contas_eleitorais_candidatos_2026.zip",
        value: "7,00",
      },
    ]);
  });

  it("emits a completion manifest containing campaign subtypes with zero data rows", async () => {
    const client = new TseOpenDataClient({
      fetch: fakeZipFetch([
        {
          name: "receitas_candidatos_2026_ES.csv",
          contents: "ANO_ELEICAO;SQ_CANDIDATO;VR_RECEITA\r\n",
        },
        {
          name: "despesas_contratadas_candidatos_2026_ES.csv",
          contents: "ANO_ELEICAO;SQ_CANDIDATO;VR_DESPESA_CONTRATADA\r\n",
        },
        {
          name: "despesas_pagas_candidatos_2026_ES.csv",
          contents: "ANO_ELEICAO;SQ_CANDIDATO;VR_PAGTO\r\n",
        },
      ]),
      baseUrl: "https://cdn.tse.jus.br/",
    });
    const events = [];

    for await (const event of client.streamResource("campaignAccounts")) events.push(event);

    expect(events).toEqual([{
      type: "manifest",
      resource: "campaignAccounts",
      entryKinds: [
        "campaignReceipts",
        "campaignContractedExpenses",
        "campaignPaidExpenses",
      ],
      sourceArchiveUrl: "https://cdn.tse.jus.br/estatistica/sead/odsele/prestacao_contas/prestacao_de_contas_eleitorais_candidatos_2026.zip",
    }]);
  });

  it("rejects traversal before exposing a regional media entry", async () => {
    const client = new TseOpenDataClient({
      fetch: fakeZipFetch([{
        name: "../260001234567.jpg",
        contents: Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00]),
      }]),
      baseUrl: "https://cdn.tse.jus.br/",
    });

    await expect(async () => {
      for await (const entry of client.streamRegionalMedia("photos", "ES")) {
        await consume(entry.content);
      }
    }).rejects.toMatchObject({ code: "UNSAFE_ARCHIVE_ENTRY" });
  });

  it("streams valid photos with candidate identity derived from the filename", async () => {
    const client = new TseOpenDataClient({
      fetch: fakeZipFetch([{
        name: "fotos/FC_260001234567_div.jpg",
        contents: Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x01, 0x02]),
      }]),
      baseUrl: "https://cdn.tse.jus.br/",
    });

    const received = [];
    for await (const entry of client.streamRegionalMedia("photos", "ES")) {
      received.push({
        candidateExternalId: entry.candidateExternalId,
        filename: entry.originalFilename,
        mimeType: entry.mimeType,
        contents: await consume(entry.content),
      });
    }

    expect(received).toEqual([{
      candidateExternalId: "260001234567",
      filename: "FC_260001234567_div.jpg",
      mimeType: "image/jpeg",
      contents: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x01, 0x02]),
    }]);
  });

  it("rejects an image whose magic bytes do not match its extension", async () => {
    const client = new TseOpenDataClient({
      fetch: fakeZipFetch([{
        name: "260001234567.jpg",
        contents: "%PDF-1.7",
      }]),
      baseUrl: "https://cdn.tse.jus.br/",
    });

    await expect(async () => {
      for await (const entry of client.streamRegionalMedia("photos", "ES")) {
        await consume(entry.content);
      }
    }).rejects.toMatchObject({ code: "INVALID_MEDIA_FORMAT" });
  });

  it("enforces per-file and total regional media limits on actual bytes", async () => {
    const perFileClient = new TseOpenDataClient({
      fetch: fakeZipFetch([{
        name: "260001234567.jpg",
        contents: Uint8Array.from([0xff, 0xd8, 0xff, ...new Uint8Array(64)]),
        declaredUncompressedSize: 4,
      }]),
      baseUrl: "https://cdn.tse.jus.br/",
      limits: { mediaEntryBytes: 16 },
    });
    await expect(async () => {
      for await (const entry of perFileClient.streamRegionalMedia("photos", "ES")) await consume(entry.content);
    }).rejects.toMatchObject({ code: "ARCHIVE_ENTRY_TOO_LARGE" });

    const totalClient = new TseOpenDataClient({
      fetch: fakeZipFetch([
        { name: "260001234567.jpg", contents: Uint8Array.from([0xff, 0xd8, 0xff, 1, 2, 3]) },
        { name: "260009876543.jpg", contents: Uint8Array.from([0xff, 0xd8, 0xff, 4, 5, 6]) },
      ]),
      baseUrl: "https://cdn.tse.jus.br/",
      limits: { mediaArchiveBytes: 10 },
    });
    await expect(async () => {
      for await (const entry of totalClient.streamRegionalMedia("photos", "ES")) await consume(entry.content);
    }).rejects.toMatchObject({ code: "ARCHIVE_TOTAL_TOO_LARGE" });
  });

  it("rejects a regional archive without any expected media entry", async () => {
    const client = new TseOpenDataClient({
      fetch: fakeZipFetch([]),
      baseUrl: "https://cdn.tse.jus.br/",
    });

    await expect(async () => {
      for await (const _entry of client.streamRegionalMedia("photos", "ES")) void _entry;
    }).rejects.toMatchObject({ code: "INVALID_ARCHIVE_RESPONSE" });
  });

  it("rejects redirects to a host outside the official CDN", async () => {
    let cancelled = false;
    const client = new TseOpenDataClient({
      fetch: async () => new Response(new ReadableStream({
        cancel() { cancelled = true; },
      }) as BodyInit, {
        status: 302,
        headers: { location: "https://example.org/archive.zip" },
      }),
      baseUrl: "https://cdn.tse.jus.br/",
    });

    await expect(collectRows(client)).rejects.toMatchObject({
      code: "UNSAFE_ARCHIVE_REDIRECT",
    });
    expect(cancelled).toBe(true);
  });

  it("cancels a redirect body when Location is syntactically invalid", async () => {
    let cancelled = false;
    const client = new TseOpenDataClient({
      fetch: async () => new Response(new ReadableStream({
        cancel() { cancelled = true; },
      }) as BodyInit, {
        status: 302,
        headers: { location: "http://[" },
      }),
      baseUrl: "https://cdn.tse.jus.br/",
    });

    await expect(collectRows(client)).rejects.toMatchObject({
      code: "UNSAFE_ARCHIVE_REDIRECT",
    });
    expect(cancelled).toBe(true);
  });

  it("cancels invalid HTTP bodies before rejecting", async () => {
    let cancelled = false;
    const client = new TseOpenDataClient({
      fetch: async () => new Response(new ReadableStream({
        cancel() { cancelled = true; },
      }) as BodyInit, {
        status: 503,
        headers: { "content-type": "application/zip" },
      }),
      baseUrl: "https://cdn.tse.jus.br/",
    });

    await expect(collectRows(client)).rejects.toMatchObject({ code: "INVALID_ARCHIVE_RESPONSE" });
    expect(cancelled).toBe(true);
  });

  it("reports caller cancellation while streaming the response body", async () => {
    const controller = new AbortController();
    const client = new TseOpenDataClient({
      fetch: async () => new Response(new ReadableStream<Uint8Array>({
        start(streamController) {
          streamController.enqueue(Uint8Array.from([0x50, 0x4b, 0x03, 0x04]));
        },
        pull() { return new Promise(() => undefined); },
      }) as BodyInit, { headers: { "content-type": "application/zip" } }),
      baseUrl: "https://cdn.tse.jus.br/",
    });
    setTimeout(() => controller.abort(), 10);

    await expect(collectRows(client, controller.signal)).rejects.toMatchObject({
      code: "TSE_REQUEST_ABORTED",
    });
  });

  it("accepts only the canonical CDN origin and root base path", () => {
    expect(() => new TseOpenDataClient({ baseUrl: "https://cdn.tse.jus.br:444/" }))
      .toThrowError(expect.objectContaining({ code: "INVALID_TSE_BASE_URL" }));
    expect(() => new TseOpenDataClient({ baseUrl: "https://cdn.tse.jus.br/qualquer/" }))
      .toThrowError(expect.objectContaining({ code: "INVALID_TSE_BASE_URL" }));
  });
});

describe("parseCandidateExternalId", () => {
  it("accepts exactly one 12-digit SQ_CANDIDATO token", () => {
    expect(parseCandidateExternalId("FC_260001234567_div.jpg")).toBe("260001234567");
  });

  it("rejects missing, shorter and ambiguous identifiers", () => {
    expect(() => parseCandidateExternalId("photo.jpg")).toThrow();
    expect(() => parseCandidateExternalId("12345678901.jpg")).toThrow();
    expect(() => parseCandidateExternalId("260001234567_260009876543.jpg")).toThrow();
    expect(() => parseCandidateExternalId("260001234567_260001234567.jpg")).toThrow();
  });
});
