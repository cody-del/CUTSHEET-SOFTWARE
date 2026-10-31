# Cut Sheets

A manufacturing app for standard and T-post Shutter Smart shutters. It includes saved jobs, opening duplication, fractional-inch or metric entry, opening diagrams, live part calculations, PDF previews, individual cut sheets, combined cutting lists, and JSON backup/restore.

## Run

With Node.js 22 or newer, run `npm install` in this directory once, then `npm start`. In the current workspace, dependencies are already available through the bundled runtime.

Open **http://127.0.0.1:4190/**. Keep that origin consistent: browser storage is separate on `localhost`. The server binds only to the local computer. When run locally, calculations and PDF generation stay on this computer. This app is separate from the marketing website.

New standalone cut sheets save to the shared workshop, alongside contacts, quotes, and orders. Older browser drafts are detected in Cut Sheets and can be imported as shared copies; their original localStorage records remain intact. Repeat imports are deduplicated, and later browser changes import a new copy without replacing cloud revisions. PDFs use US Letter, start each opening on a new page, paginate long notes, and include quantity, cut size, profile, and machining details. Dimensions retain full precision during calculations and grouping. Millimeter PDFs match the original workbook print formats: 1 decimal place for cut lengths, whole distance and other machining values, and whole millimeters for hinge positions. Inch PDFs retain 4 decimals. Digital screens retain their existing 2-decimal millimeter display. No kerf allowance is added.

## Deploy to Netlify

Import the `cody-del/CUTSHEET-SOFTWARE` GitHub repository into Netlify. The root `netlify.toml` sets Node 22, runs the test suite before every deployment, publishes `public/`, and bundles the calculation/PDF handler from `netlify/functions/api.mjs`. The calculator and PDF generator need no environment variables or external database. The optional shared workshop needs the setup below. The workbook is a JSON module bundled into the function; it is not published as a static asset.

The browser calls `/api/info`, `/api/calculate`, and `/api/pdf` on the same site. On Netlify, opening measurements and job details needed to generate PDFs are processed by Netlify Functions. The calculation and PDF endpoints do not store or log those requests. Explicitly sending a job to the shop stores its released cut sheets in the shared workshop. Standalone drafts now share the same transaction store as quotes and orders. Uploaded logos and unit preferences remain local to the browser.

To move jobs from the local app to the hosted site, choose **Settings → Export browser backup** locally, then **Cut Sheets → Import backup** on the live site. Upload your logo again in the live site's Settings. Browser storage is separate for each origin, so choose the stable production URL for everyday work. Deploy preview URLs each have separate storage.

Shared drafts require owner access, like contacts and quotes. Temporary public-owner mode grants these same capabilities to visitors when enabled. Paired shop devices cannot read shared drafts; they receive released manufacturing jobs only. Source workbook validation restrictions also apply to hosted PDF downloads.

## Measurement basis and light gap

Measurement fields accept decimal inches such as `51.875`, `36.58`, and `.625`, as well as fractions such as `36 5/8`. Millimeter inputs accept whole numbers and decimals, including `625` and `625.625`. Width, height, divider, and T-post fields retain entered precision when reopened; a bare `625` means 625 in the selected unit. Quote pricing uses the saved dimensions. Manufacturing size limits and the original workbook's own rounding rules still apply.

New openings default to **Shutter size**, matching the original workbook’s current `S` input (`SHUTTER FRM` on the print sheet). The measurement-type control sits beside width and height. Existing saved openings keep their original basis. Choose **Window opening size** only when entering window measurements that still need the workbook’s fitting deductions; mount position is a separate setting. For the 36.875 × 45 inch trim-frame Inside reference, selecting Window opening instead of Shutter size shortens louvers/rails by 3.175 mm and stiles/frames by 6.35 mm.

Light gap comes directly from the original workbook output (`PRINT SHEET!L9` or `T Post Cutsheet!L8`), and appears in the editor, cut-sheet preview, individual PDF, and combined PDF. It follows the selected output units. Calculations retain the unrounded value.

