import { getViteConfig } from "astro/config";

// Intentionally outside src/: npm test stays fast and never requires a database.
export default getViteConfig({
  test: { include: ["tests/database/**/*.test.ts"], testTimeout: 30_000, hookTimeout: 30_000 },
});
