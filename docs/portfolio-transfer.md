# Portfolio Excel export and recovery

Open **Export & recovery** from the dashboard (`/dashboard/portfolio`). This is the personal analysis and recovery workflow defined by FR-017.

## Using the workbook

1. Choose **Export Excel** and keep the downloaded XLSX unchanged as your recovery file.
2. Make a separate copy for analysis in Excel or Google Sheets. Exact amounts, quantities and ISO dates are text so that spreadsheet number conversion cannot silently round the authoritative data. Convert cells in your analysis copy when you need calculations.
3. To recover, choose the original download and **Preview recovery**. Review the export date, incoming wallets and open/closed investments, and the current portfolio that will be replaced.
4. Type `REPLACE PORTFOLIO` exactly and confirm within ten minutes. A changed destination or expired preview requires a fresh preview. Recovery does not create a sign-in account.

The original export includes wallets, nondeleted open/closed investments, their referenced categories (including retired ones), stock identities and recorded valuation evidence. It preserves purchase and sale facts, fees, optional quantity, broker labels, reasons, manual prices and their original save times, and cached quote market/fetch times. Empty wallets are included; unused categories, deleted investments and historical wallet charts are not part of this export.

Characters that Excel cannot represent are displayed as literal escapes; an unusually long escaped display may be shortened to fit a cell. The authenticated recovery data retains the complete original text.

Readable cells are for analysis. Recovery uses the workbook's authenticated original data, so changing a readable amount or formula does not update a saved investment. Edited or Google-converted files are outside the recovery guarantee; direct Google access and synchronization are not provided. The file contains private financial data and is signed, not encrypted: keep the original in private storage.

Recovery preserves the export-time valuation rather than downloading current prices. It does not invent a new manual-price save time or convert currencies. Subsequent **Download prices** and manual corrections follow the ordinary price-selection rules. Database IDs and temporary selection/refresh tokens are recreated; they are not account credentials or part of the recovery guarantee.

## Replacement and undo

A confirmed recovery replaces the destination account's current wallets and investments, including its currently deleted investments and historical charts. Before doing so, the database saves that complete previous state in a private undo copy in the same transaction. If validation, locking, prior-state capture or installation fails, both the portfolio and the previous undo copy remain unchanged.

**Undo latest recovery** previews the saved state and requires the same confirmation phrase. It restores the saved portfolio, including its deleted entries, unused categories and historical observations. Undo also saves the state it replaces, so the latest two states can be swapped again. There is one undo copy per account, retained without automatic expiry until the next successful replacement or undo; this is not a multi-version backup archive. Only the owner's copy metadata is exposed to the browser.

Replacement briefly takes write locks on the portfolio tables, including writes by other accounts. Lock acquisition is limited to two seconds, and the PostgREST RPC declares a fifteen-second statement timeout. A busy result leaves the portfolio unchanged and can be retried. The statement timeout relies on PostgREST's default hoisting of function settings; preserve that configuration when operating the API ([PostgREST function settings](https://docs.postgrest.org/en/v12/references/transactions.html#function-settings)). An identical successful confirmation retry returns the original result instead of applying replacement twice.

## Installation configuration

Apply the two versioned migrations through the normal migration process. For the local stack only:

```sh
npx supabase start
npx supabase migration up --local
```

Keep the ordinary `SUPABASE_URL` and `SUPABASE_KEY` configuration. Add these server-only settings to local `.env` or to the installation's server secret configuration:

| Setting                     | Value                                                                                     |
| --------------------------- | ----------------------------------------------------------------------------------------- |
| `SUPABASE_SERVICE_ROLE_KEY` | The service-role key for the same Supabase project; local credentials only in development |
| `PORTFOLIO_DEPLOYMENT_ID`   | A stable identifier for this diary installation                                           |
| `PORTFOLIO_RECOVERY_KEYS`   | JSON with `activeKeyId` and a `keys` map of key IDs to random signing secrets             |

A placeholder key-ring shape is:

```dotenv
PORTFOLIO_DEPLOYMENT_ID=my-private-diary
PORTFOLIO_RECOVERY_KEYS='{"activeKeyId":"v1","keys":{"v1":"<random-signing-secret>"}}'
```

Generate a fresh secret with at least 32 random bytes, store it securely, and replace the placeholder. One local generation command is:

```sh
node --input-type=module -e 'import { randomBytes } from "node:crypto"; process.stdout.write(randomBytes(32).toString("base64url") + "\n")'
```

The service role is used only by server code after session authentication. Never put it or signing keys in public/client variables or source control. Development refuses a hosted Supabase URL. Missing or invalid transfer settings disable export/recovery controls while the ordinary diary remains available; the ordinary Supabase settings are still required.

After changing local settings, restart the app and regenerate types with `npx astro sync`. The same deployment ID and retained verification keys allow an original export to be recovered into another signed-in account on that installation. Destination ownership comes from the session, not workbook IDs.

### Key rotation and retention

Add a new random secret under a new key ID and make that ID active. Keep old entries in `keys` so previously downloaded originals remain verifiable. Backups have no age-based expiry, but losing an old signing key makes its exports unusable. Retain the deployment ID and the verification key ring alongside the installation's own recovery arrangements. A normal deployment must not generate a new random key on startup.

### Supported limits

- XLSX file: 4 MiB.
- Total decompressed workbook: 32 MiB.
- Authenticated recovery payload: 8 MiB.
- Records per wallets, categories, investments, targets or quotes collection: 10,000.

Oversized or unsupported data is rejected; an export never silently drops rows or produces a partial backup. An oversized export requires an operator to arrange an appropriate backup rather than a user deleting records to fit the limit. Files with damaged or unsupported recovery data are rejected before replacement.

## Verification

Use Node.js 24, Docker, local Supabase and Playwright Chromium. Apply pending local migrations before browser tests. Configure the local transfer settings above; these tests do not need `E2E_USERNAME` or `E2E_PASSWORD`:

```sh
npx playwright install chromium
npx playwright test --project=portfolio-transfer
npm run test:contract-db -- --only portfolio-recovery
```

The browser project creates and removes unique local accounts. It checks original download, preview, confirmation, reload and undo; exact recorded facts and valuation across USD/PLN/EUR; preservation of destination deleted/history data; and the separation between readable analysis edits and authenticated recovery facts. The database domain uses a disposable database and checks rollback, isolation, concurrent writes, stale previews, duplicate confirmation and old in-flight quote completion. It never resets the diary database. Reports and synthetic workbook attachments remain in Playwright's ignored output directories.

Follow the repository verification skill for static checks, and run the full database contract and decimal transport checks before release. Browser tests use Astro dev after a build because this adapter has no preview server; they do not establish parity with a hosted runtime.

## Disabling or rolling back the feature

Remove the optional transfer settings from the running app configuration to disable the controls, retaining their secrets securely for later recovery. Keep the normal Supabase configuration and existing diary data. Leave the additive migrations and private undo storage in place; disabling the feature is not a reason to drop snapshots or relax ordinary ownership/deletion rules. Re-enabling with the retained deployment ID and keys restores access to compatible originals and the latest undo metadata. Hosted rollout and secret configuration remain owner-operated; this guide does not authorize automatic cloud changes.
