import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      include: ["src/domain/**"],
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 },
    },
  },
});
