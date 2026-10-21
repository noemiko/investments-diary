#!/usr/bin/env node
// Codex Stop hook: lint changed files and run the unit suite before handing back.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const env = { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" };
const mode = process.argv[2];
const deadline = Date.now() + 110000;
function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", env });
  return result.status === 0 ? (args.includes("-z") ? result.stdout : result.stdout.trim()) : "";
}
function root(cwd) {
  return git(cwd, ["rev-parse", "--show-toplevel"]);
}
function run(cwd, tool, args) {
  const executable = path.join(cwd, "node_modules", ".bin", tool);
  const result = spawnSync(executable, args, {
    cwd,
    encoding: "utf8",
    env,
    timeout: Math.max(1, deadline - Date.now()),
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.status === 0) return "";
  return `${tool} failed in ${cwd}:\n${result.error?.message ?? ""}\n${result.stdout ?? ""}${result.stderr ?? ""}`;
}
function covered(file) {
  return /\.(?:[cm]?js|jsx|ts|tsx|astro)$/.test(file) && fs.existsSync(file) && fs.statSync(file).isFile();
}
function main() {
  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(0, "utf8"));
  } catch {
    return [];
  }
  if (!payload || typeof payload !== "object" || mode !== "stop") return [];
  if (mode === "stop" && payload.stop_hook_active === true) return [];
  const cwd = typeof payload.cwd === "string" ? payload.cwd : process.cwd();
  const base = root(cwd);
  if (!base) return [];
  const failures = [];
  const tracked = git(base, ["diff", "--name-only", "-z", "HEAD"]);
  const untracked = git(base, ["ls-files", "-o", "--exclude-standard", "-z"]);
  const changed = [...new Set(`${tracked}\0${untracked}`.split("\0").filter(Boolean))];
  if (!changed.length) return [];
  const files = changed.map((file) => path.join(base, file)).filter(covered);
  if (files.length) {
    // ESLint's projectService needs generated Astro types on fresh checkouts.
    const sync = run(base, "astro", ["sync"]);
    failures.push(sync);
    if (!sync) failures.push(run(base, "eslint", ["--no-warn-ignored", ...files]));
  }
  failures.push(run(base, "vitest", ["run"]));
  return failures.filter(Boolean);
}
try {
  const failures = main();
  if (failures.length) {
    console.error(`Fix these before finishing:\n${failures.join("\n")}`);
    process.exitCode = 2;
  } else if (mode === "stop") console.log("{}");
} catch (error) {
  console.error(`Agent hook failed: ${error.message}`);
  process.exitCode = 2;
}
