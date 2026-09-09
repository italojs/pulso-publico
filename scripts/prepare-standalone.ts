import { cp, mkdir } from "node:fs/promises";

const standaloneRoot = ".next/standalone";

await Promise.all([
  mkdir(`${standaloneRoot}/.next`, { recursive: true }),
  cp("public", `${standaloneRoot}/public`, { recursive: true, force: true }),
]);
await cp(".next/static", `${standaloneRoot}/.next/static`, {
  recursive: true,
  force: true,
});
