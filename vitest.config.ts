import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * `node:sqlite` is a Node 22 builtin that this Vite version does not know
 * about: it strips the `node:` prefix and then fails to resolve a package
 * called "sqlite". Marking it external leaves the import for Node to satisfy at
 * runtime, which is what it already does.
 */
const externalNodeSqlite = {
  name: "external-node-sqlite",
  // `pre` so this runs before Vite's own resolver strips the `node:` prefix.
  enforce: "pre" as const,
  resolveId(id: string) {
    return id === "node:sqlite" ? { id, external: true as const } : null;
  },
};

export default defineConfig({
  plugins: [externalNodeSqlite],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "server/**/*.test.ts"],
    coverage: {
      include: ["src/domain/**"],
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 },
    },
  },
});
