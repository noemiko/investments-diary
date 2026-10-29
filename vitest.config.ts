/// <reference types="vitest/config" />
import { getViteConfig } from "astro/config";

// Astro's Vite config, so `@/` aliases and `astro/zod` resolve in tests as they do in the app
// (test-plan §3 Phase 1). Unit tests sit next to the pure module they cover: `src/lib/*.test.ts`.
export default getViteConfig({
  test: {
    include: ["src/**/*.test.ts", "scripts/**/__tests__/*.test.ts"],
  },
});