## Manufacturing scope and validation

Printed reference comparisons are documented below. Specific unresolved machining values remain identified in the app and PDFs; reference agreement alone does not establish physical shop validation.

The interface uses a neutral black-and-white layout, always-visible finish and secondary options, and visual panel choices. Select **T-post** under Construction to enter 1–4 cumulative post centerlines from the left edge of the entered size and a panel arrangement for each section. The default is two-piece standard-frame posts. Panels are equal within each section, but separate sections can have different widths. Existing browser jobs remain compatible.

Supported: 1, 2, 3, or 4 equal panels with every left/right split; 3 or 4 inch louvers; six frame types; inside/outside mounts; 4-sided windows, 3-sided windows/doors; one optional divider. The product family is explicitly Shutter Smart. French cuts, double-hung configurations, other material families, custom framing, and specialty accessories are not exposed.

`source/workbook.json` retains the 2,432 cells reachable from the supported outputs, across 18 supporting sheets of the 27-sheet Google Sheets export. Original formulas are preserved. The source program identifies itself as `20170211FCNew`. The app evaluates them with a bounded parser without JavaScript `eval`. Unsupported syntax, unresolved rules, invalid dimensions, or invalid part quantities fail closed. Source workbook warning cells prevent PDF generation. The app does not execute VBA or Apps Script; any original macro behavior remains unverified.

