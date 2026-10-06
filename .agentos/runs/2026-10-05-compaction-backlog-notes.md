# Compaction backlog notes, closed 2026-10-05

These four paragraphs were open items in `.agentos/tasks.md` until the compaction-limits docs slice. They are copied here verbatim before being removed from the backlog, so nothing is lost. They are history, not instructions.

## Status of each, checked against the 0.9.0 build on 2026-10-05

1. **`refilterCarriedBlock` and fenced samples.** No longer true. A fenced sample that quotes the generated heading comes through byte-intact, and `test/compact-preservation.test.js` ("a fenced sample quoting the generated heading is left byte-identical by re-filtering") pins it. `docs/compaction.md` says so (re-filtering is fence-aware).
2. **Ride-along archiving.** A deliberate rule, documented in `docs/compaction.md` and pinned by `test/compact-rewrite-nested-history.test.js` ("a deeper block inside an archived block goes with it, and unresolved work anywhere stops it").
3. **Slice C carry-rule limits.** Documented in `docs/compaction.md`. The subject-before-modal window is seven subject words (the first word plus up to six more), not six, and it only decides lines with no terminal punctuation; the long-subject example is carried by the uncertain-obligation tier, not left in the archive. Pinned by `test/compact-rewrite-carry-fragments.test.js`, including a boundary test that fails when the window is moved by one word in either direction (checked by mutating the regex). The reported-speech false positive is pinned by the same file.
4. **The repeat-run doc nit.** The sentence it described is not in `docs/compaction.md`; the misleading example lived in a source comment in `src/compact-rewrite.ts`, which was tightened (comment only).

## Claims in the original paragraphs that could not be confirmed

- "Byte-identical to the shipped 0.5.1 build" and "not a regression": not established from the current code; the behavior they describe no longer reproduces.
- "412 adversarial unchecked-task cases, 0 leaks" and "widening the window ... 3 more constructed obligations": no committed test or measurement backs these numbers.
- "Independent review accepted this" and "the reviewer supplied exact tightening text": only the backlog's word; the text is not in the repository.
- "Harmless in a heuristic safety net" (reported-speech over-carry): not established; `test/compact-preservation.test.js` pins that output grows.

## The original paragraphs, verbatim

- [ ] **Follow-up, pre-existing and not a regression:** `refilterCarriedBlock` is line-based, so a fenced code sample inside `## Preserved context` that quotes `### Constraints carried forward from archived history` loses its heading and its bullet. Byte-identical to the shipped 0.5.1 build, recoverable from the run archive, and now documented as a known limit in `docs/compaction.md`.

- [ ] **Recorded decision (considered, rejected, not a defect):** archiving a block archives whatever is nested inside it — ride-along — mirroring the shipped level-2 rule. Per-descendant `## History` entries were considered and rejected: they would either bloat History with an entry per nested heading or block archival whenever a history block contains subheadings. Independent review accepted this after failing to construct material harm (412 adversarial unchecked-task cases, 0 leaks).

- [ ] **Documented limits of the slice C carry rule** (all deliberate, all pinned by tests in `test/compact-rewrite-carry-fragments.test.js`, all stated in `docs/compaction.md`): a line that opens on a code span reads as a continuation of the previous line; a line ending on a conjunction reads as truncated; the subject-before-modal window is six words, so `Accounts, locations and trips in the production database must not be modified without approval` (modal at token 9) stays in the archive. Widening the window past six words was measured to buy 3 more constructed obligations at the cost of admitting narrative, and the accepted false-positive class is a line that opens as an obligation and then continues as reported speech (`Guards must not be relied on here, the ticket explained …`) — carried, and harmless in a heuristic safety net.

- [ ] Non-blocking doc nit from review: in the repeat-run sentence, the example "a deeper block above a later sibling" is attached to the "shallowest nested block is not itself archivable" condition, though in that shape the shallowest block *is* archivable and the later-pass archival is covered by the lead clause. Every asserted behaviour is true; the reviewer supplied exact tightening text if the sentence is touched again.
