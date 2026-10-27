# Production overlap and digital cut-sheet update — October 27, 2026

When workers begin capping before every cut is finished, the job can advance to Capping. Earlier unfinished work remains visible in amber on the production board, in the job list, and in the stage strip. These cards open the same job; no duplicate job or quantities are created. Stage filters also find unfinished work in earlier columns.

- Partial cutting displays the remaining piece count. Out-of-material requests remain open and the cutting timer stays paused when workers record finishing work.
- Finishing checks can overlap. For example, partial Capping stays visible when Boring begins. Completed steps display checkmarks based on their actual checkoffs, rather than their position before the current stage.
- Completed openings do not advance untouched openings. A job reaches Complete only when all pieces and all finishing checks across every opening are complete. Corrections preserve other recorded work and reopen the appropriate unfinished stage.
- Partial cut rows and partial finishing checks use amber; fully cut rows retain green.
- Opening measurements and the shutter preview stay visible. A compact identity row and three-column specifications leave more drawing space. Wide T-post drawings use the full row at narrow viewport sizes.
- Regular and flat stile rows repeat the yellow whole-distance drilling reminder, using the same value as the opening heading and the selected display units. Cutting calculations are unchanged.

## Verification

- Build: 149 tests pass. New service-level regressions cover a material shortage followed by Capping, concurrent finishing, reload persistence, corrections, independent openings, and completion of all work.
- Browser using disposable local sample data: recorded 20 of 60 louvers cut with a material request, then partial louver capping. After refresh, Capping remained current, Cutting showed 153 pieces left for the complete two-opening job, and the shortage and paused timer persisted.
- Board showed the same sample job in amber under Cutting and normally under Capping. List view retained the remaining-cut badge, and the Cutting filter still found that job.
- Earlier layout checks covered a 150-inch, four-post/five-section shutter, plus 820px and 390px viewports without document overflow. No physical iPad was available.
- No live customer records, payments, or production checkmarks were changed for testing. No authentication or database-schema change is needed for this release.
