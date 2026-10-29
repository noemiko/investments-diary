import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const staticRoot = resolve(import.meta.dirname, "../../.vercel/output/static");
const credential = process.env.SENTRY_AUTH_TOKEN;
const sentinel = "SENTRY_AUTH_TOKEN_PRIVATE_BUILD_SENTINEL";
let checked = 0;
async function inspect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await inspect(path);
    else {
      assert(!entry.name.endsWith(".map"), `Public source map: ${path}`);
      const content = await readFile(path);
      assert(!content.includes(sentinel), `Build secret sentinel in ${path}`);
      if (credential) assert(!content.includes(credential), `Build credential in ${path}`);
      checked += 1;
    }
  }
}
await inspect(staticRoot);
assert(checked > 0, "No public build files checked");
console.log(`Checked ${checked} public files: no source maps or configured build credential.`);
