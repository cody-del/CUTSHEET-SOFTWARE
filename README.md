# Cut Sheets

A manufacturing app for standard and T-post Shutter Smart shutters. It includes saved jobs, opening duplication, fractional-inch or metric entry, opening diagrams, live part calculations, PDF previews, individual cut sheets, combined cutting lists, and JSON backup/restore.

## Run

With Node.js 22 or newer, run `npm install` in this directory once, then `npm start`. In the current workspace, dependencies are already available through the bundled runtime.

Open **http://127.0.0.1:4190/**. Keep that origin consistent: browser storage is separate on `localhost`. The server binds only to the local computer. When run locally, calculations and PDF generation stay on this computer. This app is separate from the marketing website.

Jobs save to localStorage in the active browser. Export a backup before clearing browser data or moving computers. Restore merges by job ID and preserves a newer local revision. Example data is clearly labeled. PDFs use US Letter, start each opening on a new page, paginate long notes, and include quantity, cut size, profile, and machining details. Dimensions retain full precision during calculations and grouping; displayed lengths use 2 decimal places in mm or 4 in inches. No kerf allowance is added.

## Deploy to Netlify

Import the `cody-del/CUTSHEET-SOFTWARE` GitHub repository into Netlify. The root `netlify.toml` sets Node 22, runs the test suite before every deployment, publishes `public/`, and bundles the calculation/PDF handler from `netlify/functions/api.mjs`. The calculator and PDF generator need no environment variables or external database. The optional shared workshop needs the setup below. The workbook is a JSON module bundled into the function; it is not published as a static asset.

The browser calls `/api/info`, `/api/calculate`, and `/api/pdf` on the same site. On Netlify, opening measurements and job details needed to generate PDFs are processed by Netlify Functions. The calculation and PDF endpoints do not store or log those requests. Explicitly sending a job to the shop stores its released cut sheets in the shared workshop. Saved jobs and the uploaded logo remain in localStorage in the current browser; they are not shared between users or devices.

To move jobs from the local app to the hosted site, choose **Settings → Export backup** locally, then **Settings → Import backup** on the live site. Upload your logo again in the live site's Settings. Browser storage is separate for each origin, so choose the stable production URL for everyday work. Deploy preview URLs each have separate storage.

Anyone with the site URL can use the calculator, but they cannot read another browser's saved drafts. The shared workshop has separate owner and paired-device access. Source workbook validation restrictions also apply to hosted PDF downloads.

## Measurement basis and light gap

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


## Digital shop floor and owner dashboard

Open `/owner.html` for production progress and `/shop.html` for the iPad cut sheets. From a saved job, **Send to shop** publishes a fixed, server-calculated copy. Draft edits never change released dimensions or quantities. Releasing the same job twice is rejected; revision/re-release management is not included yet. Material shortages are dashboard alerts, not email or push notifications.

Each line records **Not cut**, **Partially cut**, or **Fully cut**, including the actual completed quantity. Partial cuts ask whether material ran out. Yes opens a material request and pauses the active job timer. The owner can acknowledge it or mark material ready; neither changes the cut quantity or restarts the timer. Completing a line clears its material request. Completing all lines stops the timer automatically. Corrections are recorded in the activity history.

The owner sets estimated active cutting minutes and an optional target date. Pauses are excluded; a running timer continues across reloads and closed tabs until paused or all cuts finish. This version allows one active cutting job for the shared shop. Progress percentages count pieces, not estimated labor. Labels compare active time with the estimate and flag past target dates (end of day in America/New_York); they do not predict labor from piece percentages. Visible screens refresh from the server every five seconds. Failed/offline updates are not shown as saved. Version checks reject stale concurrent changes.

### Local preview

The loopback-only local server persists workshop jobs, device connections, and activity in `.data/workshop.json`, independently of browser drafts. Back up that file separately from draft JSON exports. It is Git-ignored. Local owner access skips sign-in; this mode must not be exposed to a public network. A localhost link on an iPad points to the iPad itself, not this computer. Use the hosted setup for separate devices.

### Hosted shared storage and access

The new Netlify function uses a PostgreSQL transaction with a row lock for all workshop changes. See [node-postgres transactions](https://node-postgres.com/features/transactions). No hosted data is written to a function's temporary filesystem. Storage is designed for a small single workshop, with up to 500 released jobs and the latest 200 activity entries per job; it is not a payroll system or unlimited audit archive.

The production site is [cutsheetsoftware.netlify.app](https://cutsheetsoftware.netlify.app/), connected to `main` in `cody-del/CUTSHEET-SOFTWARE`. Set these environment variables in Netlify's **Functions** scope and **Production** context, then redeploy. Mark password and session-secret values as secrets:

- `CUTSHEET_DATABASE_URL`: the private PostgreSQL connection URL. Alternatively, a configured [Netlify Database](https://docs.netlify.com/build/data-and-storage/netlify-database/) supplies `NETLIFY_DB_URL`.
- `CUTSHEET_DATABASE_PASSWORD`: optional raw database password, stored separately from the URL. Punctuation is encoded by the server; do not URL-encode this value yourself.
- `CUTSHEET_DATABASE_CA`: optional PEM database root certificate override. Supabase pooler connections automatically use the public Supabase CA bundled in `source/supabase-ca.json`, downloaded from **Database → Settings → SSL configuration**. The server verifies both the certificate chain and hostname, overriding URL SSL flags. If Supabase rotates this CA, update the bundled public certificate or set this override.
- `CUTSHEET_OWNER_PASSWORD`: a unique owner password of at least 12 characters.
- `CUTSHEET_SESSION_SECRET`: a cryptographically random secret of at least 32 characters.

Never commit these values or put them in the browser bundle. The function creates its `cutsheet_workshop` table on first use. For Supabase, pre-create the table with RLS enabled and revoke access from `public`, `anon`, `authenticated`, and `service_role`; the browser must never use the Data API to read workshop data. Use the transaction pooler on port 6543 for Netlify Functions. Use a database credential restricted to the application database and take database backups. The hosted workshop remains unavailable until all configuration is present; existing calculator/PDF features continue working.

The owner signs in to `/owner.html` (12-hour session), then generates a one-time, 10-minute connection code for `/shop.html` on the iPad. There are no employee accounts. A paired device uses a Secure, HttpOnly, SameSite cookie for up to 180 days, and the owner can revoke it at any time. The server records the device name, not an employee identity. Password and session-secret changes invalidate owner sessions; device connections must be revoked separately. A paired iPad cannot release jobs, modify schedules, resolve owner material alerts, pair other devices, or read the owner dashboard API. Keep owner access in a separate browser from the paired shop session.

The PostgreSQL deployment needs a real site/database connection and a cross-device acceptance check before shop use. Local workflow, persistence, timing, roles, authentication, pairing, revocation, stale writes, quantity validation and HTTP protections are covered by `test/shop.test.mjs`.
