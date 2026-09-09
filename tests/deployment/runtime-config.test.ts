import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import nextConfig from "../../next.config.ts";

describe("production runtime configuration", () => {
  it("targets Node 22 and emits a standalone Galaxy build", async () => {
    const [nodeVersion, nvmrc, packageJson, galaxy] = await Promise.all([
      readFile(".node-version", "utf8"),
      readFile(".nvmrc", "utf8"),
      readFile("package.json", "utf8").then((value) => JSON.parse(value) as {
        engines: { node: string };
      }),
      readFile("galaxy.json", "utf8").then((value) => JSON.parse(value) as unknown),
    ]);

    expect(nodeVersion.trim()).toBe("22.23.2");
    expect(nvmrc.trim()).toBe("22.23.2");
    expect(packageJson.engines.node).toBe(">=22 <23");
    expect(nextConfig.output).toBe("standalone");
    expect(galaxy).toMatchObject({
      commands: {
        install: "npm ci",
        build: "npm run build",
        start: "npm start",
      },
      health: { path: "/api/health" },
    });
  });
});
