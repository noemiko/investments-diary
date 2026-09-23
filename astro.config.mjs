// @ts-check
import { defineConfig, envField } from "astro/config";

import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";

import vercel from "@astrojs/vercel";

// https://astro.build/config
export default defineConfig({
  output: "server",
  site: "https://investments-diary.vercel.app",
  integrations: [react(), sitemap()],

  vite: {
    plugins: [tailwindcss()],
  },

  env: {
    schema: {
      SUPABASE_URL: envField.string({ context: "server", access: "secret", optional: false }),
      SUPABASE_KEY: envField.string({ context: "server", access: "secret", optional: false }),
    },
  },
  adapter: vercel(),
});
