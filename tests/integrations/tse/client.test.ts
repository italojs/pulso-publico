import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import {
  parseCandidateExternalId,
  TseOpenDataClient,
} from "#/integrations/tse/client";

interface ZipFixtureEntry {
  name: string;
  contents: string | Uint8Array;
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
    const checksum = crc32(contents);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(contents.byteLength, 18);
    local.writeUInt32LE(contents.byteLength, 22);
    local.writeUInt16LE(name.byteLength, 26);
    localParts.push(local, name, contents);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(contents.byteLength, 20);
    central.writeUInt32LE(contents.byteLength, 24);
    central.writeUInt16LE(name.byteLength, 28);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.byteLength + name.byteLength + contents.byteLength;
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

async function collectRows(client: TseOpenDataClient): Promise<Record<string, string>[]> {
  const rows: Record<string, string>[] = [];
  for await (const row of client.streamRows("candidates")) rows.push(row);
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
        contents: "SQ_CANDIDATO;NM_CANDIDATO\r\n260001234567;ANA CIDADÃ\r\n260009876543;JOÃO PÚBLICO\r\n",
      }]),
      baseUrl: "https://cdn.tse.jus.br/",
    });

    await expect(collectRows(client)).resolves.toEqual([
      { SQ_CANDIDATO: "260001234567", NM_CANDIDATO: "ANA CIDADÃ" },
      { SQ_CANDIDATO: "260009876543", NM_CANDIDATO: "JOÃO PÚBLICO" },
    ]);
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
        contents: "SQ_CANDIDATO;NM_CANDIDATO\r\n260001234567;ANA CIDADÃ\r\n",
      }]),
      baseUrl: "https://cdn.tse.jus.br/",
      limits: { tabularEntryBytes: 16 },
    });

    await expect(collectRows(client)).rejects.toMatchObject({
      code: "ARCHIVE_ENTRY_TOO_LARGE",
    });
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
    const client = new TseOpenDataClient({
      fetch: async () => new Response(null, {
        status: 302,
        headers: { location: "https://example.org/archive.zip" },
      }),
      baseUrl: "https://cdn.tse.jus.br/",
    });

    await expect(collectRows(client)).rejects.toMatchObject({
      code: "UNSAFE_ARCHIVE_REDIRECT",
    });
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
