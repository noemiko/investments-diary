#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

let input;
try {
  input = JSON.parse(readFileSync(0, "utf8"));
} catch {
  process.exit(0);
}

// Nie zapętlaj ponownych prób Codexa.
if (input.stop_hook_active) process.exit(0);

const cwd = input.cwd || process.cwd();
const git = (args, dir) => spawnSync("git", args, { cwd: dir, encoding: "utf8" });

const repo = git(["rev-parse", "--show-toplevel"], cwd);
if (repo.status !== 0) process.exit(0);

const root = repo.stdout.trim();
const changes = git(["status", "--porcelain"], root);

// Nie uruchamiaj kontroli, jeśli nie ma zmian.
if (changes.status !== 0 || !changes.stdout.trim()) {
  process.exit(0);
}

const result = spawnSync("npm", ["run", "verify"], {
  cwd: root,
  encoding: "utf8",
  timeout: 110_000,
  maxBuffer: 4 * 1024 * 1024,
});

if (result.status !== 0) {
  console.error("Fix these before finishing:\n", result.error?.message ?? "", result.stdout ?? "", result.stderr ?? "");
  process.exit(2);
}

console.log("{}");
