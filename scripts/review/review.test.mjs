import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { criteria, validateReview, gateReview } from "./review.mjs";

const clean = () => ({
  ...Object.fromEntries(criteria.map((key) => [key, { status: "PASS", explanation: "Verified in supplied evidence" }])),
  verdict: "pass",
  summary: "No blocking findings.",
});

test("requires CI evidence and fails closed on missing verification or model failure verdict", () => {
  assert.equal(gateReview(clean(), true), true);
  assert.equal(gateReview(clean(), false), false);
  assert.equal(gateReview({ ...clean(), verdict: "fail" }, true), false);
  for (const key of criteria) {
    const review = clean();
    review[key].status = "NOT VERIFIED";
    assert.equal(gateReview(review, true), false);
  }
});

test("allows advisory findings and unaffected criteria when model explicitly passes", () => {
  const review = clean();
  review.maintainableDesign.status = "FINDINGS";
  review.financialCorrectness.status = "NOT APPLICABLE";
  assert.equal(gateReview(validateReview(review), true), true);
});

test("rejects malformed provider output rather than trusting its verdict", () => {
  for (const invalid of [null, {}, { ...clean(), verdict: "approved" }, { ...clean(), summary: "" }]) {
    assert.throws(() => validateReview(invalid));
  }
  for (const key of criteria) {
    const review = clean();
    Reflect.deleteProperty(review, key);
    assert.throws(() => validateReview(review));
    assert.throws(() => validateReview({ ...clean(), [key]: { status: "OK", explanation: "ok" } }));
  }
});

test("contract retains exactly six project review dimensions", async () => {
  const contract = JSON.parse(await readFile(new URL("./contract.json", import.meta.url), "utf8"));
  assert.equal(criteria.length, 6);
  assert.deepEqual(Object.keys(clean()).sort(), contract.schema.required.toSorted());
});

test("workflow publishes exact-head review and fails closed if head changes during inference", async (t) => {
  const { main } = await import("./review.mjs");
  const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const directory = await mkdtemp(join(tmpdir(), "pr-review-"));
  const oldEnv = { ...process.env };
  const oldExitCode = process.exitCode;
  const pr = {
    number: 1,
    state: "open",
    head: { sha: "abc", repo: { full_name: "owner/repo" } },
    base: { ref: "master" },
  };
  const eventPath = join(directory, "event.json");
  await writeFile(
    eventPath,
    JSON.stringify({
      repository: { default_branch: "master" },
      workflow_run: { id: 2, head_sha: "abc", run_attempt: 1, conclusion: "success" },
    }),
  );
  Object.assign(process.env, {
    GITHUB_EVENT_PATH: eventPath,
    GITHUB_REPOSITORY: "owner/repo",
    OPENROUTER_API_KEY: "test-key",
    OPENROUTER_MODEL: "test-model",
    GH_TOKEN: "test-token",
  });
  let stale = false;
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push({ url, options });
    let data;
    if (url.endsWith("commits/abc/pulls")) data = [pr];
    else if (url.endsWith("check-runs")) data = { id: 99 };
    else if (url.includes("/jobs?"))
      data = {
        jobs: [
          { name: "ci", conclusion: "success" },
          { name: "Decimal transport (local Supabase)", conclusion: "success" },
        ],
      };
    else if (options.headers.Accept?.includes("diff"))
      return new globalThis.Response("diff --git a/file b/file\n+change");
    else if (url.startsWith("https://openrouter.ai/")) {
      const request = JSON.parse(options.body);
      assert.equal(request.response_format.json_schema.strict, true);
      assert.equal(request.tools, undefined);
      data = { choices: [{ finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(clean()) } }] };
    } else if (url.endsWith("pulls/1")) data = stale ? { ...pr, head: { ...pr.head, sha: "new" } } : pr;
    else if (url.includes("/comments?")) data = [];
    else data = {};
    return new globalThis.Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
  });
  try {
    await main(join(directory, "result.json"));
    assert.ok(calls.some(({ url, options }) => url.endsWith("issues/1/comments") && options.method === "POST"));
    const finish = calls.find(({ url, options }) => url.endsWith("check-runs/99") && options.method === "PATCH");
    assert.equal(JSON.parse(finish.options.body).conclusion, "success");
    assert.equal(JSON.parse(await readFile(join(directory, "result.json"), "utf8")).head, "abc");
    stale = true;
    calls.length = 0;
    await assert.rejects(main(join(directory, "stale.json")), /PR changed/);
    assert.equal(
      calls.some(({ url }) => url.endsWith("issues/1/comments")),
      false,
    );
    const failed = calls.find(({ url }) => url.endsWith("check-runs/99"));
    assert.equal(JSON.parse(failed.options.body).conclusion, "failure");
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in oldEnv)) Reflect.deleteProperty(process.env, key);
    Object.assign(process.env, oldEnv);
    process.exitCode = oldExitCode;
    await rm(directory, { recursive: true, force: true });
  }
});

