import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const source = path.resolve("scripts/agent-hooks.mjs");
const config = JSON.parse(fs.readFileSync(".codex/hooks.json", "utf8")) as {
  hooks: Record<string, { hooks: { command: string }[] }[]>;
};
const temporary: string[] = [];
function git(cwd: string, ...args: string[]) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  expect(result.status, result.stderr).toBe(0);
}
function fixture() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "agent-hooks-test-"));
  temporary.push(cwd);
  git(cwd, "init", "-q");
  git(cwd, "config", "user.email", "hooks@example.invalid");
  git(cwd, "config", "user.name", "Hook proof");
  fs.mkdirSync(path.join(cwd, "scripts"));
  fs.copyFileSync(source, path.join(cwd, "scripts/agent-hooks.mjs"));
  fs.writeFileSync(path.join(cwd, ".gitignore"), "node_modules/\n");
  fs.writeFileSync(path.join(cwd, "clean.ts"), "export const clean = 1;\n");
  git(cwd, "add", ".");
  git(cwd, "commit", "-qm", "fixture");
  tools(cwd);
  return cwd;
}
function tools(cwd: string) {
  const bin = path.join(cwd, "node_modules/.bin");
  fs.mkdirSync(bin, { recursive: true });
  // Only slow external checks are stubbed. Git and the real hook remain real.
  const stub = `#!${process.execPath}
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const tool = path.basename(process.argv[1]);
if (tool === 'astro' && args[0] === 'sync') process.exit(0);
const names = tool === 'eslint' ? args.filter(x => !x.startsWith('--')) : fs.readdirSync('.').filter(x => x.endsWith('.ts'));
for (const name of names) {
  if (!fs.existsSync(name)) continue;
  const text = fs.readFileSync(name, 'utf8');
  const marker = tool === 'eslint' ? 'LINT_ERROR' : tool === 'vitest' ? 'ASSERTION_FAILED' : 'TYPE_ERROR';
  if (text.includes(marker)) { console.error(name + ': ' + marker); process.exit(1); }
}
`;
  for (const tool of ["eslint", "astro", "vitest"]) fs.writeFileSync(path.join(bin, tool), stub, { mode: 0o755 });
}
function invoke(cwd: string, mode: string, payload: unknown, script = source) {
  return spawnSync(process.execPath, [script, mode], {
    cwd,
    input: typeof payload === "string" ? payload : JSON.stringify(payload),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: "/nonexistent", CODEX_PROJECT_DIR: "/nonexistent" },
  });
}
function blocked(result: ReturnType<typeof invoke>, message: string) {
  expect(result.status).toBe(2);
  expect(result.stdout).toBe("");
  expect(result.stderr).toContain(message);
}
afterEach(() => {
  for (const dir of temporary.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});
describe("Codex Stop hook", () => {
  it("reports lint and behavioural test failures from shell edits, and honours retry", () => {
    const cwd = fixture();
    fs.writeFileSync(path.join(cwd, "shell.ts"), "LINT_ERROR ASSERTION_FAILED");
    const result = invoke(cwd, "stop", { cwd });
    blocked(result, "shell.ts");
    expect(result.stderr).toContain("LINT_ERROR");
    expect(result.stderr).toContain("ASSERTION_FAILED");
    const retry = invoke(cwd, "stop", { cwd, stop_hook_active: true });
    expect(retry.status).toBe(0);
    expect(JSON.parse(retry.stdout)).toEqual({});
  });
  it("passes clean changes without running astro check", () => {
    const cwd = fixture();
    fs.writeFileSync(path.join(cwd, "new.ts"), "TYPE_ERROR");
    expect(invoke(cwd, "stop", { cwd }).status).toBe(0);
  });
  it("does not lint deleted files or unsupported types", () => {
    const cwd = fixture();
    fs.unlinkSync(path.join(cwd, "clean.ts"));
    fs.writeFileSync(path.join(cwd, "README.md"), "LINT_ERROR");
    fs.unlinkSync(path.join(cwd, "node_modules/.bin/eslint"));
    fs.unlinkSync(path.join(cwd, "node_modules/.bin/astro"));
    expect(invoke(cwd, "stop", { cwd }).status).toBe(0);
  });
  it("does not run checks on a clean tree or malformed input", () => {
    const cwd = fixture();
    fs.rmSync(path.join(cwd, "node_modules"), { recursive: true });
    for (const payload of [{ cwd }, {}, "", "not json", null]) {
      const result = invoke(cwd, "stop", payload);
      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
    }
  });
  it("reports missing lint, sync and test tools visibly", () => {
    const cwd = fixture();
    fs.writeFileSync(path.join(cwd, "changed.ts"), "export {}; ");
    for (const tool of ["eslint", "astro", "vitest"]) {
      tools(cwd);
      fs.unlinkSync(path.join(cwd, "node_modules/.bin", tool));
      blocked(invoke(cwd, "stop", { cwd }), `${tool} failed`);
    }
  });
  it("resolves cwd from a subdirectory and ignores errors in another repository", () => {
    const cwd = fixture();
    const other = fixture();
    fs.writeFileSync(path.join(other, "bad.ts"), "LINT_ERROR");
    fs.mkdirSync(path.join(cwd, "sub"));
    expect(invoke(other, "stop", { cwd: path.join(cwd, "sub") }).status).toBe(0);
    fs.writeFileSync(path.join(cwd, "bad.ts"), "LINT_ERROR");
    blocked(invoke(other, "stop", { cwd: path.join(cwd, "sub") }), "bad.ts");
  });
  it("registers only Stop and runs its command in the session worktree", () => {
    expect(Object.keys(config.hooks)).toEqual(["Stop"]);
    const cwd = fixture();
    const sibling = `${cwd}-sibling`;
    temporary.push(sibling);
    git(cwd, "worktree", "add", "--detach", sibling);
    tools(sibling);
    fs.writeFileSync(path.join(cwd, "bad.ts"), "LINT_ERROR");
    for (const group of config.hooks.Stop) {
      for (const hook of group.hooks) {
        const result = spawnSync("/bin/sh", ["-c", hook.command], {
          cwd: sibling,
          input: JSON.stringify({ cwd: sibling }),
          encoding: "utf8",
          env: { ...process.env, CLAUDE_PROJECT_DIR: "/nonexistent", CODEX_PROJECT_DIR: "/nonexistent" },
        });
        expect(result.status, result.stderr).toBe(0);
      }
    }
  });
});
