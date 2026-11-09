import { z } from "zod";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText, Output } from "ai";
import { Buffer } from "node:buffer";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const contract = JSON.parse(await readFile(new URL("./contract.json", import.meta.url), "utf8"));
export const criteria = Object.keys(contract.schema.properties).filter((key) => !["verdict", "summary"].includes(key));

const REVIEW_SCHEMA = z.fromJSONSchema(contract.schema);

export function validateReview(review) {
  const parsed = REVIEW_SCHEMA.parse(review);
  if (!parsed.summary.trim()) throw new Error("Missing review summary");
  for (const key of criteria) {
    if (!parsed[key].explanation.trim()) throw new Error(`Missing explanation: ${key}`);
  }
  return parsed;
}

// Decides whether a changed file's diff is sent to the reviewer model.
// `path` is the repo-relative path from the `diff --git a/<path> b/<path>` header.
// Mirrors ci.yml's docs-only rule (`**/*.md`), so SQL and scripts under context/ stay reviewed.
// Markdown that steers agents (CLAUDE.md, AGENTS.md, .claude/**) is behaviour, not docs, so it stays in.
const AGENT_INSTRUCTIONS = /(^|\/)(CLAUDE|AGENTS)\.md$|^\.claude\//;
const GENERATED = /(^|\/)package-lock\.json$/;

export function isReviewable(path) {
  if (AGENT_INSTRUCTIONS.test(path)) return true;
  if (GENERATED.test(path)) return false;
  return !path.toLowerCase().endsWith(".md");
}

