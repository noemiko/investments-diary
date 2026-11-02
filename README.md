# 10x Astro Starter

![](./public/template.png)

A modern, opinionated starter template for building fast, accessible web applications.

## Tech Stack

- [Astro](https://astro.build/) v7 - Modern web framework with server-first rendering
- [React](https://react.dev/) v19 - UI library for interactive components
- [TypeScript](https://www.typescriptlang.org/) v6 - Type-safe JavaScript
- [Tailwind CSS](https://tailwindcss.com/) v4 - Utility-first CSS framework
- [Supabase](https://supabase.com/) - Authentication and backend-as-a-service
- [Vercel](https://vercel.com/) - Serverless deployment platform

## Prerequisites

- Node.js v24.21.0 (as specified in `.nvmrc`)
- npm (comes with Node.js)

## Getting Started

1. Clone the repository:

```bash
git clone https://github.com/przeprogramowani/10x-astro-starter.git
cd 10x-astro-starter
```

2. Install dependencies:

```bash
npm install
```

3. Set up Supabase and configure environment variables — see [Supabase Configuration](#supabase-configuration) below.

4. Run the development server:

```bash
npm run dev
```

## Agent research tools

Repository-scoped MCP connections provide Exa for web discovery and Context7 for library
documentation in Codex and Claude Code. See [Research tools](context/foundation/research-tools.md)
for activation, connection checks, fallback behavior and acceptance scenarios.

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production into `.vercel/output/`
- `npm run lint` - Run ESLint with type-checked rules
- `npm run lint:fix` - Auto-fix ESLint issues
- `npm run format` - Run Prettier
- `npm run smoke` - Smoke test the auth flow against a running server (`BASE_URL`, defaults to `http://localhost:4321`)

## Project Structure

```md
.
├── src/
│ ├── layouts/ # Astro layouts
│ ├── pages/ # Astro pages
│ │ └── api/ # API endpoints
│ ├── components/ # UI components (Astro & React)
│ └── assets/ # Static assets
├── public/ # Public assets
```

## Supabase Configuration

This project uses [Supabase](https://supabase.com/) for authentication. Environment variables are declared via Astro's `astro:env` schema and are treated as **server-only secrets** — they are never exposed to the client.

### First-time setup (local, no cloud project needed)

Requires [Docker](https://www.docker.com/) and ~7 GB RAM.

1. Create your `.env` file:

```bash
cp .env.example .env
```

2. Initialize the local Supabase project (creates a `supabase/` config folder):

```bash
npx supabase init
```

3. Start the local stack (downloads Docker images on first run):

```bash
npx supabase start
```

4. Copy the local URL and publishable key printed by the CLI into your ignored `.env`.

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_KEY=<your-local-publishable-key>
```

5. To stop the stack when done:

```bash
npx supabase stop
```

The local Studio UI is available at `http://localhost:54323`.

No database tables or migrations are required — this project uses Supabase Auth's built-in `auth.users` table only.

### Hosted Supabase project (production only)

The hosted project is the production database. Its values go into Vercel environment variables (Production/Preview scope), never into a local `.env` — `npm run dev` throws if `SUPABASE_URL` is not a local address.

| Variable       | Description                                                |
| -------------- | ---------------------------------------------------------- |
| `SUPABASE_URL` | Project URL from Supabase dashboard → Settings → API       |
| `SUPABASE_KEY` | `anon` public key from Supabase dashboard → Settings → API |

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_KEY=<anon-key>
```

### Creating an account

Public sign-up is closed; the owner creates each account from the terminal. With local Supabase running:

```sh
npm run user:create -- --email you@example.com
```

Type a password of at least 12 characters twice at the hidden prompt (it runs `psql` in the local database container, so nothing else is needed). The account is already confirmed, so you can sign in at [local sign-in](http://localhost:4321/auth/signin) straight away. An email that already has an account is refused.

For the hosted project the owner needs Docker and the tools image (`npm run tools:build`, once) instead of a host `psql`, and adds `--production --db-url <connection string without the password>`. The script runs `psql` in that image, asks the owner to type the project ref to confirm, and `psql` asks for the database password at its own hidden prompt. The password is never stored in a file or environment variable, and agents never run this mode. See [Project scripts](scripts/README.md#accounts).

### Email confirmation in local development

By default Supabase requires email confirmation before a user can sign in. To skip this during local development:

1. Open the Supabase dashboard for your project
2. Go to **Authentication → Email → Confirm email**
3. Toggle it **off**

Users can then sign in immediately after sign-up without clicking a confirmation link.

### Auth routes

| Route                 | Description                                                             |
| --------------------- | ----------------------------------------------------------------------- |
| `/auth/signin`        | Email/password sign-in form                                             |
| `/auth/signup`        | Email/password sign-up form                                             |
| `/auth/confirm-email` | Post-signup "check your inbox" page                                     |
| `/dashboard`          | Example protected page (redirects to `/auth/signin` if unauthenticated) |

Route protection is handled in `src/middleware.ts`. Add paths to the `PROTECTED_ROUTES` array there to require authentication.

## Deployment

This project deploys to [Vercel](https://vercel.com/).

1. Link the project (first time only):

```bash
npx vercel link
```

2. Set the production secrets:

```bash
npx vercel env add SUPABASE_URL production
npx vercel env add SUPABASE_KEY production
```

3. Deploy:

```bash
npx vercel deploy --prod
```

Pushing to the connected GitHub repository deploys automatically — the commands above are the manual path. Do not pull production values into a local env file: local development uses the local Supabase stack (see above), and the dev server refuses to start against a hosted Supabase URL.

## Smoke test

`scripts/testing/smoke.mjs` is a dependency-free Node script that walks the whole auth flow (sign-up, sign-in, protected page, sign-out) over HTTP. Run it against the local dev server after dependency upgrades:

```bash
npm run dev
BASE_URL=http://localhost:4321 npm run smoke
```

It requires local Supabase with email confirmation disabled and the Supabase CLI available. It creates persistent test accounts and owner-bound listing-choice fixtures without contacting Yahoo; native selection/save validation and financial reads remain real. Never point it at production.

> **Note:** this script exists primarily to guard the development of the starter itself — it is a fast sanity check that dependency upgrades did not break the build or the Supabase auth flow. It is **not** a substitute for a real test suite. Once you build your own product on top of this starter, add proper tests (unit, integration, end-to-end) suited to your application.

## CI

GitHub Actions runs two jobs on every push and PR to `master`:

- **ci** — lint, `astro check` and build. Configure `SUPABASE_URL` and `SUPABASE_KEY` as repository secrets for the build step.
- **smoke** — starts a local Supabase via the Supabase CLI, builds, serves the app with `npm run dev` and runs `npm run smoke` against it. No secrets required.

## License

MIT

## Wallet history and manual-test demo

When recording a new investment, choose a wallet, search Yahoo listings and select the intended stock/ETF before saving. Search, selection and Save retain your other entries and do not download a price. Click **Download prices** on Positions afterward; this verifies trading currency/timezone and saves a usable quote. A currency mismatch leaves your recorded values unchanged. Existing investments keep their labels and manual-price support.

Run these commands from the project directory with local Supabase running:

```sh
npx supabase start
```

Copy and paste this block into **zsh** (the default macOS shell). Type a password of at least 12 characters when prompted, then press Enter. Your password stays hidden and is not written into shell history.

```zsh
read -s "DEMO_USER_PASSWORD?Demo password (at least 12 characters): "
print
export DEMO_USER_PASSWORD
npm run seed:demo
```

Start the app if it is not already running:

```sh
npm run dev
```

Open [local sign-in](http://localhost:4321/auth/signin) and use:

- **Email:** `wallet-demo@example.test`
- **Password:** the password you entered above

The demo provides 100 investments across five wallets with synthetic daily history. Normal reruns preserve your edits and keep the original account password. In the same terminal, run `npm run seed:demo` again without re-entering the password. In a new terminal, repeat the password-prompt block using the original password.

Every demo holding selects Apple (**AAPL**), as investments saved before stock selections existed do. The open twelfth holding in **Demo · Rising** is already linked to Apple on Nasdaq (USD). It starts without a manual or cached quote, so click **Download prices** on Positions to fetch its first real market price. The loader only seeds listing metadata and never contacts Yahoo. Synthetic purchase amounts and historical observations remain demo data.

Rerunning the loader also links that holding in older demos if it is still open, not deleted and unlinked, preserving any edited label or manual price. An existing selected listing is kept. If the account already has the same AAPL listing in its cache, the loader reuses it unchanged; any real quote already saved there can immediately supply the holding's effective price.

To restore the original demo fixtures explicitly:

```sh
npm run seed:demo -- --reset
```

Reset affects recognised demo fixtures only and refuses unrelated references, including positions or lookup receipts referencing the fixture listing. It restores the fixture's metadata-only cache row; independently created canonical cache rows are preserved. See [wallet observations](context/deployment/deploy-plan.md#wallet-observations-and-cron) for daily capture, scheduler verification and further setup details.

Run `npm run test:decimal-db` (snapshot values and pagination) and `npm run test:demo-db` against local Supabase; `npm run test:contract-db` checks that snapshots, like every table, are readable only by their owner. The versioned scheduler migration activates daily capture when applied. Verify it locally with `npm run test:wallet-cron`; production migration deployment remains a separate authorised step.

## Script guide

See [Project scripts](scripts/README.md) for the categorized inventory, commands, prerequisites, automatic callers and data effects. Existing npm commands remain unchanged.
