# Apple Cold Start Gate D Plan Bundle

**Status:** Implementation-ready plan; code not started  
**Branch:** `design/cold-start-apple-reader`  
**Gate:** Signed Snapshot Validator → GBrain Adapter → Gate D, fictional data only

Read these documents in order:

1. [`2026-08-18-apple-cold-start-gate-d-review-addendum.md`](./2026-08-18-apple-cold-start-gate-d-review-addendum.md) — highest-precedence trust, approval, graph-extraction, and type corrections from final review.
2. [`2026-08-18-apple-cold-start-gate-d-contract.md`](./2026-08-18-apple-cold-start-gate-d-contract.md) — normative validator handoff, GBrain trust, verification, source, staging, mapping, apply, cleanup, and Gate D contract.
3. [`2026-08-18-apple-cold-start-gate-d-scaffolding.md`](./2026-08-18-apple-cold-start-gate-d-scaffolding.md) — exact two-repository file map, schemas, CLI surface, scripts, tests, CI boundaries, and qualification artifacts.
4. [`2026-08-18-apple-cold-start-gate-d.md`](./2026-08-18-apple-cold-start-gate-d.md) — 20 sequential TDD tasks and execution commands.
5. [`../specs/2026-08-18-cold-start-apple-reader-design.md`](../specs/2026-08-18-cold-start-apple-reader-design.md) — approved parent architecture.
6. Contacts and Calendar plan bundles — prerequisite collector and validator contracts whose Gate B/Gate C artifacts are consumed here.

## Precedence

When wording differs:

```text
Gate D final-review addendum
  > Gate D normative contract
  > Gate D scaffolding appendix
  > Gate D primary task plan
  > illustrative snippets
```

The executor must not make a local substitution for a locked trust, permission, signature, verification, identity, review, apply, source, or cleanup decision.

## What this stage builds

### Validator side

- visible LocalAuthentication-gated validator enrollment export;
- signed validation handoff bound to an exact V2 receipt and collector snapshot;
- visible plain-text GBrain plan review;
- LocalAuthentication-gated, validator-signed stage approval;
- retained Contacts and Calendar validation regression.

### GBrain side

- local-only `gbrain apple-cold-start` CLI group;
- independent validator app enrollment and code reinspection;
- handoff and exact snapshot byte verification before parsing;
- strict schema-locked Contacts and Calendar decoders;
- one private non-federated `apple-cold-start` source repo;
- deterministic people/company/calendar Markdown and raw evidence;
- conservative identity reconciliation and managed-block preservation;
- validator-signed human approval;
- fast-forward-only, resumable source apply and sync;
- receipts, status, retention, and constrained cleanup.

## Task sequence

1. Prove Gate B/Gate C preconditions and create two isolated workspaces.
2. Define validator enrollment protocol and golden vectors.
3. Implement visible authenticated validator enrollment export.
4. Define validation handoff and receipt binding.
5. Export handoffs only from completed in-session validations.
6. Add validator stage-review approval, requalify validator, and lock collectors commit.
7. Scaffold GBrain command, private state, inboxes, and source initialization.
8. Add safe files, P-256 verification, and app code reinspection.
9. Enroll validator trust into GBrain.
10. Verify handoff and every fixed snapshot byte before parsing.
11. Vendor and enforce exact collector schemas and strict wire decoders.
12. Preserve raw evidence and implement injection-safe managed Markdown.
13. Map/reconcile Contacts.
14. Map/reconcile Calendar, attendee links, and person back-links.
15. Build deterministic Git worktree staging and review bundle.
16. Render owner review evidence and required samples.
17. Import and verify validator-signed LocalAuthentication approval.
18. Fast-forward apply, source-aware graph extraction, sync, and resume.
19. Add status, retention, and constrained cleanup.
20. Run final signed-validator and fictional Gate D qualification.

## Core locks

- GBrain receives no Apple grants.
- GBrain does not own collector trust or private signing keys.
- The validator is re-inspected on every verification and approval.
- No record is decoded before signed handoff and exact byte verification.
- No LLM runs in Gate D core.
- One source repo keeps Contacts, Calendar, links, and back-links atomic.
- The source remains non-federated and has no remote.
- Source deletions are not propagated.
- Human approval is validator-signed after fresh LocalAuthentication, not a TTY or `--yes` gate.
- Apply is fast-forward-only and resumable.
- Mail feasibility remains the next plan after Gate D.

## Hard stop

This bundle does not authorize real Contacts or Calendar data, Mail, Messages, live sync, source federation, automated collection, background approval, or semantic LLM enrichment. Gate D PASS applies only to the exact validator build, GBrain commit, collector schema-lock commit, retained fictional snapshots, local source format, macOS build, and evidence recorded in the final report.