// Splits a unified PR diff into per-file chunks and drops the ones isReviewable() rejects.
// Excluded paths are returned so the model can disclose them rather than imply they were reviewed.
export function filterDiff(diff) {
  const chunks = diff.split(/^(?=diff --git )/m).filter((chunk) => chunk.startsWith("diff --git "));
  const kept = [];
  const skipped = [];
  for (const chunk of chunks) {
    const path = chunk.match(/^diff --git a\/(.+?) b\//)?.[1] ?? "";
    if (isReviewable(path)) kept.push(chunk);
    else skipped.push(path);
  }
  return { diff: kept.join(""), skipped };
}

export function gateReview(review, ciPassed) {
  return ciPassed && review.verdict === "pass" && !criteria.some((key) => review[key].status === "NOT VERIFIED");
}

export async function requestReview(context, env = process.env) {
  if (!env.OPENROUTER_API_KEY || !env.OPENROUTER_MODEL)
    throw new Error("Configure OPENROUTER_API_KEY secret and OPENROUTER_MODEL repository variable");
  const openrouter = createOpenRouter({ apiKey: env.OPENROUTER_API_KEY });
  const result = await generateText({
    model: openrouter.chat(env.OPENROUTER_MODEL, {
      provider: { require_parameters: true, data_collection: "deny" },
      structuredOutputs: { strict: true },
    }),
    system: contract.systemPrompt,
    prompt: JSON.stringify(context),
    output: Output.object({ schema: REVIEW_SCHEMA, name: "investment_review" }),
    maxRetries: 0,
    abortSignal: globalThis.AbortSignal.timeout(240_000),
  });
  if (result.finishReason !== "stop") throw new Error("OpenRouter review was refused or incomplete");
  return validateReview(result.output);
}

export async function main(resultPath = "review-result.json") {
  const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8"));
  const run = event.workflow_run;
  const repo = process.env.GITHUB_REPOSITORY;
  const apiRoot = process.env.GITHUB_API_URL ?? "https://api.github.com";
  async function api(path, method = "GET", body, accept = "application/vnd.github+json") {
    const response = await fetch(`${apiRoot}/repos/${repo}/${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${process.env.GH_TOKEN}`,
        Accept: accept,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: globalThis.AbortSignal.timeout(60_000),
    });
    if (!response.ok) throw new Error(`GitHub ${method} ${path}: HTTP ${response.status}`);
    return accept.includes("diff") ? response.text() : response.json();
  }
  const prs = await api(`commits/${run.head_sha}/pulls`);
  const pr = prs.find(
    (item) =>
      item.state === "open" &&
      item.head.sha === run.head_sha &&
      item.head.repo?.full_name === repo &&
      item.base.ref === event.repository.default_branch,
  );
  if (!pr) {
    console.log("No current same-repository PR for this CI commit; skipping.");
    return;
  }
  const check = await api("check-runs", "POST", {
    name: "AI code review",
    head_sha: pr.head.sha,
    status: "in_progress",
  });
  try {
    const jobs = [];
    for (let page = 1; ; page++) {
      const batch = await api(`actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100&page=${page}`);
      jobs.push(...batch.jobs);
      if (batch.jobs.length < 100) break;
    }
    const ciPassed =
      run.conclusion === "success" &&
      ["ci", "Decimal transport (local Supabase)"].every((name) =>
        jobs.some((job) => job.name === name && job.conclusion === "success"),
      );
    const fullDiff = await api(`pulls/${pr.number}`, "GET", undefined, "application/vnd.github.diff");
    const { diff, skipped } = filterDiff(fullDiff);
    const size = Buffer.byteLength(diff);
    if (!diff.trim() || size > 250_000)
      throw new Error(
        `Empty or oversized reviewable diff (${Math.round(size / 1000)} KB after excluding ${skipped.length} non-code files; 250 KB limit); manual review required`,
      );
    const review = await requestReview({
      title: pr.title,
      requirements: pr.body,
      head: pr.head.sha,
      ciPassed,
      jobs: jobs.map(({ name, conclusion }) => ({ name, conclusion })),
      diff,
      contextLimitations:
        "Only PR diff and CI conclusions supplied; disclose missing callers, unchanged code, or requirements where needed. Never infer verification from absent evidence." +
        (skipped.length
          ? ` These changed files were excluded from the diff as non-code and were NOT reviewed: ${skipped.join(", ")}.`
          : ""),
    });
    const passed = gateReview(review, ciPassed);
    await writeFile(resultPath, JSON.stringify({ head: pr.head.sha, ciPassed, passed, review }, null, 2));
    // Recheck after model latency: never publish a stale verdict as the current PR review.
    const current = await api(`pulls/${pr.number}`);
    if (current.head.sha !== pr.head.sha || current.state !== "open")
      throw new Error("PR changed during review; discard stale result");
    const marker = "<!-- investments-diary-code-review -->";
    const table = criteria.map((key) => `| ${key} | ${review[key].status} |`).join("\n");
    const details = criteria.map((key) => `### ${key}\n${review[key].explanation}`).join("\n\n");
    const body = `${marker}\n## AI code review: ${passed ? "pass" : "fail"}\n\nCommit: ${pr.head.sha}\n\n${review.summary}\n\n| Criterion | Status |\n|---|---|\n${table}\n\n${details}\n\nCI evidence: ${ciPassed ? "passed" : "failed or incomplete"}. [Review run](${process.env.GITHUB_SERVER_URL}/${repo}/actions/runs/${process.env.GITHUB_RUN_ID})`;
    if (body.length > 60_000) throw new Error("Review comment too long");
    const comments = [];
    for (let page = 1; ; page++) {
      const batch = await api(`issues/${pr.number}/comments?per_page=100&page=${page}`);
      comments.push(...batch);
      if (batch.length < 100) break;
    }
    const existing = comments.find(
      (comment) => comment.user.login === "github-actions[bot]" && comment.body.startsWith(marker),
    );
    await api(
      existing ? `issues/comments/${existing.id}` : `issues/${pr.number}/comments`,
      existing ? "PATCH" : "POST",
      { body },
    );
    await api(`check-runs/${check.id}`, "PATCH", {
      status: "completed",
      conclusion: passed ? "success" : "failure",
      output: { title: `Review ${passed ? "passed" : "failed"}`, summary: body },
    });
    if (!passed) process.exitCode = 1;
  } catch (error) {
    await api(`check-runs/${check.id}`, "PATCH", {
      status: "completed",
      conclusion: "failure",
      output: { title: "Review could not be verified", summary: error.message },
    });
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
