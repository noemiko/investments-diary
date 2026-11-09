# PR code review

`pr-review.yml` runs after the existing CI workflow finishes on a same-repository PR
against the default branch. It publishes an `AI code review` check on the exact PR
head, updates one bot comment with all six criterion assessments, and saves the
structured response as a workflow artifact. Failed CI, missing verification,
invalid provider responses, and provider/configuration errors fail the check.
Lower severity findings remain advisory when the model returns `pass`.

## Enable

1. Add repository secret `OPENROUTER_API_KEY` containing an **OpenRouter** key.
2. Add repository variable `OPENROUTER_MODEL` with the model's OpenRouter ID
   (`provider/model`). Change this variable to select another LLM; the model must
   support strict JSON Schema output. The provider must support parameters and opt
   out of data collection; the request fails if no compatible provider is available.
3. Merge these files to the default branch: `workflow_run` loads its workflow and
   reviewer from there. The initial PR cannot run the newly added reviewer.
4. After its first run, make `AI code review` a required check in branch protection
   if the verdict should block merges. Workflow code cannot set branch protection.

The existing CI path filters still apply: documentation-only PRs do not trigger CI
or review. Fork PRs are deliberately skipped. Do not require this check for PRs
that cannot trigger it without adjusting the repository rules. No remote settings
are changed by this implementation.

## Contract

`contract.json` is an exact generated snapshot of `SYSTEM_PROMPT` and
`REVIEW_JSON_SCHEMA` in the sibling `my-own-agent/src/review-schema.ts`. CI cannot
import a sibling repository. To refresh, run from `my-own-agent` and commit the result:

```bash
node --import tsx --input-type=module -e 'import {SYSTEM_PROMPT,REVIEW_JSON_SCHEMA} from "./src/review-schema.ts"; import {writeFileSync} from "node:fs"; writeFileSync("../investments-diary/scripts/review/contract.json",JSON.stringify({systemPrompt:SYSTEM_PROMPT,schema:REVIEW_JSON_SCHEMA},null,2)+"\n")'
```

The reviewer imports `z` from `zod`, reconstructs this contract as a Zod schema,
and requests structured output using `createOpenRouter` from
`@openrouter/ai-sdk-provider` and the AI SDK's `Output.object`. The same Zod schema
validates the returned result before the gate runs.

Reviewer dependencies are isolated in `scripts/review/package.json` and pinned by
its lockfile. Install them with `npm ci --prefix scripts/review --ignore-scripts`.
Format the generated JSON with this repository's Prettier. Test the deterministic
gate with `node --test scripts/review/review.test.mjs`; CI also runs these tests.

## Trust and limits

Only trusted default-branch code runs with credentials. No PR checkout, PR package
installation, PR artifact, or PR cache is used. Reviewer packages are installed
from the trusted default branch lockfile with lifecycle scripts disabled. Reviewed text is sent as untrusted
model input; the model has no tools. Only the diff, PR title/body, commit SHA, and
CI job conclusions are sent to the selected provider. Configure provider access appropriately
for repository code. No diary database or application secrets are supplied.

The reviewer receives at most 250 KB of diff. Larger/empty diffs fail for manual
review. Unchanged callers, full requirements, and test logs are not automatically
included; the model must disclose evidence gaps. It cannot prove absence of defects.
The check independently requires successful `ci` and `Decimal transport (local
Supabase)` jobs from the triggering CI attempt. PR changes during inference discard
the stale result. Errors fail the check and are visible in the Actions log/check.
This does not approve deployment or submit a formal GitHub approval.

Security reference: [GitHub secure use](https://docs.github.com/en/actions/reference/security/secure-use).

## Use your own provider API keys

Add Anthropic, OpenAI, or other supported provider keys in your OpenRouter workspace's
BYOK settings. They remain in OpenRouter; CI needs only `OPENROUTER_API_KEY` and
`OPENROUTER_MODEL`. Keep an OpenRouter key in `OPENROUTER_API_KEY`; raw provider keys
cannot authenticate to OpenRouter directly.

OpenRouter routes eligible requests using your configured provider keys. You can
configure multiple keys, key/model filters, and their priority in OpenRouter. If you
want requests to use only your own credentials, disable shared-capacity fallback
for the relevant providers there. BYOK still respects the request's data policies.

See [OpenRouter BYOK documentation](https://openrouter.ai/docs/guides/overview/auth/byok).
