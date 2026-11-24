# TPM Site Audit

Internal tool for the **Technical PM Quality Standard — "The site audit"** (whitelabelmd.com).
Technical PM audits. Bree approves.

- **Board** (Kanban, one card per client site): `In audit` → `Fix & retest` → `Ready for Bree` → `Approved`.
- **Audit detail**: site name, URL, audit date, assigned PM and the guide's 3-step process:
  1. **Document coverage** – log tested pages/buttons and confirm 100% coverage on desktop and mobile.
  2. **Fix + retest** – the 12 required checks, each with separate Desktop / Mobile checkboxes, status
     (Pending / Fail / Retest / Pass), owner, notes, screenshot links and retest result.
  3. **Bree sign-off** – Approve, or Request changes with a comment (optionally reopening checks).
- **Coming soon** items with their verified reason, shown on the card and in the sign-off.
- **History**: approved audits with the full checklist, dates, approver and comments; search + filter by client and approval date.
- **Guide**: the source guide rendered in-app.

All check text comes verbatim from the guide in [`src/lib/checks.ts`](src/lib/checks.ts).

## Workflow rules

| Rule | Where |
| --- | --- |
| A check is complete only when its status is **Pass** and both **Desktop** and **Mobile** are checked. Pass is rejected otherwise; unchecking a device on a passed check sets it back to **Retest**. | `src/lib/workflow.ts`, `src/lib/actions.ts` |
| Check 01 (100% of buttons + CTAs) can only pass when the coverage log has rows and every row is tested on desktop and mobile. | `passBlocker()` |
| Check 12 ("Coming soon" review) can only pass when every coming-soon item has a reason and is verified. | `passBlocker()` |
| Any Fail/Retest moves a card from `In audit` to `Fix & retest`. | `deriveStage()` |
| All 12 checks complete → card moves to `Ready for Bree` automatically; if a check regresses it moves back to `Fix & retest`. | `deriveStage()` |
| Request changes (comment required) → `Fix & retest`; the card stays there until the PM clicks **Resubmit to Bree** with all 12 checks complete. | `requestChanges()`, `resubmitToBree()` |
| Approved audits are read-only and appear in History. | `assertEditable()` |

### Roles (no login)

There is no authentication. The header has a role switcher (**Technical PM** / **Approver**) and a free-text name, both
stored in the browser's `localStorage`. The name is recorded on every action in the activity log.
- Approver sees an **Awaiting review** inbox badge with every card in `Ready for Bree`.
- Technical PM sees a **Changes requested** inbox for cards Bree sent back.

> Because there is no auth, anyone with the URL can act as either role. Put the deployment behind
> Vercel Deployment Protection (or add auth) if the URL must stay private.

## Tech

- Next.js 15 (App Router, TypeScript, Server Actions)
- Prisma 6 + PostgreSQL (any Postgres: local, Neon, RDS, Cloud SQL, Supabase…)
- No vendor-specific SDKs; the only runtime dependency on infrastructure is `DATABASE_URL`.

## Environment variables

| Name | Used by | Description |
| --- | --- | --- |
| `DATABASE_URL` | app runtime | Postgres connection string (pooled is fine). |
| `DATABASE_URL_UNPOOLED` | Prisma migrations | Direct (non-pooled) connection string. Locally it can equal `DATABASE_URL`. |

Neon's Vercel integration creates both variables automatically.

## Local development

Requirements: Node 20+, a local PostgreSQL 14+.

```bash
# 1. Create a local database (example with the default postgres user)
createdb tpm_audit            # or: psql -U postgres -c "CREATE DATABASE tpm_audit;"

# 2. Configure env
cp .env.example .env          # edit credentials if needed

# 3. Install, migrate, seed
npm install
npx prisma migrate deploy     # or `npm run db:migrate` while changing the schema
npm run db:seed               # 4 sample audits (one per column); skipped if data exists

# 4. Run
npm run dev                   # http://localhost:3000
```

Docker alternative for step 1:

```bash
docker run -d --name tpm-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=tpm_audit -p 5432:5432 postgres:16
```

Useful scripts:

| Script | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` | Type-check |
| `npm run db:migrate` | Create/apply a migration after editing `prisma/schema.prisma` |
| `npm run db:deploy` | Apply pending migrations (used in production) |
| `npm run db:seed` | Insert sample data |
| `npm run db:reset` | Drop and recreate the **local** database, then seed |
| `npm run test:e2e` | Full browser walkthrough against a running app (see below) |

### End-to-end test

```bash
npx playwright install chromium   # once
npm run build && npm start        # in one terminal
npm run test:e2e                  # in another (BASE_URL defaults to http://localhost:3000)
```

It creates an audit and walks the full flow: guard rails, coverage, a failure with owner/notes/screenshot/retest,
a verified coming-soon item, all 12 checks → Ready for Bree, a regression and back, Bree's inbox,
Request changes → Fix & retest → Resubmit, Approve, and History search/filters. Screenshots go to `e2e/output/`.

## Deploy to Vercel + Neon

1. **Import the repo** – In Vercel: *Add New… → Project → Import Git Repository* → pick `agarucorp/tpm-site-audit`.
   Framework preset: **Next.js** (auto-detected). Leave build settings at their defaults — Vercel runs the
   `vercel-build` script from `package.json` (`prisma generate && prisma migrate deploy && next build`).
   Click **Deploy**. The first deployment fails because there is no database yet; that's expected.
2. **Add Neon** – Open the project → **Storage** tab → **Create Database** → choose **Neon** (Marketplace) →
   accept the terms, pick a region close to your Vercel functions (e.g. `us-east-1` / Washington D.C.), plan, and create.
3. **Connect it to the project** – When prompted, connect the database to this project for **Production, Preview and
   Development**. Keep the default env var prefix so the variables are named `DATABASE_URL` and
   `DATABASE_URL_UNPOOLED`. Check *Settings → Environment Variables* to confirm both exist.
4. **Redeploy** – *Deployments* → latest deployment → **⋯ → Redeploy**. The build applies the migrations to Neon.
5. **(Optional) Load the sample data** into the new database from your machine:
   ```bash
   npm i -g vercel && vercel link        # link this folder to the Vercel project
   vercel env pull .env.production.local --environment=production
   npx dotenv -e .env.production.local -- npm run db:seed
   ```
   (or paste the two connection strings into `.env` temporarily and run `npm run db:seed`).
6. **(Recommended)** Enable *Settings → Deployment Protection* so only your team can open the app.

## Migrating later

The schema lives in `prisma/schema.prisma` and plain SQL migrations in `prisma/migrations/`. To move to another
Postgres provider, `pg_dump` the Neon database, restore it on the new host and point `DATABASE_URL` /
`DATABASE_URL_UNPOOLED` there. The app also runs on any Node host (`npm run build && npm start`).
