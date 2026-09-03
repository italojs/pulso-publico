import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    restoreMocks: true,
    env: {
      DATABASE_URL:
        process.env.TEST_DATABASE_URL
        ?? "postgres://app:app@localhost:5432/legislativo_test",
    },
  },
  resolve: {
    alias: {
      "#/": new URL("./src/", import.meta.url).pathname,
    },
  },
});
