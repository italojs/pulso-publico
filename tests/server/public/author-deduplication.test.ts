import { describe, expect, it } from "vitest";

import type { PublicAuthor } from "#/server/public/read-models";
import { deduplicatePublicAuthors } from "#/server/public/queries";

describe("deduplicatePublicAuthors", () => {
  it("merges catalog and detailed authorship without losing richer fields", () => {
    const catalog = {
      source: "senado",
      name: "Câmara dos Deputados",
      party: null,
      kind: "Autoria informada pelo Senado",
      primary: true,
      lawmakerExternalId: null,
      officialUrl: "https://example.test/catalog",
    } satisfies PublicAuthor;
    const detailed = {
      ...catalog,
      kind: "CAMARA",
      officialUrl: "https://example.test/detail",
    } satisfies PublicAuthor;

    expect(deduplicatePublicAuthors([catalog, detailed])).toEqual([detailed]);
  });
});
