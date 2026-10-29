#!/usr/bin/env node
// Push roadmap slices (context/foundation/roadmap.md → ## Slices / ## Foundations) to Linear.
//
//   LINEAR_API_KEY=lin_api_... LINEAR_TEAM_KEY=INV node scripts/automation/roadmap-to-linear.mjs          # dry run
//   LINEAR_API_KEY=lin_api_... LINEAR_TEAM_KEY=INV node scripts/automation/roadmap-to-linear.mjs --apply  # create
//
// Optional: LINEAR_PROJECT_NAME="Investments Diary" attaches every issue to that Linear project.
// Idempotent: an issue whose title starts with "S-NN ·" in the team is reused, not duplicated.

import { readFileSync } from "node:fs";

const ROADMAP = new URL("../../context/foundation/roadmap.md", import.meta.url);
const APPLY = process.argv.includes("--apply");
const { LINEAR_API_KEY, LINEAR_TEAM_KEY, LINEAR_PROJECT_NAME } = process.env;
const LABEL_COLORS = { slice: "#4EA7FC", foundation: "#95A2B3", "north-star": "#F2C94C" };

// ---------- roadmap parsing ----------

function section(md, heading) {
  const start = md.search(new RegExp(`^## ${heading}\\s*$`, "m"));
  if (start < 0) return "";
  const rest = md.slice(start).split("\n").slice(1).join("\n");
  const end = rest.search(/^## /m);
  return end < 0 ? rest : rest.slice(0, end);
}

function field(block, name) {
  const m = block.match(new RegExp(`^- \\*\\*${name}:\\*\\*\\s*(.+)$`, "m"));
  return m ? m[1].trim() : "";
}

function shortOutcomes(md) {
  // "At a glance" table: | ID | Change ID | Outcome (user can …) | ...
  const map = {};
  for (const line of section(md, "At a glance").split("\n")) {
    const cells = line.split("|").map((c) => c.trim());
    if (/^[SF]-\d+$/.test(cells[1] ?? "")) map[cells[1]] = cells[3];
  }
  return map;
}

function parseItems(md, heading, kind) {
  const short = shortOutcomes(md);
  return section(md, heading)
    .split(/^### /m)
    .slice(1)
    .filter((b) => /^[SF]-\d+:/.test(b))
    .map((block) => {
      const id = block.match(/^([SF]-\d+):/)[1];
      const prereq = field(block, "Prerequisites");
      const outcome = field(block, "Outcome");
      const title = (short[id] || outcome.replace(/^user can\s+/i, "")).replace(/^./, (c) => c.toUpperCase());
      return {
        id,
        kind,
        title: `${id} · ${title}`,
        outcome,
        changeId: field(block, "Change ID"),
        prdRefs: field(block, "PRD refs"),
        risk: field(block, "Risk"),
        prereqs: prereq.match(/[SF]-\d+/g) ?? [],
      };
    });
}

function topoSort(items) {
  const byId = Object.fromEntries(items.map((i) => [i.id, i]));
  const out = [];
  const state = {};
  const visit = (i) => {
    if (state[i.id] === "done") return;
    if (state[i.id] === "visiting") throw new Error(`Dependency cycle at ${i.id}`);
    state[i.id] = "visiting";
    for (const p of i.prereqs) {
      if (!byId[p]) throw new Error(`${i.id} depends on unknown ${p}`);
      visit(byId[p]);
    }
    state[i.id] = "done";
    out.push(i);
  };
  items.forEach(visit);
  return out;
}

function describe(item, created) {
  const prereqs = item.prereqs.length
    ? item.prereqs.map((p) => created[p]?.identifier ?? p).join(", ")
    : "none — can start any time";
  return [
    `**Outcome:** ${item.outcome}`,
    "",
    `**PRD refs:** ${item.prdRefs || "—"}`,
    "",
    `**Prerequisites:** ${prereqs}`,
    "",
    `**Risk:** ${item.risk || "—"}`,
    "",
    "---",
    `_Roadmap ${item.id} · change \`${item.changeId}\` · source: \`context/foundation/roadmap.md\`_`,
  ].join("\n");
}

// ---------- Linear API ----------

async function gql(query, variables = {}) {
  const res = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: LINEAR_API_KEY },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json();
  if (!res.ok || body.errors) throw new Error(JSON.stringify(body.errors ?? body, null, 2));
  return body.data;
}

async function findTeam(key) {
  const d = await gql(`query($key:String!){ teams(filter:{key:{eq:$key}}){ nodes{ id name } } }`, { key });
  const team = d.teams.nodes[0];
  if (!team) throw new Error(`No Linear team with key "${key}"`);
  return team;
}

async function findProject(name) {
  const d = await gql(`query($name:String!){ projects(filter:{name:{eq:$name}}){ nodes{ id } } }`, { name });
  if (!d.projects.nodes[0]) throw new Error(`No Linear project named "${name}"`);
  return d.projects.nodes[0].id;
}

async function ensureLabel(name, teamId) {
  const d = await gql(
    `query($name:String!){ issueLabels(filter:{name:{eqIgnoreCase:$name}}){ nodes{ id team{ id } } } }`,
    { name },
  );
  const hit = d.issueLabels.nodes.find((l) => !l.team || l.team.id === teamId);
  if (hit) return hit.id;
  const c = await gql(`mutation($input:IssueLabelCreateInput!){ issueLabelCreate(input:$input){ issueLabel{ id } } }`, {
    input: { name, teamId, color: LABEL_COLORS[name] },
  });
  return c.issueLabelCreate.issueLabel.id;
}

async function findExisting(teamKey, id) {
  const d = await gql(
    `query($key:String!,$prefix:String!){ issues(filter:{team:{key:{eq:$key}}, title:{startsWith:$prefix}}){
       nodes{ id identifier url relations{ nodes{ type relatedIssue{ id } } } } } }`,
    { key: teamKey, prefix: `${id} ·` },
  );
  return d.issues.nodes[0];
}

// ---------- main ----------

const md = readFileSync(ROADMAP, "utf8");
const northStar = section(md, "North star").match(/\*\*([SF]-\d+):/)?.[1];
const items = topoSort([...parseItems(md, "Foundations", "foundation"), ...parseItems(md, "Slices", "slice")]);

for (const i of items) {
  i.labels = [i.kind, ...(i.id === northStar ? ["north-star"] : [])];
}

if (!APPLY) {
  console.log(`Dry run — ${items.length} issues (north star: ${northStar ?? "none"}). Pass --apply to create.\n`);
  for (const i of items) {
    console.log(`${i.title}\n  labels: ${i.labels.join(", ")}\n  blocked by: ${i.prereqs.join(", ") || "—"}\n`);
  }
  process.exit(0);
}

if (!LINEAR_API_KEY || !LINEAR_TEAM_KEY) {
  console.error("Set LINEAR_API_KEY (Linear → Settings → Security & access → API keys) and LINEAR_TEAM_KEY.");
  process.exit(1);
}

const team = await findTeam(LINEAR_TEAM_KEY);
const projectId = LINEAR_PROJECT_NAME ? await findProject(LINEAR_PROJECT_NAME) : undefined;
const labelIds = {};
for (const name of new Set(items.flatMap((i) => i.labels))) labelIds[name] = await ensureLabel(name, team.id);

const created = {};
for (const item of items) {
  const existing = await findExisting(LINEAR_TEAM_KEY, item.id);
  if (existing) {
    created[item.id] = existing;
    console.log(`= ${existing.identifier} ${item.title} (exists, skipped)`);
    continue;
  }
  const d = await gql(`mutation($input:IssueCreateInput!){ issueCreate(input:$input){ issue{ id identifier url } } }`, {
    input: {
      teamId: team.id,
      projectId,
      title: item.title,
      description: describe(item, created),
      labelIds: item.labels.map((l) => labelIds[l]),
    },
  });
  created[item.id] = { ...d.issueCreate.issue, relations: { nodes: [] } };
  console.log(`+ ${created[item.id].identifier} ${item.title}`);
}

// Dependencies: each prerequisite "blocks" the slice that needs it.
for (const item of items) {
  for (const p of item.prereqs) {
    const blocker = created[p];
    const already = blocker.relations.nodes.some(
      (r) => r.type === "blocks" && r.relatedIssue.id === created[item.id].id,
    );
    if (already) continue;
    await gql(`mutation($input:IssueRelationCreateInput!){ issueRelationCreate(input:$input){ success } }`, {
      input: { issueId: blocker.id, relatedIssueId: created[item.id].id, type: "blocks" },
    });
    console.log(`  ${blocker.identifier} blocks ${created[item.id].identifier}`);
  }
}

console.log(
  `\nDone. ${team.name}: ${Object.values(created)
    .map((c) => c.identifier)
    .join(", ")}`,
);
