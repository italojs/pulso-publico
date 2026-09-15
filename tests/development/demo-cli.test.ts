import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function runDemo(extraEnv: Record<string, string>) {
  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error("Run this integration test with npm test");
  return spawnSync(process.execPath, [npmCli, "run", "db:seed:demo", "--silent"], {
    encoding: "utf8",
    timeout: 15_000,
    env: { ...process.env, DEMO_DATABASE_URL: "", ...extraEnv },
  });
}

describe("demo command startup safety", () => {
  it("loads the TypeScript command on Node 22 and rejects missing explicit target", () => {
    const result = runDemo({});
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stderr).code).toBe("DEMO_SETUP_ERROR");
  });

  it("rejects remote targets without disclosing credentials", () => {
    const result = runDemo({ DEMO_DATABASE_URL: "postgres://private-user:private-password@remote.invalid/pulso_demo" });
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stderr).code).toBe("DEMO_SETUP_ERROR");
    expect(result.stderr).not.toMatch(/private-user|private-password|remote\.invalid/);
  });

  it("rejects production execution before opening a connection", () => {
    const result = runDemo({ NODE_ENV: "production", DEMO_DATABASE_URL: "postgres://app:app@127.0.0.1:1/pulso_demo" });
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stderr).code).toBe("DEMO_SETUP_ERROR");
  });
});
