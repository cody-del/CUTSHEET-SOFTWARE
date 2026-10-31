# Five Day software pass and owner handoff

Date: October 28, 2026 (America/New_York). Application release: `061f12b`.

## Assessment

The tested quote-to-order-to-production and cut-sheet-only workflows completed successfully. No new blocking functional defect was found in those workflows. This supports a supervised pilot, not a claim of zero bugs, complete accessibility conformance, or physical manufacturing validation.

All mutations used disposable data at `http://127.0.0.1:4206/`, stored separately in `/private/tmp/fiveday-audit-2026-10-28/workshop.json`. Live checks were read-only. No real contacts, quotes, orders, payments, cutting progress, credentials, or database settings were changed. No application code was changed or deployed during this pass. The README was corrected where it still described the older strictly sequential pipeline and expandable measurement summary.

## Current software map

| Screen | Purpose |
| --- | --- |
| Home | Create Quote, Create Cut Sheet, Find my job; recent work and expandable sales summary. |
| Contacts | Customer details, fixed Florida state, private notes, linked quotes and orders. |
| Quotes | Customer-name default; per-line product selection; detailed ShutterSmart configuration; simpler other-product inputs; pricing and proposal PDF. |
| Orders | Frozen accepted quote; confirm agreed total and payment received; additional payment records/corrections; order PDF; manufacturing handoff. |
| Cut Sheets | Standalone ShutterSmart drafts and order cut sheets; save, calculate, print, and release. Standalone jobs do not create sales/payment records. |
| Production | Job list or board; cutting quantities, shortages, active cutting timer, finishing checks and opening completion. |
| Settings | Company details/PDF logo/terms, product rates, larger text, units, shop-device setup, and manual company backup. |

The owner uses the authenticated workspace. A paired shop device uses `/shop.html` and receives manufacturing data only: job number, opening labels, specifications, shop notes, quantities, checks and shortages. Customer contact details, pricing, balances, private contact notes, company backups and owner settings are denied by the server. Opening names and shop notes are deliberately visible, so private customer instructions should stay in Contact notes.

## Fresh verification

| Area | Result and evidence |
| --- | --- |
| Automated suite | All 149 tests passed; none failed or skipped. Includes original workbook/reference cases, units/decimals, T-post geometry, PDF layout, pricing, payments, persistence, backup restoration, account isolation, worker authorization, concurrent edits and overlapping production. |
| Dependencies | `npm audit --omit=dev` reported zero known vulnerabilities. This is an advisory check, not a penetration test. |
| Live release and anonymous access | Live `shop-state.js`, `shop.js`, and `shop.css` byte hashes match the audited release. `/shop.html` responds 200; anonymous `/api/shop/jobs` and `/api/shop/sales` respond 401. Existing owner session loaded Home, Settings and Shop devices. |
| Create Quote | Home started a new contact, then went directly to the quote editor. The quote name defaulted to Alex Sample. Florida remained prefilled. |
| Detailed and mixed products | Saved 36.875 x 45 inch ShutterSmart with Trim frame and Back tilt, plus 51.875 x 36.58 inch Elegant Shutters. Add Line inherited ShutterSmart/frame defaults while leaving new dimensions blank; changing the unfinished second line to Elegant removed manufacturing controls. |
| Pricing | Custom prices $500 and $350, $25 discount and $100 installation produced $925. Saved $25/sq-ft pricing persisted across reload. A later 36.875 x 45 inch quote calculated $288.09. Existing order pricing stayed unchanged. |
| Proposal and order | Proposal downloaded through the browser. Conversion opened Pricing & payment. $925 agreed sale with $400 received produced $525 due. Only one ShutterSmart opening entered Production; Elegant remained on the commercial order. |
| Payment correction | Recorded $100.25: paid $500.25, balance $424.75. Voided that sample entry with a reason: paid returned to $400, balance to $525; the correction remained in history. |
| Independent cut sheet | Created CS-0001 without quote/payment, entered 120 x 59.5 inches, four posts at 24/48/72/96 inches and five sections. All four fields and drawing appeared; invalid initial oversized panels produced a warning. A valid configuration released and locked its specifications. |
| Shortage and overlap | Started 45-minute estimated cutting timer, recorded 8 of 20 louvers with a material request, and marked louver capping Partial. Timer paused; Capping became current; Cutting remained amber with 26 total pieces left. Owner material request separately showed 12 louvers remaining. Orders also displayed Capping. |
| Complete production | Marked all 34 pieces cut; louver row background was green. Completed both cap checks, Boring, Building and Hinging. Current stages advanced correctly; final state showed 1 of 1 openings Complete and persisted after reload. |
| Keyboard/navigation | Space activated Louvers capped Complete and focus stayed on that check after save. Sidebar collapsed/expanded. Navigation between Home, Quotes, Orders, Settings and Production retained saved data. |
| Readability | +2 pt setting worked. Tested desktop forms had no horizontal page overflow. T-post screen exposed named measurement controls. Tablet viewport override did not take effect in this session, so no new tablet-width pass is claimed. Prior October 27 responsive checks remain separate evidence. |
| PDFs | Fresh order, standard cut-sheet and four-post cut-sheet PDFs generated successfully. Each was one US Letter page. Both cut-sheet pages were rendered and visually checked for rows, machining data and print checkboxes. Proposal/order formatting was also inspected. |
| Backup | Read-only sample company export contained contact, quotes, order, both production jobs and company data; excluded device connections, pairing codes and authentication attempts. Restoration/corruption refusal are covered by the passing automated tests. |
| Browser logs | No warning/error entries reported for the tested owner audit and live owner tabs. |

