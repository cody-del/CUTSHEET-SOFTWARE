# Five Day software pass — November 21, 2026

The tested quote-to-production path works. The main usability problem is that too many actions have the same visual importance, and different pages use different names for the same destination. The next improvement should simplify those existing pages, rather than add another dashboard.

## Changes prepared

- Bypass and tripass finished-panel tables show width and height in inches and exact fractions in the editor, digital checklist, and PDF. Panel quantity, track, and tilt position remain together.
- Component cut lengths retain their existing units and workbook formatting; the tested print and digital workflows use millimeters. No cutting formulas, overlap rules, deductions, or stored dimensions changed.
- Equal panel divisions can produce fractions smaller than eighths. Those values are displayed accurately instead of rounding the finished width to an eighth and changing its apparent overlap. Unusual decimal inputs remain decimal when no exact small fraction exists.
- Removed the incorrect “2 decimals” claim from millimeter print-unit selectors. The PDF still uses the existing workbook-compatible one-decimal presentation; digital cut lengths retain their existing presentation.

These changes are local and have not been deployed by this audit.

## Recommended navigation changes, in priority order

| Priority | Observed issue | Recommended change |
| --- | --- | --- |
| 1 | The order page has five similarly prominent dark buttons: payment, customer order PDF, cutting PDF, digital cut sheets, and review/edit cut sheets. | Give the current next step one primary button. Group print/digital/edit actions in a clearly labeled Cut sheets section. Keep payments in the payment section. |
| 1 | “Digital checklist,” “Open checklist,” and “Digital cut sheets” refer to the same working screen. “Review / edit cut sheets” opens a preview before another edit action. | Standardize on **Print cut sheets**, **Digital cut sheets**, and **Edit measurements**. Send Edit measurements directly to the controlled revision flow; retain the revision confirmation before changing released work. |
| 1 | Quote entry supports Step by step, but standalone cut-sheet entry and released-job revisions still use the long form. | Use the same Opening → Shutter → Review sequence for these paths. Make Step by step the initial default while keeping All on one page available. |
| 2 | Proposal review spreads edit/download/delete actions, pricing adjustments, and Create order across different areas. | Use a single bottom action area for the next step, with pricing adjustments together. Put deletion and uncommon actions in More options. |
| 2 | Sliding jobs still have a finishing checkbox labeled “Hinged / complete.” | Confirm the shop's sliding completion step, then label it “Hardware installed / complete” for bypass/tripass jobs. Keep “Hinged / complete” for hinged shutters. |
| 3 | Broadleaf and Starwood square-foot rates are blank in live Pricing. | Enter their approved rates before relying on automatic quotes for those products. Manual prices remain a separate option. The live ShutterSmart rate is populated. |

## The two starting paths

**New sale:** Home → Create quote → Enter openings → Review quote → Create order → Confirm price/payment → Production. In the tested workflow, confirming the order sends its eligible ShutterSmart lines to Production automatically. From that order, Print cut sheets and Digital cut sheets should be obvious adjacent choices.

**Cutting only / job already sold elsewhere:** Home → Create cut sheet → Enter openings → Review → Send to Production.

These should create one production job per intended job. An order already sent to Production should open its existing cut sheets, rather than lead the user into creating a second standalone job. Keep the seven existing navigation destinations consistent across owner pages.

## Verification completed

All interactive mutations used isolated synthetic records in a local workspace. Live company records were only read; no real customers, payments, orders, or production counts were changed.

- Created a mixed quote with a standard shutter and a four-panel bypass, reviewed its proposal, created an order, recorded a sample payment, and confirmed release to Production. The saved order total, payment, and balance agreed.
- Downloaded the order's cut-sheet PDF through its normal button.
- Opened digital cut sheets from the order and verified the return-to-order link.
- Recorded partial cutting and a material shortage, then partial capping. The board showed the job in Capping while preserving partial cutting and the material alert.
- Verified Production refresh, list view, reversible removal from Production, and restore. Restoration preserved progress and the order/payment record.
- Opened the controlled edit/revision workflow for released cut sheets and cancelled it without changing the released job.
- Released a separate standalone tripass job. Completed all cutting and finishing checks; it showed 348/348 pieces cut, 1/1 openings complete, and Complete in the production stages.
- Checked finished sizes, quantities, track labels, and tilt positions for two-, three-, four-, and six-panel examples. The six-panel example with quantity two showed twelve total panels.
- Generated a five-opening sample PDF and visually inspected every page. Each opening fit on one page, with finished sizes in inches/fractions and component sizes in millimeters.
- The full build and 272 automated tests passed. Coverage includes workbook references, standard/T-post/custom-frame/sliding calculations, order conversion, progress, revisions, auth isolation, offline queues, sync conflicts, and backup behavior.
- Production dependency audit reported zero known vulnerabilities at the time of this check. No browser console warnings or errors were captured in the checked local workflow tabs.
- Anonymous requests to live sales, jobs, backup status, and account-info endpoints were rejected with HTTP 401.
- Live Settings showed saved company branding/contact/terms information. Backup status showed an automatically verified backup at 12:17:09 PM on November 21, with recent backup history and the configured hourly/daily retention.

## Remaining real-world checks

- Re-test the physical shop iPad: open a job online, confirm it is available offline, close/reopen Safari without Wi-Fi, record progress, then reconnect and verify the owner sees it exactly once. Automated queue tests do not prove this device's offline cache and storage behavior.
- Perform an isolated restore drill from an actual encrypted backup into a disposable environment. This pass checked live backup status and automated backup behavior; it did not restore production or independently decrypt a live backup.
- Build/check the first bypass and tripass assemblies against their finished-panel schedule, track hardware, overlap, and tilt handling. Calculation regression tests and PDF review do not substitute for a physical fit check.
- This was an application workflow and regression audit, not a penetration test or a fresh inspection of all live Supabase policies/configuration.

## Preview artifacts

Local sample digital cut sheet: `http://127.0.0.1:4241/shop.html?job=audit-draft` (synthetic completed tripass job; server must remain running).

Generated five-page print sample: `output/pdf/sliding-panel-check.pdf`. Digital screenshot: `output/pdf/finished-panel-digital-preview.png`. These generated artifacts are excluded from version control.
