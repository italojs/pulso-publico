import { defineConfig } from "vitest/config";
import { assertLocalDisposableDatabaseUrl } from "./src/development/database-url.ts";

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    restoreMocks: true,
    env: {
      DATABASE_URL: assertLocalDisposableDatabaseUrl(
        process.env.TEST_DATABASE_URL
        ?? "postgres://app:app@127.0.0.1:5435/legislativo_test",
        "test",
      ),
    },
  },
  resolve: {
    alias: {
      "#/": new URL("./src/", import.meta.url).pathname,
    },
  },
});
