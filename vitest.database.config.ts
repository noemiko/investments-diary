import { getViteConfig } from "astro/config";

// Intentionally outside src/: npm test stays fast and never requires a database.
export default getViteConfig({
  test: {
    include: ["tests/database/**/*.test.ts"],
    // Snapshot capture scans all wallets; another file's user cleanup can race its inserts.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
