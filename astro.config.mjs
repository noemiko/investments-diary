// @ts-check
import { defineConfig, envField } from "astro/config";
import { execFileSync } from "node:child_process";
import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import sentry from "@sentry/astro";

import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";

import vercel from "@astrojs/vercel";

function localRelease() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: import.meta.dirname,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "local-unknown";
  }
}

const release = process.env.VERCEL_GIT_COMMIT_SHA ?? localRelease();
const environment = process.env.VERCEL_ENV ?? "development";
const uploadSourcemaps = Boolean(process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT);

/**
 * Public source maps must never survive into the deployment, even without upload credentials.
 * @param {string} directory
 */
async function removePublicMaps(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return;
    throw error;
  }
  await Promise.all(
    entries.map(async (entry) => {
      const target = join(directory, entry.name);
      if (entry.isDirectory()) await removePublicMaps(target);
      else if (entry.name.endsWith(".map")) await rm(target);
    }),
  );
}

// https://astro.build/config
export default defineConfig({
  output: "server",
  site: "https://investments-diary.vercel.app",
  integrations: [
    react(),
    sitemap(),
    sentry({
      telemetry: false,
      release: { name: release },
      sourcemaps: {
        disable: !uploadSourcemaps,
        filesToDeleteAfterUpload: [".vercel/output/static/**/*.map", "dist/client/**/*.map"],
      },
    }),
    {
      name: "private-source-maps",
      hooks: {
        "astro:build:done": async () => {
          await removePublicMaps(".vercel/output/static");
          await removePublicMaps("dist/client");
        },
      },
    },
  ],

  vite: {
    plugins: [tailwindcss()],
    define: {
      __SENTRY_RELEASE__: JSON.stringify(release),
      __SENTRY_ENVIRONMENT__: JSON.stringify(environment),
    },
    build: { sourcemap: uploadSourcemaps ? "hidden" : false },
  },

  env: {
    schema: {
      SUPABASE_URL: envField.string({ context: "server", access: "secret", optional: false }),
      SUPABASE_KEY: envField.string({ context: "server", access: "secret", optional: false }),
      SUPABASE_SERVICE_ROLE_KEY: envField.string({ context: "server", access: "secret", optional: true }),
      PORTFOLIO_DEPLOYMENT_ID: envField.string({ context: "server", access: "secret", optional: true }),
      PORTFOLIO_RECOVERY_KEYS: envField.string({ context: "server", access: "secret", optional: true }),
      PUBLIC_SENTRY_DSN: envField.string({ context: "client", access: "public", optional: true }),
    },
  },
  adapter: vercel(),
});