test("different LLM models and rotated OpenRouter keys use the same endpoint and contract", async (t) => {
  const { requestReview } = await import("./review.mjs");
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "https://openrouter.ai/api/v1/chat/completions");
    const body = JSON.parse(options.body);
    requests.push({ key: new globalThis.Headers(options.headers).get("authorization"), model: body.model });
    assert.equal(body.response_format.json_schema.strict, true);
    assert.equal(body.provider.require_parameters, true);
    assert.equal(body.tools, undefined);
    return new globalThis.Response(
      JSON.stringify({
        choices: [{ finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(clean()) } }],
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  });
  for (const [key, model] of [
    ["key-one", "anthropic/test-model"],
    ["key-two", "openai/test-model"],
  ]) {
    assert.deepEqual(
      await requestReview({ diff: "test" }, { OPENROUTER_API_KEY: key, OPENROUTER_MODEL: model }),
      clean(),
    );
  }
  assert.deepEqual(requests, [
    { key: "Bearer key-one", model: "anthropic/test-model" },
    { key: "Bearer key-two", model: "openai/test-model" },
  ]);
});

test("missing OpenRouter configuration never makes a request", async (t) => {
  const { requestReview } = await import("./review.mjs");
  const fetchMock = t.mock.method(globalThis, "fetch", () => {
    throw new Error("Unexpected request");
  });
  for (const env of [{}, { OPENROUTER_API_KEY: "test" }, { OPENROUTER_MODEL: "test" }]) {
    await assert.rejects(requestReview({}, env), /OPENROUTER_API_KEY.*OPENROUTER_MODEL/);
  }
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("provider errors, refusals and truncation cannot produce a passing review", async (t) => {
  const { requestReview } = await import("./review.mjs");
  const env = { OPENROUTER_API_KEY: "test", OPENROUTER_MODEL: "test" };
  let reason = "length";
  let status = 200;
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new globalThis.Response(
        JSON.stringify({
          choices: [{ finish_reason: reason, message: { role: "assistant", content: JSON.stringify(clean()) } }],
        }),
        { status, headers: { "Content-Type": "application/json" } },
      ),
  );
  await assert.rejects(requestReview({}, env), /refused or incomplete/);
  reason = "content_filter";
  await assert.rejects(requestReview({}, env), /refused or incomplete/);
  status = 401;
  await assert.rejects(requestReview({}, env), (error) => error.statusCode === 401);
});

test("filterDiff drops docs and lockfiles but keeps code, context SQL and agent instructions", async () => {
  const { filterDiff } = await import("./review.mjs");
  const chunk = (path) => `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -0,0 +1 @@\n+x\n`;
  const paths = [
    "src/lib/result.ts",
    "context/domain/01-domain-distillation.md",
    "context/deployment/recovery.sql",
    "README.md",
    "package-lock.json",
    "CLAUDE.md",
    ".claude/skills/verify/SKILL.md",
  ];
  const { diff, skipped } = filterDiff(paths.map(chunk).join(""));
  assert.deepEqual(skipped, ["context/domain/01-domain-distillation.md", "README.md", "package-lock.json"]);
  for (const kept of [
    "src/lib/result.ts",
    "context/deployment/recovery.sql",
    "CLAUDE.md",
    ".claude/skills/verify/SKILL.md",
  ])
    assert.ok(diff.includes(`diff --git a/${kept} b/${kept}`), kept);
});
