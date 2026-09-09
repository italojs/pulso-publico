import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("production database assets", () => {
  it("keeps production secrets local and admin credentials out of app config", async () => {
    const gitignore = await readFile(".gitignore", "utf8");
    const runbook = await readFile("docs/operations/galaxy-production.md", "utf8");
    const galaxy = await readFile("galaxy.json", "utf8");

    expect(gitignore).toContain(".env.production.local");
    expect(gitignore).toContain(".galaxy/");
    expect(runbook).not.toMatch(/postgres(?:ql)?:\/\/[^\s<]+:[^\s<]+@/iu);
    expect(galaxy).not.toContain("DATABASE_URL");
    expect(galaxy).not.toMatch(/password|credential|secret/iu);
  });

  it("uses parameterized, fail-closed bootstrap SQL", async () => {
    const bootstrap = await readFile("scripts/bootstrap-production-database.sql", "utf8");

    expect(bootstrap).toContain("\\set ON_ERROR_STOP on");
    expect(bootstrap).toContain(':"app_role"');
    expect(bootstrap).toContain(":'app_password'");
    expect(bootstrap).toContain(':"app_database"');
    expect(bootstrap).toMatch(/NOSUPERUSER/);
    expect(bootstrap).toMatch(/NOCREATEDB/);
    expect(bootstrap).toMatch(/NOCREATEROLE/);
    expect(bootstrap).not.toMatch(/pulse_app[^\n]*PASSWORD\s+'[^']+'/iu);
  });

  it("documents the exact one-container Galaxy contract", async () => {
    const runbook = await readFile("docs/operations/galaxy-production.md", "utf8");

    for (const value of [
      "Node 22",
      "Production",
      "um contêiner",
      "npm ci",
      "npm run build",
      "npm start",
      "/api/health",
      "NODE_ENV=production",
      "GEO_PROVIDER=none",
      "LEGISLATIVE_HISTORY_START_YEAR=1946",
      "https://dadosabertos.camara.leg.br/api/v2",
      "https://legis.senado.leg.br/dadosabertos",
    ]) {
      expect(runbook).toContain(value);
    }
  });

  it("keeps the verification command output allowlisted", async () => {
    const verifier = await readFile("scripts/verify-production-database.ts", "utf8");

    expect(verifier).toContain("pg_database_size");
    expect(verifier).toContain("rolsuper");
    expect(verifier).not.toMatch(/console\.(?:log|error)\([^\n]*DATABASE_URL/);
    expect(verifier).not.toMatch(/console\.(?:log|error)\([^\n]*process\.env/);
  });
});
