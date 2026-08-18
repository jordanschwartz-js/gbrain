# Calendar Collector Implementation Plan Bundle

**Status:** Implementation-ready plan; code not started  
**Branch:** `design/cold-start-apple-reader`  
**Gate:** Calendar Gate C, fictional-data qualification only

Read these documents in order:

1. [`2026-08-18-calendar-collector-review-addendum.md`](./2026-08-18-calendar-collector-review-addendum.md) — highest-precedence corrections from final evidence/type review.
2. [`2026-08-18-calendar-collector-contract.md`](./2026-08-18-calendar-collector-contract.md) — normative types, EventKit lifecycle, identity, snapshot, validator, and Gate C contract.
3. [`2026-08-18-calendar-collector-scaffolding.md`](./2026-08-18-calendar-collector-scaffolding.md) — exact package manifests, Xcode targets, entitlements, schemas, scripts, CI, fixtures, and qualification artifacts.
4. [`2026-08-18-calendar-collector.md`](./2026-08-18-calendar-collector.md) — 18 sequential TDD implementation tasks and execution commands.
5. [`../specs/2026-08-18-cold-start-apple-reader-design.md`](../specs/2026-08-18-cold-start-apple-reader-design.md) — approved parent architecture.

## Precedence

When wording differs:

```text
review addendum
  > normative Calendar contract
  > Calendar scaffolding appendix
  > primary task plan
  > illustrative snippets
```

The executor must not make a local substitution for a locked decision. Any change to permission identity, LocalAuthentication, signing, event identity, snapshot trust, validator order, Contacts non-regression, or fictional-only Gate C requires design review.

## Scope

This bundle adds a separate Calendar Collector only after Contacts Gate B. It does not modify or re-sign the qualified Contacts Collector. It extends the visible validator with separate Calendar trust and requires retained Contacts-snapshot regression.

The implementation preserves:

- honest macOS full-access disclosure;
- no EventKit mutation path;
- explicit 90-day maximum and user narrowing;
- contiguous 31-day UTC segments;
- source-store change detection;
- local all-day date semantics;
- complete public recurrence selectors;
- recurring occurrence and detached-instance identity;
- source-account-fenced reconciliation;
- separate Calendar Secure Enclave key;
- signed Calendar snapshots;
- validation before record decoding;
- exact entitlements and no network/Apple Events;
- fictional-only final signed-build Gate C.

## Task sequence

1. Isolated branch and Xcode project extension.
2. Strict Calendar request and frozen scope.
3. Calendar manifest, receipt, coverage, and file set.
4. UTC segmentation, inclusion, and conflict-aware deduplication.
5. Occurrence-aware identity and reconciliation.
6. Full-access authorization, catalog, and EventKit actor.
7. Complete immutable event mapping.
8. Record limits, ordering, and partial outcomes.
9. Calendar-specific security-scoped snapshot root.
10. Visible full-access and scope-review workflow.
11. Fresh device-owner authentication and separate signing key.
12. Atomic signed Calendar snapshots.
13. Multi-domain validator trust migration and Calendar enrollment.
14. Calendar verification before event decoding.
15. Full UI/seam tests through a separate test host.
16. Forbidden API, entitlement, and Release-build enforcement.
17. Fictional fixtures, source comparator, CI, docs, and attribution.
18. Final signed-build Gate C qualification.

## Hard stop

This plan does not authorize real Calendar data, Calendar-to-GBrain normalization, live sync, Contacts changes, Mail, or Messages. A Gate C PASS applies only to the exact recorded Calendar Collector build, validator build, signing identities, macOS build, fictional fixture set, and qualification evidence.