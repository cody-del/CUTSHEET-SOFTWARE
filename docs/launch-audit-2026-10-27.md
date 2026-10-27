# 5-Day launch audit — October 27, 2026

Scope: owner workflows and a paired shop device, with all audit mutations confined to disposable local data. No live customer, order, payment, or production checkmarks were changed.

## Repairs

- Worker responses now use an explicit manufacturing allowlist. Customer-derived job titles become job numbers; customer/contact fields, pricing, finance, private metadata, and owner activity identities are excluded from list, detail, held-order, and mutation responses. Worker PDFs use the same projection. Opening labels, explicitly entered shop instructions, and material-request notes remain shared with workers.
- Paired devices are redirected from owner pages to the shop before owner modules can render. Account validation finishes before the response cache is constructed, preventing a previous owner's cached response from being restored during a role change.
- The disconnected iPad screen now says “Not connected” and points to Settings → Shop devices.
- Production checkoffs retain keyboard focus after saving.
- Advanced pricing follows a renamed opening. Unpriced quotes show a subtotal and cannot open the Create Order action until all lines are priced.
- Entering a width over 106 inches under Standard no longer traps the user: choosing T-post preserves the entered width and builds centerline controls. Switching a wide T-post back to Standard is blocked with an explanation.
- Password-reset delivery failures now show an actionable error rather than falsely suggesting delivery succeeded.

## Verification

| Area | Evidence |
| --- | --- |
| Automated suite | 147 tests passed, including workbook calculation references, PDFs, quote pricing, payments, independent opening completion, concurrency/stale versions, backups, account isolation, and worker permissions. |
| Dependencies | `npm audit --omit=dev` reported zero known vulnerabilities. This is advisory coverage, not a guarantee that no vulnerabilities exist. |
| Quote → order → production | Browser test created a two-product quote with decimal dimensions, custom unit prices and a $25 discount; recorded a $400 deposit against a $1,075 sale; confirmed a $675 balance; only the ShutterSmart opening reached production. |
| Payment corrections | Browser test recorded $100.25, verified the cents and balance, then voided the test entry with a reason and verified the balance returned to $675. |
| Standalone cut sheets | Browser test created, saved and released a 120-inch, four-post/five-section draft without a quote or payment. All four centerlines and the shutter preview appeared. |
| Digital shop | Browser paired a disposable device, started a timer, saved a partial cut/material request, checked that the timer paused, marked cuts green, and completed both standard and T-post openings. All 173 pieces and both openings reached Complete through the expected stages. |
| Access restrictions | Server tests deny worker sales, company settings, owner dashboard, workspace/backup, sales PDFs, pairing and revocation. Browser test redirected a worker's Contacts URL to the shop and verified that revocation removed access. Tests cover forged, expired and cross-account credentials and one-use pairing codes. |
| Printing | Worker PDF downloaded through the browser. Both Letter pages were rendered and visually inspected: standard and T-post cutting lists fit with checkboxes and machining data. Server tests validate protected PDF endpoints. |
| Settings/navigation | Browser verified Home entry points, quote and cut-sheet paths, company settings persistence, larger text, and shop-device management. |
| Accessibility checks | Keyboard Space checkoff and focus retention verified; accessible names/statuses inspected; +2 pt owner settings had no page overflow at the tested 1280px viewport. No screen-reader or physical iPad testing was performed. |
| Browser errors | No error/warning console entries were reported in the tested owner and worker tabs. |

## Remaining launch checks / operational limits

1. Connect the physical shop iPad in Safari and complete one real-device checkoff/refresh test. Desktop browser testing does not establish physical iPad behavior. The iPad should be paired using a worker code, not signed in with the owner's password.
2. Email delivery remains unconfigured. Existing owner email/password login and worker pairing work without SMTP. Forgotten-password email requires a sender; until then, an administrator must reset the account through Supabase. Supabase's default service only emails project-team addresses: https://supabase.com/docs/guides/auth/auth-smtp.
3. Complete the business address, phone, and terms in Settings before issuing client-facing order PDFs. Those values are not invented by the app.
4. Company backups are manual. Download a company backup into a private backed-up location regularly. Restoration and device-exclusion behavior are covered by tests, but this is not an automatic backup schedule.
5. The shop requires an internet connection to save checkoffs. Connection failures report that saving could not be confirmed; they do not claim an offline save succeeded.
6. Manufacturing reference tests cover the supported workbook examples. Physical fabrication, printer output, every possible measurement combination, and specialty products are outside this audit. Keep the existing workbook warnings for light gaps and stock/insert verification.

## Owner-to-iPad setup

1. On the owner's computer: Settings → Shop devices → Manage shop access → Connect shop iPad.
2. Name the device, such as “Shop iPad,” and generate a one-time connection code. The code expires in ten minutes.
3. On the iPad, open https://cutsheetsoftware.netlify.app/shop.html in Safari. Enter that code and select Connect iPad.
4. Open a released job. Workers can record cuts, partial quantities, material requests, timers, and finishing checks. Customer records, pricing, and payment details stay in the owner workspace.
5. To remove a device, select Disconnect under Shop devices. The old connection immediately loses API access and needs a new code to reconnect.

This audit records the checks performed and issues repaired. It does not claim exhaustive button/state coverage or zero bugs.
