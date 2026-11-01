# Settings, pricing, and recovery check — November 1, 2026

## Findings

- The blank Settings fields were in the isolated local Broadleaf demo on port 4213. The live owner workspace still contained the company name, address, phone, email, website, terms, and logo. No production company fields were overwritten during this audit.
- Hosted requests use `account-runtime.mjs` and the PostgreSQL account store. Company details, configurable product rates, customers, quotes, orders, and production progress live in the authenticated owner's `cutsheet_private.workspaces` JSONB row. Browser snapshots are temporary display caches; writes require a successful server response and the current record version.
- The live ShutterSmart rate was $32/sq ft with no minimum. Broadleaf's live rate was unset; the local demo's $25/sq ft is sample data. Do not copy sample rates into production.
- EWF's supplier pricebook and add-on rules are versioned application files (`public/ewf-catalog-data.js`, `public/ewf-catalog.js`) in GitHub and the deployed app, not database rows. Saved quote specifications, pricing snapshots and overrides belong to the owner workspace. Prices not documented in the catalog require a confirmed manual price.
- Text-size and measurement-unit preferences intentionally stay on each device. They are separate from company details and commercial records.

## Verification

- Downloaded a fresh live company backup through the authenticated Settings button at 2026-11-01 11:53:42 UTC.
- Validated its SHA-256 checksum and restored it into an isolated temporary file store. Reopened it through a second store instance and compared customers, quotes, orders, drafts, company profile and pricing. Temporary restored data was then removed.
- Backup contained 2 contact records, 4 quotes, 2 orders, 1 draft and 2 production jobs (counts include any archived/deleted records). Login and shop-device credentials were excluded as intended.
- This was an application-data restore rehearsal, not a full production PostgreSQL/Auth disaster-recovery test. The downloaded backup remains outside the repository.
- Verified Settings save/reload in a separate empty local workspace. Regression suite: 211 tests passed, including version conflicts, account isolation, worker access restrictions and backup integrity.

## Changes

- Local Settings now identifies the demo workspace and links to live Settings. Company save status distinguishes demo storage from the company account. Backup description explicitly includes saved pricing.
- Broadleaf measurement selectors include every sixteenth from 1/16 to 15/16 for width, height, splits, divider rails, T-posts, and manual tip-to-tip sizes. Existing decimals and metric values are not rounded. Browser tests verified exact save/reload and decimal entry with an existing fraction selected.

## Remaining setup

- Set the intended Broadleaf rate in live Pricing before using automatic pricing for client quotes.
- Automatic offsite backups are not configured by this change. Current app exports are manual. Supabase recommends offsite exports for free projects; paid managed plans provide daily database backups: https://supabase.com/docs/guides/platform/backups . A schedule, private destination, retention policy, failure alert, and full database recovery rehearsal remain to be selected/verified.
- The connected Supabase tool account could not access this project's management settings, so managed backup status/retention was not independently verified in its dashboard. Live authenticated app reads and the company export succeeded.
