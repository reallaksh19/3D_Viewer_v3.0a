# Support Load Track Certification

This document records the support-load workflow boundary now that the input, review, calculation, reporting, export, overlay, and profile registry stages are present.

## Certified source-of-truth split

Input data belongs only in:

```text
pipe.attributes.supportLoadInput
```

Calculated support-load results belong only in:

```text
calculatedFields.supportLoads
calculatedFields.supportLoadReference
```

Report, package, overlay, stagedJSON, and QA modules may consume those fields, but must not create or repair missing input fields.

## Required execution order

1. Geometry snapshot and mapping.
2. XML/CII/project enrichment.
3. Support-load master data review.
4. Pipe-level input hydration.
5. AutoSpan and DEPSpan resolution.
6. Conflict review.
7. Manual input override, where required.
8. Input lock.
9. Formula calculation.
10. Result writeback audit.
11. Report, stagedJSON, bulk package, QA, and canvas overlay.

## Guardrails

- No master lookup inside the formula engine.
- No missing-data top-up inside report/export/overlay modules.
- No mutation of `pipe.attributes.supportLoadInput` after calculation starts.
- Formula writeback is restricted to calculated fields.
- Advanced profile registry keeps unsupported future profiles disabled until the required project/imported data exists.
- RVM support-runtime cleanup and non-primitive overlay work are separate tracks and are not part of this certification.

## Current certified support-load modules

- Master data manager: `support-load-master-data/v1`
- Pipe-level input hydrator: `support-load-input/v1`
- Input review/lock gate: `support-load-input-review/v1`
- Input override editor: `support-load-input-override/v1`
- AutoSpan resolver: `support-load-autospan-resolver/v1`
- Enrichment conflict resolver: `support-load-enrichment-conflict/v1`
- Formula engine: `support-load-formula-results/v1`
- Result writeback audit: `support-load-result-writeback-audit/v1`
- Report exporter: `support-load-report/v1`
- Bulk package exporter: `support-load-bulk-package/v1`
- QA dashboard: `support-load-qa-dashboard/v1`
- Canvas overlay: `support-load-canvas-overlay/v1`
- Advanced profile registry: `support-load-advanced-profile/v1`

## Certification intent

The certification test should fail if a future change weakens the source-of-truth split, removes the no-top-up policy, removes the locked-input gate, or routes support-load calculations through non-support-load RVM support/runtime modules.