Source: [FRENCH CUT NEW PROGRAM (2)](https://docs.google.com/spreadsheets/d/1FGIwG2DLI-5FSbQ9KTH9_tn0t5dYAbkG/edit).

One specific inherited discrepancy needs review: `PRINT SHEET!H23` branches to `FC CALCULATION!N50` when `CALCULATION!F9=1` (standard frame). For the 36 × 60 inch sample, its louver midpoint is 186.1125 mm while half the 324.1125 mm louver cut is 162.05625 mm. The formula is preserved and the app/PDF explicitly flag the legacy machining value for verification. Other constants, hinge datum, first-hole position, rail choices, assembly allowances, product variants, and decimal display precision need physical/order validation too.

## October 16 reference audit

A fresh download of the original Excel file matches all 2,432 retained source cells. Four additional printed orders are covered in `test/printed-reference-cases.mjs`: standard 22.125 × 21.5 and 47 × 37.5, and T-post 72.625 × 49 and 72.75 × 61.5. The tests compare every listed length, quantity, profile, hinge position, machining value and light gap at the original print precision. The earlier standard 37.875 × 52.5 reference remains covered.

The 72.75 × 61.5 T-post printout has a 1,242 mm tilt rod. The default workbook mode gives 1,260 mm. Selecting the original split tilt-rod mode (`CALCULATION!H15=2`) reproduces 1,242 mm without changing any cut formula. The app now exposes `divisionMode` (`divider` or `split`) under Finish & other options. Existing jobs default to `divider`. In split mode the optional `divider` measurement becomes the split position; no divider rail is cut or drawn. With a blank split position, the original split-mode end allowance still applies. The original PDF does not print this setting, so the inferred mode needs operator confirmation; do not infer it from height or silently change existing jobs.

The 47 × 37.5 standard reference prints a 332.6 mm louver midpoint for a 470.6 mm louver. This matches `PRINT SHEET!H23`, which takes the standard-frame branch into `FC CALCULATION!N50`; it is not half the louver length (235.3 mm). The app preserves and flags this inherited value pending a confirmed machining datum. Printed reference parity does not verify macros, physical fitting or every specialty configuration.

## Compact cut sheets and calculated previews

Frame cards are always visible in a single desktop row, with an outlined selected card. Narrow screens can scroll the row. The app and PDF use paired gray/white specification and machining boxes; repeated validation banners, generic footer warnings and sign-off checkboxes are omitted. Specific machining and missing-stock-length notes remain concise and visible.

The schematic uses the original `CALCULATION (2)!F44:F46` louver groups and `K46` split count. Divider rails stop at the inner stile edges; upper/lower counts are drawn separately and shown below the preview. The 71 × 63.375 Z-frame, 3-sided opening with a 25-inch divider has 9 upper and 6 lower louvers per panel. No cut formula is changed by the presentation update.

The four printed references, that divider example and a five-section T-post with a divider fit one Letter page per opening in both output units. Longer part lists use two columns. Long notes and combined cutting lists retain automatic pagination rather than dropping details. These cases and the drawing counts are covered in `test/preview-layout.test.mjs`.

## T-post calculation path

T-post openings have an optional `tposts` object containing `construction` (`two-piece` or `one-piece`), `positions` (1–4 strictly increasing centerlines in inches), and `sections` (one more section than positions, each with left/right panel counts). Each section allows L, R, LL, LR, RR, LLR, LRR, or LLRR. Existing standard openings and backups remain compatible. Positions follow the datum of the entered opening/shutter/outside-frame measurement; original workbook formulas apply the relevant edge deductions.

The backend sets INPUT SCREEN G15 to TP, maps positions to G31/J31/M31/P31 and section panel counts to E31/F31 through Q31/R31, and explicitly sets CALCULATION (2) D13 for post construction. It disables the original equal-all-rails override (CALCULATION Y38 = 2), preserving section-specific lengths. It reads original T Post Cutsheet outputs for louvers, rails, dividers, stiles, frames, posts, tilt rods, and machining positions. Output quantities already include units and are not multiplied a second time. Standard and T-post inputs reset independently on every calculation.

The source reports one ST FRAME item per two-piece post position. Until stock-piece quantity is confirmed, this source quantity is preserved with an explicit fabrication note. Wide louvers labeled WITH ALUMINUM also carry a note because the T-post sheet supplies no aluminum insert cut length. Both notes appear on opening and combined PDFs. These details still need reconciliation before production use.

## Verification

Run `npm test`.

- The September 22 Google Sheets reference checks unrounded cuts, quantities, hinges, machining, and light gap. The Inside / Shutter size / Trim / Back tilt / 36.875 × 45 inch example matches all outputs, including a 6.8 mm light gap. The earlier 37.875 × 52.5 inch printed reference remains covered.
- 1,971 finite saved source values are compared with the evaluator. This tests source parity for the exported snapshot, not recalculation equivalence for every possible job.
- 288 T-post combinations cover 1–4 posts, both constructions, six frames, three tilt controls, and optional dividers. Position changes are checked against independent source deductions, invalid geometry is rejected, quantities scale exactly once, and grouped parts retain section references.
- 648 representative frame/size/louver/panel/divider combinations are checked for valid finite parts or explicit source warnings.
- Quantity scaling, exact grouping, unit relationships, invalid inputs, and circular/unsupported formulas are tested.
- PDF page sizes, ordinary one-page openings, long-note overflow, and long combined-reference pagination are tested.
- Browser checks cover fraction entry, invalid measurement handling, duplication/removal of sample openings, persistence, and PDF controls.

The next production milestone is a small set of real reference orders covering single/double/four panels, frames, mounts, three/four inch louvers, and divider rails, with all cut and machining outputs reconciled. Then add specialty configurations as separately verified scopes.

## Files

- `server.mjs`: local server, validation endpoints, PDF download
- `netlify/functions/api.mjs`: hosted calculation and PDF endpoints
- `netlify.toml`: tested builds, static hosting, and function configuration
- `public/`: dependency-free browser interface
- `engine.mjs`: source-formula parser/evaluator
- `calculations.mjs`: supported input mapping, part extraction, and source warnings
- `pdf.mjs`: paginated print layout
- `test/`: source snapshot parity and behavioral checks

## Preview layout reference

The user-provided panel configuration reference (September 21, 2026) defines the main folding choices: L, R, LR, LL, RR, LLR, LRR, and LLRR. The two common T-post presets are L / T / LR / T / R and LR / T / LR. The bottom-left bypass example (2 right, 2 left) is excluded. Existing saved custom folding layouts remain editable without being relabeled.

`public/layouts.js` owns the shared hinged-panel drawing geometry used in picker thumbnails, opening previews, and PDF schematics. T-post sections restart their own left/right folding groups at the post positions. Angles are illustrative, not hardware-clearance calculations.

The opening schematic occupies a full-width row below the measurements and automatically fits its SVG bounds, preserving the opening aspect ratio on wide T-post jobs. The 106-inch direct-entry cap applies to standard openings only; T-post jobs use original section-width and frame warnings. Post order and opening bounds are checked inline, and invalid positions suppress the drawing until corrected.


## Contacts, quotes, pricing, and orders

Open **Contacts** from the fixed owner menu. **Quotes** and **Orders** also have their own lists. The owner workspace stores contact names, addresses, phone numbers, email addresses, and private notes. Each contact shows its quotes and orders. Set the Shutter Smart price per square foot and optional minimum area per unit in **Settings → Product pricing**, then use **Build Quote** to enter the same shutter specifications used by the cut-sheet editor.

The contact form separates street address, city, and ZIP code, with Florida fixed as the state. ZIP codes may be five digits or ZIP+4. Notes stay in the contact's dedicated notes section. New addresses also retain a formatted address for existing contact views and quote/order PDFs; accepted orders keep their original address snapshot. Recognizable older Florida addresses populate the separate fields when edited, while unrecognized address text is preserved intact.

Billable area is `max(width × height ÷ 144, minimum area)` with dimensions in inches. The unit price rounds to cents before multiplying by quantity. Quote details support installation, discount, tax, expiration date, and customer-facing notes. Tax is calculated on the shutter subtotal after discount plus installation. Each quote saves its pricing; changing the Pricing tab affects future quotes unless **Use current pricing** is explicitly selected. No live rate is supplied by the app.

**Convert to order** preserves the customer details, prices, and opening specifications and locks the source quote. The order can produce order PDFs, manufacturing cut-sheet PDFs, and a shop release. Repeated conversion or release requests return the same record. Manufacturing warnings, including unacceptable light gaps, still block cut-sheet PDFs and shop release. Before release, Review measurements can correct a separate manufacturing copy without changing the sold quote, quantity, or price. After release, the owner can use **Edit cut sheet** to review and publish a manufacturing revision. Sold opening identities, quantities, prices, and payments remain unchanged. Commercial change orders are not included in this version.

Contacts, quotes, pricing, and orders use the existing shared Supabase workshop transaction store in production, and `.data/workshop.json` locally. Existing records remain compatible; no separate schema migration or client database credentials are needed. Owner access is required for every sales endpoint and sales PDF. Paired shop devices receive only the released manufacturing data, without prices, contact email/address, or private contact notes. Shared records use version checks to prevent overwriting edits from another device. Existing standalone browser drafts remain available for copy-based import from Cut Sheets; company logo/details and terms are shared through Settings.

The local preview skips codes and passwords on this computer. Demonstration contacts and sample rates entered locally do not seed the production database. Tests in `test/sales.test.mjs` cover pricing precision, persistence, authorization, frozen orders, retries, stale updates, PDF routes, and manufacturing handoff.

## Owner workspace navigation

`/` is Home. Every owner screen uses the same menu: Home, Contacts, Quotes, Orders, Cut Sheets, Production, Settings. Pricing and shop-device setup live under Settings. Production opens the same job board and digital cutting checklists for owners and paired employees; only owners see workspace navigation and management controls.

`/editor.html?quote=ID` builds quote lines; `?order=ID` previews an accepted order's ShutterSmart cut sheets; `?draft=ID` edits a shared standalone draft; `?job=ID` previews a legacy released shop job. Existing root `/?quote=ID` and `/?order=ID` links redirect to the editor. `/cutsheets.html` starts at the shared list rather than automatically opening a browser job.

App navigation prompts Save and leave, Discard changes, or Stay here for unsaved forms. Same-document browser Back uses this guard; closing/reloading or leaving a document through browser controls retains the browser's native unsaved-change warning. Production details use history entries so Back returns to the board. List searches, production filters, return context, and list scroll are retained in session storage.

Navigation reuses short-lived read snapshots in session storage and preloads the owner lists after loading a screen. Home, Contacts/Quotes/Orders, and Cut Sheets refresh in the background every 30 seconds while visible; Production still refreshes every five seconds. Background rendering waits while a form, dialog, or focused input is in use. Hovering or focusing a record link preloads its detail. Reads share in-flight requests, use a 30-second freshness window, and can display a snapshot up to five minutes old only while the session was checked within the last 30 seconds. Saves always reach the server and retain optimistic version checks; they invalidate read caches locally and in other tabs. Sign-out, changed roles, and authorization failures clear cached access/data. Offline writes are not queued. `test/shop-client.test.mjs` and `test/workspace-sync.test.mjs` cover reuse, expiry, concurrent requests, invalidation, access changes, and scheduling.

`workspace-service.mjs` stores `drafts` and `draftImports` inside the existing private workshop JSON row, without a schema or permission change. Draft saves use optimistic versions. Imports keep source copies and record a content fingerprint for idempotency. Draft release uses the saved server specifications and the existing calculation validation. `test/workspace.test.mjs` covers persistence, conflict protection, safe imports, locked release, authorization, and invalid configurations.

## Digital shop floor and Production

Open `/owner.html` for the Production board, then open a job for its digital cut sheet. `/shop.html` remains a compatible iPad connection entry and shows the same board and checklist after connection. From a saved draft or accepted order, **Release to shop** publishes a server-calculated copy. Ordinary draft saves cannot overwrite a released sheet. Repeating a draft/order release returns the existing job; the legacy publish endpoint rejects duplicates. Material shortages are dashboard alerts, not email or push notifications.

The owner can choose **Edit cut sheet**, change specifications, and select **Review & update shop**. The review lists changed inputs and cut lines before publication. Unchanged cut lines retain counts and material requests. Changed lines restart at zero, and manufacturing changes reset finishing checks for the affected opening. Notes-only revisions preserve cutting and finishing progress. A running cutting timer pauses, and any newly unfinished work reopens the relevant production stages. The sold order remains unchanged; standalone sheets can also add or remove openings.

Saving a revision updates the production job and its source manufacturing copy together. Concurrent owner edits and shop progress require a fresh review instead of overwriting newer work; retries do not apply a revision twice. The most recent 20 previous revisions are retained in stored job history and company backups, with no history-restore interface. Digital sheets and PDFs display the revision number and identify earlier printouts as replaced. Workers can record progress but cannot edit specifications or access revision history. Tests in `test/job-revisions.test.mjs` cover preservation, resets, concurrency, retries, validation, financial isolation, and owner-only authorization.

The owner board follows **Waiting → Cutting → Capping → Boring → Building → Hinging → Complete**. A converted order appears in Waiting immediately. Orders held for owner confirmation or measurement review show a locked cutting view with the reason; finishing checks remain available. Employees never receive the financial or contact record. Released jobs enter Cutting when the cutting timer starts or any line is marked partially/fully cut. All cuts complete advances to Capping; recording finishing work can also advance the current stage while cuts remain unfinished. The same job remains visible in amber under earlier unfinished stages, with remaining cut quantities and material requests.

The shop's digital job has Partial and Complete controls for Louvers capped, Stiles capped, Boring, Building, and Hinging. Checks are independently available while work overlaps. Current and earlier unfinished columns are views of one job, not duplicate records. The owner board and order/contact views derive the same stage from saved shop progress. Cutting time measures cutting only. Finishing updates record time and device identity in the owner's activity history. Corrections preserve other recorded work and reopen unfinished stages. All cuts and finishing checks across every opening must be complete before the job reaches Complete. Production records use the existing transaction store and require no database migration.

Each line records **Not cut**, **Partially cut**, or **Fully cut**, including the actual completed quantity. Partial cuts ask whether material ran out. Yes opens a material request and pauses the active job timer. The owner can acknowledge it or mark material ready; neither changes the cut quantity or restarts the timer. Completing a line clears its material request. Completing all lines stops the timer automatically. Corrections are recorded in the activity history.

The owner sets estimated active cutting minutes and an optional target date. Pauses are excluded; a running timer continues across reloads and closed tabs until paused or all cuts finish. This version allows one active cutting job for the shared shop. Progress percentages count pieces, not estimated labor. Labels compare active time with the estimate and flag past target dates (end of day in America/New_York); they do not predict labor from piece percentages. Visible screens refresh from the server every five seconds. Failed/offline updates are not shown as saved. Version checks reject stale concurrent changes.

### Local preview

The loopback-only local server persists workshop jobs, device connections, and activity in `.data/workshop.json`, independently of browser drafts. Back up that file separately from draft JSON exports. It is Git-ignored. Local owner access skips sign-in; this mode must not be exposed to a public network. A localhost link on an iPad points to the iPad itself, not this computer. Use the hosted setup for separate devices.

### Hosted shared storage and access

The production site is [cutsheetsoftware.netlify.app](https://cutsheetsoftware.netlify.app/), connected to `main` in `cody-del/CUTSHEET-SOFTWARE`. It uses Supabase Auth and private PostgreSQL workspaces. See **Private accounts (Supabase Auth)** below for setup. Local passwordless preview mode is never used by the deployed functions.

Netlify server variables belong in **Functions** scope, **Production** context:

- `CUTSHEET_DATABASE_URL`: private PostgreSQL transaction-pooler connection URL (port 6543 for Supabase).
- `CUTSHEET_DATABASE_PASSWORD`: optional raw database password stored separately from the URL. The server encodes punctuation safely.
- `CUTSHEET_SESSION_SECRET`: a random secret of at least 32 characters for paired shop devices.
- `CUTSHEET_SUPABASE_PUBLISHABLE_KEY`: optional override of the same-named Vault value.
- `CUTSHEET_DATABASE_CA`: optional PEM root certificate override. Pooler connections otherwise use `source/supabase-ca.json`; certificate and hostname validation remain enabled.

Keep credentials out of Git and browser bundles. The hosted routes ignore the old shared owner password and public-owner-access flag; keep that obsolete flag false as defense against an accidental rollback to older code.

The owner uses an email/password account. A one-time connection code from **Settings → Shop devices** connects `/shop.html` on an iPad. Codes expire in ten minutes, and a device session lasts up to 180 days unless revoked. The server records the device name, not an individual employee. Owner and worker sessions should use separate browsers/devices.

Paired workers can view digital cut sheets and print their PDFs, record cut quantities, complete finishing checks, track cutting time and raise material shortages. They cannot access sales, contact records, company backups, settings, device management or financial totals. These restrictions are enforced in the server, not just hidden navigation.

The workspace is sized for a small shop: up to 500 released jobs and the latest 200 activity entries per job. Internet access is required to save updates; offline writes are not queued. Test the owner's real account and an actual iPad before daily use.

### Company backups and recovery

**Settings → Company backup → Download company backup** exports the current owner's shared contacts, quotes, orders/payments, cut-sheet drafts, production progress, saved pricing, company logo/details and terms. It requires owner access and bypasses the read cache. Passwords, login tokens, iPad connections and connection codes are excluded. Save the file in a private backed-up folder. This is a manual export, not an automatic or full PostgreSQL backup.

Recovery is administrator-only. Supply database credentials through environment variables, then run:

```sh
node scripts/restore-workspace.mjs /secure/path/company-backup.json 5dayshutters@gmail.com
```

The command verifies the checksum, requires a verified authorized owner account, and refuses any destination containing contacts, quotes, orders, jobs or drafts. Its default is a dry run. Only repeat with `--apply` when the empty destination and account have been verified. Recovery stops running cutting timers at the backup timestamp and clears shop-device access; reconnect each iPad afterward. Local tests verify business-data round trips, credential exclusion, worker denial, account isolation and damaged-file rejection.

The separate **Older browser drafts** export covers only drafts saved in that browser. It cannot replace a company backup. Managed database backups/off-site scheduling and a live restore rehearsal still need the correct Supabase account and an agreed retention/storage setup; they are not claimed active by this release.

## Order payments and shop handoff

Converting a quote opens **Pricing & payment**. The owner confirms the final sale total (including tax) and records any amount already received, including zero. Home and Orders show confirmed sales, received payments, and outstanding balances. Legacy orders remain marked **Needs pricing** until confirmed; no payment history is inferred. Additional receipts use integer cents, optimistic versions, and retry-safe IDs. Voiding an incorrect entry retains its reason and timestamp; the app does not process charges or refunds.

Confirmation automatically releases valid ShutterSmart lines to the shop, including the ShutterSmart subset of a mixed order. Other products remain on the sales order. Calculation warnings retain the financial record but hold cutting; pending cards remain visible in Production without exposing financial or contact fields to paired employees. Before release, **Review measurements** allows correcting a separate manufacturing copy; the sold quote, quantity, and commercial price stay unchanged. After release, **Edit cut sheet** requires an explicit review before replacing the shop copy.

**Production** has one board and no Overview/Shop Floor tabs. Every card opens a digital cut sheet with per-part counts (for example, 0 of 20 cut), Not cut / Partially cut / Fully cut controls, and independent finishing checks. Whole distance (the first louver hole from the top of the stile) is highlighted in the always-visible opening summary, repeated on regular and flat stile rows, and bold at the top of its PDF page. Measurements and the shutter preview stay visible; additional machining notes can expand on demand. Partial work is amber and fully cut rows are green. Finishing work can advance the current stage while earlier unfinished stages retain amber cards. Existing combined Capping records remain compatible. Multi-opening sheets show one opening at a time with an opening selector and Previous/Next controls. Cut counts and finishing checks belong to each opening; an automatic completion mark requires all its units to be cut and all five finishing checks to be complete. Job stage is aggregated across every opening. Existing whole-job checks remain valid as inherited values until a worker updates that opening; older clients retain explicit whole-job actions. Download Print PDF is separate from digital checkoffs. Held orders show the reason and owner correction link, keep cutting locked, and allow finishing checks. The job-get and job-pdf routes require an existing owner or paired-shop session; held previews cannot record cuts or generate production PDFs, and workers receive no commercial/contact records.

For isolated UI verification, run `PORT=4191 WORKSHOP_DATA_FILE=/private/tmp/cutsheet-test.json npm start` with a new temporary file. This keeps synthetic payment/order tests separate from `.data/workshop.json` and live Supabase.

## Private accounts (Supabase Auth)

The hosted site now ignores the former `CUTSHEET_PUBLIC_OWNER_ACCESS` switch and legacy owner/shop cookies. Public visitors see `/auth.html`; every saved-data endpoint and calculation/PDF endpoint requires an authenticated account or an explicitly paired shop device. The localhost development server remains an isolated local workspace and must never be deployed as the hosted service.

Signup uses email, a password of at least 12 characters, and an access code. **The code authorizes registration; it never selects or shares another account's data.** Users must confirm their email. A direct call to Supabase's public signup endpoint cannot grant app access: only server-recorded, code-approved registrations can enroll. No authorization relies on user-editable metadata. Access/refresh tokens are Secure, HttpOnly, SameSite cookies; no credentials or access code are put in browser storage. Revoked/deleted Supabase sessions fail the server's session check. Signing out, switching accounts, and switching to a paired-device role invalidate private cached views.

Configuration for project `uvfwnjrhbixcgjymzomm`:

1. In **Supabase → Project Settings → Vault**, create `CUTSHEET_SIGNUP_ACCESS_CODE` with the access code you choose (12 or more characters). This is a **Vault secret**, not an Edge Function environment variable; the Netlify backend reads Vault through its existing database connection. Never put the value in source control or frontend JavaScript.
2. Save the project's enabled publishable API key in Vault as `CUTSHEET_SUPABASE_PUBLISHABLE_KEY`. Alternatively, set that same name as a Netlify server environment variable. The key must belong to this project. No service-role key is needed.
3. Keep **Email provider** and **Confirm email** enabled. The server checks the provider settings and refuses access if automatic email confirmation is enabled. Configure Supabase Auth Site URL as `https://cutsheetsoftware.netlify.app`, and allow the exact redirects `https://cutsheetsoftware.netlify.app/auth.html` and `https://cutsheetsoftware.netlify.app/auth.html?mode=reset`. Configure and verify SMTP delivery for client signup/reset emails; the default Supabase mail service may restrict recipients.
4. Keep the existing database connection, database password, and `CUTSHEET_SESSION_SECRET` configured on Netlify. `CUTSHEET_SUPABASE_URL` optionally overrides the fixed project URL. The old shared owner password is no longer used by hosted routes.
5. The idempotent migration in `supabase/migrations/20261019125949_account_workspaces.sql` is bundled as `source/account-schema.json` and applied transactionally on the first shared API request. It creates private account tables, a restricted NOLOGIN application role, and owner-based RLS. All runtime workspace transactions assume that restricted role; anonymous/authenticated Data API roles receive no table grants. The original `public.cutsheet_workshop` is retained and its public grants revoked. It is never copied to the first registrant automatically.
6. After the intended owner signs up and verifies their email, explicitly assign existing records using `node scripts/assign-legacy-owner.mjs owner@example.com` with the database credentials supplied in the environment. The script requires an authorized, verified account, refuses a populated destination or a repeated assignment, preserves the original snapshot, and discards obsolete device credentials. New accounts always start empty. Reconnect shop iPads from the correct owner's Settings.

Verification: `npm test` includes real PostgreSQL RLS checks in PGlite, two-account contact/job/PDF isolation, wrong-code/direct-signup rejection, session revocation, legacy-cookie rejection, same-role cache changes, and device scoping/revocation. Hosted SMTP, real sign-in, and live database advisor/restore checks still require access to the correct Supabase project; local tests do not replace those checks.


## Quote and cut-sheet workflows

Home offers **Create Quote** and **Create Cut Sheet**. A standalone ShutterSmart cut sheet needs no quote or payment: enter measurements, save, and download a print PDF. **Send to Production** is a separate action that locks specifications and opens the digital cutting/finishing checklist. Standalone drafts can optionally link to an existing workspace contact and appear in that contact’s Standalone cut sheets section.

Quotes support multiple products. After acceptance, the pricing/payment screen clearly states whether confirmation will send ShutterSmart lines to Production or hold them for measurement review. Non-ShutterSmart products remain on the quote/order. Every order release path, including legacy publish requests, requires the order’s server-stored sale confirmation. No payment is required to be received; zero received is valid. Confirmed orders with corrected valid measurements release on **Save corrections & send to Production**. Navigation save dialogs use that same explicit action label.

New openings start with blank width and height and Shutter size remains the default. Quotes and standalone drafts save automatically, including unfinished measurements, with a visible Saved / Saving / Not saved status. Saves are serialized and navigation flushes pending edits; a conflict leaves work unsaved instead of overwriting another device. Complete measurements are still required for pricing, order conversion, printing, and production release. A new line inherits product options, while its measurements and custom price start blank. Its product can still be selected while the line is unfinished.

Home provides three starting points: Create Quote, Create Cut Sheet, and Find my job, followed by recent work. New customers entered during quote creation go straight to the quote editor. Standalone jobs receive unique CS numbers automatically. Browser import/export tools live in Settings. Production defaults to a searchable job list at tablet widths, with stage filters and an optional desktop board. Job labels include the customer, and unstarted timers explicitly say Time not tracked.

Confirmed frame mappings: Modern Standard uses Standard cutting rules; Modern Z and Elegance use Z rules. Each keeps its own appearance and printed name. Designer uses its separate workbook profile. Older preview-only records resolve these confirmed aliases when calculated or saved; released production copies change only through the owner's reviewed revision flow. Regression tests compare both standard and T-post outputs and verify PDF generation.
