import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(import.meta.dirname, "../..");
const configUrl = pathToFileURL(resolve(projectRoot, "astro.config.mjs")).href;

function configuredRelease(overrides: NodeJS.ProcessEnv = {}) {
  const env = { ...process.env, ...overrides };
  delete env.SENTRY_AUTH_TOKEN;
  delete env.SENTRY_ORG;
  delete env.SENTRY_PROJECT;
  const output = execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `const { default: config } = await import(${JSON.stringify(configUrl)}); process.stdout.write(config.vite.define.__SENTRY_RELEASE__);`,
    ],
    { cwd: dirname(projectRoot), env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  return output;
}

describe("Sentry build release configuration", () => {
  it("reads the project's commit when loaded from its non-repository parent", () => {
    const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: projectRoot, encoding: "utf8" }).trim();
    expect(configuredRelease({ VERCEL_GIT_COMMIT_SHA: undefined })).toBe(JSON.stringify(commit));
  });

  it("loads without Git and uses the local fallback", () => {
    expect(configuredRelease({ VERCEL_GIT_COMMIT_SHA: undefined, PATH: "" })).toBe(JSON.stringify("local-unknown"));
  });

  it("prefers the configured Vercel commit even without Git", () => {
    expect(configuredRelease({ VERCEL_GIT_COMMIT_SHA: "vercel-release-fixture", PATH: "" })).toBe(
      JSON.stringify("vercel-release-fixture"),
    );
  });
});
