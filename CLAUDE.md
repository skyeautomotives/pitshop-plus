# Working on Pitshop Plus

Two people (Blesson and Joel) work on this repo, each with their own Claude. Follow these rules so both work the same way.

## Git
- Always `git pull --rebase origin main` before starting and before every push. Never force-push `main`.
- One branch and one pull request per change. Merge only after CI passes.
- Commit messages and PR descriptions: short and general (what changed for users), not how it works inside.

## Writing
- No em dashes or en dashes anywhere (code, UI text, docs, commits). Plain, simple English; no filler or AI-sounding phrases.
- This repo is public. Don't add READMEs or docs that describe how the app is built. Keep code comments short.
- Never mention any internal or company-side backup in customer-facing text (site, app, Terms, Privacy, emails). Workshops are responsible for their own backups.
- Customers are never sent to GitHub. Everything they need (downloads, help, terms) is on https://pitshopplus.com/.

## Names that must not change
The product is "Pitshop Plus". These internal names keep the old spelling on purpose; renaming them breaks logins, installed apps or saved data:
`pitstop.invalid`, `com.skyeautomotives.pitstopplus`, `pitstop-<id>` and `pitstop:` storage keys, `pitstop-plus-backup`, `pitstop-plus-snapshot`, "Pitstop Plus snapshots".

## Database
- Every change is a new numbered file in `supabase/migrations/`. Never edit a migration that has been applied.
- A migration that creates a table must also grant access to it (Supabase stopped doing this automatically on 30 Oct 2026), next to the `create table`:
  `grant all on public.<table> to anon, authenticated, service_role;` and turn on row level security with policies, like the existing tables.
- Each workshop sees only its own data. Admin screens show counts only, never workshops' customers or bill amounts.
- Apply migrations together with the deploy that needs them, with `node supabase/apply-migration.mjs <file>` (needs `SUPABASE_ACCESS_TOKEN` in the environment). Never print tokens or keys.
- A change that needs a new migration is not finished until the migration is applied to the live database. Apply it right after merging, before tagging a release, and check it worked. Otherwise the website and apps offer things the database refuses, and customers get stuck.

## Before finishing
Run `npm run typecheck`, `npm test` and `npm run build`. All must pass.

## Releases
- The website updates on every merge to `main`. The Windows and Android apps only change after a release.
- To release: bump the version in `package.json`, `package-lock.json` and `src-tauri/Cargo.toml`, merge, then push a tag `vX.Y.Z`.
- Tell the person that installed apps show "Update now" after they restart (or within 6 hours), and must install the update to get the changes.