Primary local evidence: `/private/tmp/fiveday-audit-2026-10-28/`; automated log: `/private/tmp/cutsheet-employee-preview/audit-2026-10-28-tests.log`.

## Finish before routine use

1. **Company PDF identity and terms — owner/Cody.** Live Settings has a business name, but its shared PDF logo, address, phone, email, website and terms are empty. The bundled Five Day sidebar logo does not fill the PDF logo setting automatically. Supply the approved logo/contact details and existing business terms, save them, then review a proposal and order PDF. Website can remain blank if none exists. Do not invent terms or treat a sample PDF as a final customer document.
2. **Connect the real shop iPad — owner/shop.** Live Shop devices says no iPads are connected. Settings → Shop devices → Manage shop access → Connect shop iPad creates a one-use, ten-minute code. Enter it at `https://cutsheetsoftware.netlify.app/shop.html` in Safari. Test one checkoff, refresh, owner visibility, PDF download, and device disconnection. Do not sign the iPad in with the owner's account.
3. **Recovery and backup routine — Cody/owner.** SMTP was previously left unconfigured and was not changed or retested here. Current owner login works; establish who performs an administrative reset until password-reset delivery is configured and verified. Download a private company backup regularly, with an assigned owner and an agreed recovery location. Restore currently uses an administrator script and an empty destination; it is not a self-service Restore button.
4. **First real shop validation — owner/shop.** Run a small known job alongside the trusted original cut sheet and actual fabrication. The source still carries explicit machining/stock exceptions: the legacy Standard-frame louver midpoint branch, two-piece post stock quantities, and aluminum insert cut lengths where not supplied by the workbook. Existing notes must be reconciled with shop practice. Passing software references does not validate those physical rules.

## Expectations to explain accurately

- Only ShutterSmart creates manufacturing cut sheets. Elegant Shutters, Starwood and Other brand use simpler quote lines. There is no verified vendor-specific Starwood price-book import or option matrix in the current implementation; use saved rates or manual prices.
- A PDF download does not release a standalone job. Choose Send to Production when ready. A valid ShutterSmart order releases when the owner confirms the agreed sale/payment; zero received is allowed.
- Review measurements can correct an unreleased order's separate manufacturing copy. Sold commercial details stay fixed. After release, measurements are locked; there is no supported revise/re-release, cancellation or commercial change-order flow yet. Agree on a process before using it for changes to released work; do not create duplicate financial orders casually.
- Partial/complete finishing checks apply to all units of the selected opening. They do not count individual capped pieces. Every cut and finishing check on every opening is required for overall Complete.
- Printed checkboxes are manual marks; they do not update digital progress. One opening normally fits one printed page; long notes and larger combined lists can paginate.
- The timer measures active cutting, allows one running cutting job for the shop, and continues through closed tabs until paused or fully cut. It is not payroll, per-employee timekeeping, or per-stage labor tracking. A percentage of pieces cut is not a predicted percentage of labor complete.
- A material request is an in-app dashboard alert. It does not send email/SMS, order material, or maintain a stock ledger. Marking material ready does not change cut counts or restart the timer.
- Payment entries record money already collected. They do not charge cards, move money, issue refunds or reconcile a bank feed. Voiding an entry is a record correction.
- Saves require internet. No offline write queue exists; reconnect and confirm Saved before leaving. Version conflicts prevent silent overwrites. Production refreshes while visible; other owner lists also refresh in the background.
- A connected iPad identifies the device, not an individual employee. Keep owner and worker sessions on separate devices/browsers.

## Recommended next improvements

1. A short first-run Setup checklist for company/PDF identity, pricing, paired iPad and backup responsibility. It should stay out of the everyday shop checklist once completed.
2. A controlled correction/cancellation workflow for released jobs, preserving what was already cut and the original sale. This is more valuable than adding another dashboard.
3. Automatic private backups plus a documented restore drill, followed by verified password-reset email delivery.

Keep the existing seven-item owner menu. No additional dashboard is needed. Train the owner first on Home's two starting paths, then Orders for money and Production for shop status.

## Boundaries of this pass

No physical iPad, real printer, screen-reader session, real browser zoom test, full WCAG matrix, adversarial penetration test, production restore, email delivery, real payment, or actual cutting was performed. No fresh original spreadsheet download was made; calculation assurance here is the current retained source/reference suite. Hosted database policies were exercised through the local account-isolation test suite, not re-audited directly in the live Supabase dashboard.

Supabase's official SMTP guidance confirms that its default sender is restricted to project-team addresses and recommends a custom sender for production: https://supabase.com/docs/guides/auth/auth-smtp (checked October 28, 2026).
