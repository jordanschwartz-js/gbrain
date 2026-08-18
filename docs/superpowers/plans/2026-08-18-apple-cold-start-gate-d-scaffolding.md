# Apple Cold Start Gate D Scaffolding and Schema Appendix

**Plan:** `docs/superpowers/plans/2026-08-18-apple-cold-start-gate-d.md`  
**Contract:** `docs/superpowers/plans/2026-08-18-apple-cold-start-gate-d-contract.md`  
**Spec:** `docs/superpowers/specs/2026-08-18-cold-start-apple-reader-design.md`  
**Status:** Required execution appendix

This appendix fixes the repository deltas, file responsibilities, schema inventory, CLI surface, test layout, scripts, CI gates, and qualification artifacts for Gate D. The implementation touches both the collectors repository and GBrain, but every task and commit belongs to exactly one repository unless the task explicitly contains a paired cross-language vector commit.

## 1. Collectors repository delta

Add or modify these paths in `jordanschwartz-js/cold-start-apple-collectors` after Gate C:

```text
Packages/SnapshotValidatorKit/
├── Sources/SnapshotValidatorKit/
│   ├── ValidatorEnrollmentDocumentV1.swift
│   ├── ValidationHandoffV1.swift
│   ├── ValidatorEnrollmentFileSet.swift
│   ├── ValidationHandoffFileSet.swift
│   └── GateDCanonicalVectors.swift
└── Tests/SnapshotValidatorKitTests/
    ├── ValidatorEnrollmentDocumentTests.swift
    ├── ValidationHandoffTests.swift
    └── GateDCrossLanguageVectorTests.swift

Apps/SnapshotValidator/
├── Models/SnapshotValidatorModel.swift                 modify
├── Services/
│   ├── ValidatorEnrollmentExportService.swift          create
│   ├── ValidationHandoffExportService.swift            create
│   ├── ValidatorExportRootService.swift                create
│   ├── ValidatorCodeIdentityInspector.swift            modify
│   ├── ValidatorReceiptSigner.swift                    reuse/modify
│   └── SnapshotValidationService.swift                 modify
├── Views/
│   ├── ValidatorHomeView.swift                         modify
│   ├── ValidatorEnrollmentExportView.swift             create
│   ├── ValidationHandoffExportView.swift               create
│   └── ValidationResultView.swift                      modify
└── Resources/
    └── SnapshotValidator.entitlements                  modify

Schemas/
├── validator-enrollment-v1.schema.json                 create
├── validation-handoff-v1.schema.json                   create
├── validation-receipt-v2.schema.json                   retain
└── code-identity-claim-v1.schema.json                  create

Fixtures/GateD/
├── Crypto/
│   ├── validator-public-key-x963.bin
│   ├── validator-enrollment.json
│   ├── validator-enrollment.sig
│   ├── validation-receipt-v2.json
│   ├── validation-receipt-v2.sig
│   ├── validation-handoff.json
│   ├── validation-handoff.sig
│   └── vector-digests.json
└── Filesystem/
    ├── valid-enrollment/
    ├── valid-handoff/
    ├── wrong-key-handoff/
    └── tampered-handoff/

Tests/SnapshotValidatorTests/GateD/
├── ValidatorEnrollmentExportTests.swift
├── ValidationHandoffExportTests.swift
├── ValidatorExportRootTests.swift
├── ContactsRegressionAfterGateDTests.swift
└── CalendarRegressionAfterGateDTests.swift

Qualification/GateDValidator/
├── README.md
├── checklist.md
├── report-template.md
└── retained-regression-register.md

script/
├── verify_gate_d_validator_release.sh                  create
├── verify_gate_d_validator_nonregression.sh            create
└── scan_gate_d_validator_boundary.sh                   create

README.md                                               modify
SECURITY.md                                             modify
NOTICE                                                  modify when adapted code changes
UPSTREAM.md                                             modify when adapted code changes
project.yml                                             modify only for validator dependencies/tests
```

Do not modify:

```text
Apps/ContactsCollector/**
Apps/ContactsCollectorTestHost/**
Apps/CalendarCollector/**
Apps/CalendarCollectorTestHost/**
Contacts or Calendar collector entitlements
Contacts or Calendar collector Keychain constants
Contacts or Calendar wire-schema meanings
```

## 2. Validator entitlement file

`Apps/SnapshotValidator/Resources/SnapshotValidator.entitlements` becomes exactly:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.app-sandbox</key>
    <true/>
    <key>com.apple.security.files.user-selected.read-write</key>
    <true/>
</dict>
</plist>
```

The release inspection script rejects every other entitlement key.

## 3. Validator visible state additions

Extend the validator model with these explicit stages:

```swift
public enum GateDExportStage: Equatable, Sendable {
    case idle
    case authenticatingEnrollment
    case choosingEnrollmentRoot
    case exportingEnrollment
    case enrollmentExported(URL)
    case choosingHandoffRoot(ValidatedCollectorDomain, String)
    case exportingHandoff(ValidatedCollectorDomain, String)
    case handoffExported(URL)
    case failed(String)
}
```

The model exposes actions only when their prerequisites exist:

```swift
@MainActor
func exportValidatorEnrollment() async

@MainActor
func exportValidationHandoff(
    validatedSnapshot: ValidatedSnapshotResult
) async
```

`exportValidationHandoff` receives only an already completed in-memory validation result from `SnapshotValidationService`; it cannot accept arbitrary manifest or receipt fields from UI text.

## 4. Validator schema requirements

Every Gate D schema uses JSON Schema Draft 2020-12 and `additionalProperties: false` recursively.

### 4.1 Validator enrollment

Required exact fields:

```text
schemaVersion
codeIdentityAlgorithm
publicKeyX963Base64
keyFingerprint
codeIdentity
validatorVersion
signatureAlgorithm
issuedAt
```

Constraints:

- schema version `1`;
- algorithms equal contract constants;
- Base64 decodes to exactly 65 bytes beginning with `0x04`;
- fingerprints and hashes are lowercase 64-character hexadecimal;
- timestamps are UTC RFC 3339 with milliseconds.

### 4.2 Validation handoff

Required exact fields are the `ValidationHandoffV1` contract fields. `contentFiles` uses the existing fixed `SnapshotContentFile` shape and must be nonempty, uniquely named, and sorted.

### 4.3 Code identity claim

The schema requires exactly:

```text
bundleIdentifier
teamIdentifier
designatedRequirement
cdHash
executableSha256
marketingVersion
buildNumber
entitlementsSha256
```

No absolute app path is signed by the validator. GBrain stores its independently enrolled app path privately.

## 5. GBrain repository delta

Add these paths to `jordanschwartz-js/gbrain` on a fresh feature branch from then-current `master` after Gate C:

```text
src/commands/
└── apple-cold-start.ts

src/core/apple-cold-start/
├── constants.ts
├── errors.ts
├── types.ts
├── paths.ts
├── safe-files.ts
├── canonical-json.ts
├── p256.ts
├── macos-code-identity.ts
├── validator-enrollment.ts
├── validator-trust-store.ts
├── validation-handoff.ts
├── snapshot-verifier.ts
├── schema-lock.ts
├── strict-json.ts
├── ndjson.ts
├── state-store.ts
├── source-repo.ts
├── git-worktree.ts
├── managed-blocks.ts
├── markdown-escaping.ts
├── markdown-renderer.ts
├── contact-wire.ts
├── contact-reconciler.ts
├── contact-mapper.ts
├── calendar-wire.ts
├── calendar-reconciler.ts
├── calendar-mapper.ts
├── attendee-linker.ts
├── raw-evidence.ts
├── stage-plan.ts
├── stage-runner.ts
├── review.ts
├── approval.ts
├── apply.ts
├── status.ts
├── cleanup.ts
└── locks.ts

schemas/apple-cold-start/
├── validator-trust-v1.schema.json
├── verified-snapshot-v1.schema.json
├── stage-plan-v1.schema.json
├── approval-v1.schema.json
├── apply-receipt-v1.schema.json
├── cleanup-receipt-v1.schema.json
├── contacts-identity-v1.schema.json
├── calendar-identity-v1.schema.json
├── import-ledger-v1.schema.json
├── collectors-schema-lock-v1.schema.json
└── collectors/<COLLECTORS_GATE_C_COMMIT>/
    ├── contacts-record-v1.schema.json
    ├── contacts-snapshot-manifest-v2.schema.json
    ├── contacts-public-receipt-v1.schema.json
    ├── calendar-catalog-v1.schema.json
    ├── calendar-event-v1.schema.json
    ├── calendar-snapshot-manifest-v2.schema.json
    ├── calendar-public-receipt-v1.schema.json
    ├── validation-receipt-v2.schema.json
    ├── validator-enrollment-v1.schema.json
    ├── validation-handoff-v1.schema.json
    └── code-identity-claim-v1.schema.json

fixtures/apple-cold-start/
├── gate-b/
├── gate-c/
├── gate-d-handoffs/
├── adversarial-content/
├── reconciliation/
├── managed-markdown/
├── staging/
└── crypto/

scripts/
├── import-apple-collector-schemas.ts
├── check-apple-schema-lock.ts
├── check-apple-cold-start-boundary.sh
├── qualify-apple-cold-start-gate-d.sh
└── verify-apple-cold-start-test-fixtures.ts

test/
├── apple-cold-start-cli.test.ts
├── apple-cold-start-safe-files.test.ts
├── apple-cold-start-p256.test.ts
├── apple-cold-start-code-identity.test.ts
├── apple-cold-start-trust.test.ts
├── apple-cold-start-handoff.test.ts
├── apple-cold-start-snapshot-verifier.test.ts
├── apple-cold-start-strict-wire.test.ts
├── apple-cold-start-contact-reconcile.test.ts
├── apple-cold-start-calendar-reconcile.test.ts
├── apple-cold-start-markdown-escaping.test.ts
├── apple-cold-start-managed-blocks.test.ts
├── apple-cold-start-contact-mapper.test.ts
├── apple-cold-start-calendar-mapper.test.ts
├── apple-cold-start-stage.test.ts
├── apple-cold-start-approval.test.ts
├── apple-cold-start-apply.test.ts
├── apple-cold-start-cleanup.test.ts
└── apple-cold-start-gate-d-e2e.test.ts

Qualification/AppleColdStartGateD/
├── README.md
├── precondition-register.md
├── fixture-register.md
├── checklist.md
├── report-template.md
└── source-expected/

src/cli.ts                                               modify
src/core/db-lock.ts                                      modify
package.json                                             modify scripts only
README.md                                                modify
SECURITY.md                                              modify
CHANGELOG.md                                             modify
```

No database migration is added. Gate D uses existing `sources`, pages, ingest logs, and advisory-lock infrastructure plus owner-only local state files.

## 6. CLI registration

Add `apple-cold-start` to `CLI_ONLY` in `src/cli.ts` and dispatch:

```ts
case 'apple-cold-start': {
  const { runAppleColdStart } = await import('./commands/apple-cold-start.ts');
  await runAppleColdStart(engine, args);
  break;
}
```

Add help text under a new local-only section:

```text
APPLE COLD START (local macOS, no MCP surface)
  apple-cold-start trust enroll-validator ...
  apple-cold-start trust status
  apple-cold-start source init
  apple-cold-start verify ...
  apple-cold-start stage --verification <id>
  apple-cold-start review <plan-id>
  apple-cold-start approve <plan-id>
  apple-cold-start apply <plan-id>
  apple-cold-start status [id]
  apple-cold-start retain <verification-id>
  apple-cold-start cleanup ...
```

Do not add an operation definition, tool schema, MCP method, HTTP route, or jobs handler.

## 7. Exact command grammar

```text
gbrain apple-cold-start trust enroll-validator
  --app <absolute-path>
  --enrollment <absolute-directory>
  [--json]

gbrain apple-cold-start trust status [--json]

gbrain apple-cold-start source init
  [--path <absolute-path>]
  [--json]

gbrain apple-cold-start verify
  --snapshot <absolute-directory>
  --handoff <absolute-directory>
  --request <absolute-file>
  [--json]

gbrain apple-cold-start stage
  --verification <verification-id>
  [--json]

gbrain apple-cold-start review <plan-id>
  [--json]
  [--diff]

gbrain apple-cold-start approve <plan-id>

gbrain apple-cold-start apply <plan-id>
  [--json]

gbrain apple-cold-start status [<id>]
  [--json]

gbrain apple-cold-start retain <verification-id>
  [--json]

gbrain apple-cold-start cleanup [<verification-id>]
  [--older-than <Nd>]
  [--dry-run]
  [--confirm]
  [--json]
```

Parsing rejects unknown flags, duplicate singleton flags, missing values, relative paths, malformed IDs, unsupported combinations, and extra positionals.

`approve` is deliberately TTY-only and has no JSON mode because approval is a human act, not an agent protocol.

## 8. GBrain package scripts

Add:

```json
{
  "test:apple-cold-start": "bun test test/apple-cold-start-*.test.ts",
  "check:apple-cold-start": "bun run scripts/check-apple-schema-lock.ts && bash scripts/check-apple-cold-start-boundary.sh",
  "qualify:apple-cold-start:gate-d": "bash scripts/qualify-apple-cold-start-gate-d.sh"
}
```

Extend `verify` or `check:all` to include `check:apple-cold-start` once the implementation exists. Gate D qualification is not part of ordinary CI because it requires final signed macOS apps and retained fictional snapshots.

## 9. GBrain state schemas

All schemas use Draft 2020-12, `additionalProperties:false`, strict enums, lowercase hex patterns, UUID formats, absolute-path patterns where private paths are allowed, and no floating-point values in hash-bound state.

### 9.1 Trust

`validator-trust-v1.schema.json` matches `ValidatorTrustRecordV1` exactly.

### 9.2 Verified snapshot

`verified-snapshot-v1.schema.json` requires the full contract type and `domain` in `contacts|calendar`.

### 9.3 Plan and approval

`stage-plan-v1.schema.json` forbids delete mutations. `approval-v1.schema.json` requires exact plan/base/staged digests and one owner approval timestamp.

### 9.4 Apply and cleanup

Receipts use stable status enums from the contract. Cleanup receipt lists only deleted protocol directories by verification ID and digest, never arbitrary paths in public output.

### 9.5 Identity maps

Contacts and Calendar identity schemas require deterministic sorting, unique durable IDs/slugs, and exact version `1`. They permit source locators because the files are hidden private state in the local source repo.

## 10. Collector-schema import script

`scripts/import-apple-collector-schemas.ts` accepts:

```text
--collectors-repo <absolute local checkout>
--commit <40-character SHA>
```

It:

1. requires the checkout HEAD or requested Git object to contain the approved Gate C commit;
2. reads only the exact schema allowlist;
3. copies bytes without reformatting;
4. records SHA-256 and length;
5. writes `collectors-schema-lock-v1.json` with sorted entries;
6. refuses dirty source schema files, missing files, unknown extras, or a non-40-character commit;
7. never fetches a network remote.

The lock and vendored schema files are committed together.

## 11. Safe-files implementation boundaries

`safe-files.ts` is Darwin-only in production. It may import:

```text
fs
path
os
crypto
```

It may not import child processes, network, database, Markdown, collector wire types, or model SDKs.

Required fixed limits:

```text
validator trust file              1 MiB
validator enrollment JSON         1 MiB
validator enrollment signature  256 bytes
validation handoff JSON           1 MiB
validation handoff signature    256 bytes
validation receipt JSON           1 MiB
validation receipt signature    256 bytes
collector private manifest        1 MiB
collector public receipt          1 MiB
Contacts records                256 MiB
Calendar catalog                  4 MiB
Calendar events                 256 MiB
collector errors                  4 MiB
hash list                         1 MiB
collector signature             256 bytes
COMPLETE                          65 bytes
stage plan                        8 MiB
approval                          1 MiB
apply receipt                     1 MiB
identity map                     64 MiB per domain
```

Tests cover empty files, exact maximums, one-byte oversize, race replacement, content mutation during second pass, unsupported `O_NOFOLLOW`, and descriptor cleanup.

## 12. Code-identity test seam

Production `MacCodeIdentityInspector` executes only absolute paths and accepts no caller-provided executable name. Tests inject a `ProcessExecuting` protocol into the module constructor; production code constructs the absolute executor directly and has no environment-variable switch.

Fixture outputs include:

- valid Apple Development app;
- changed CDHash;
- changed executable hash;
- changed entitlements;
- invalid signature;
- missing Team ID;
- malformed designated requirement.

No private real certificate or app path is committed.

## 13. Cross-language crypto vectors

The collectors repository generates the canonical enrollment, V2 receipt, and handoff fixtures with a test-only software P-256 key. GBrain verifies those exact bytes and signatures.

GBrain also checks a separately generated invalid vector for:

- flipped JSON byte;
- high-bit signature corruption;
- wrong X coordinate;
- truncated DER;
- raw IEEE-P1363 signature supplied where DER is required.

Both repositories record the vector file hashes. Production keys remain Secure Enclave-only.

## 14. Source repository initialization files

`source init` writes exact LF-normalized files.

`.gbrain-source`:

```text
apple-cold-start
```

`.gitattributes`:

```gitattributes
*.md text eol=lf
*.json text eol=lf
*.ndjson text eol=lf
*.sha256 text eol=lf
```

`README.md` begins:

```markdown
# Apple Cold Start Source

Local, non-federated GBrain source generated only from validated Apple cold-start snapshots. Hidden `.raw` and `.apple-state` directories are private provenance and identity state and are not indexed by GBrain.
```

Initial Git identity is repository-local:

```text
user.name = GBrain Apple Cold Start
user.email = noreply@local
```

The source has no remote and no auto-push behavior.

## 15. Managed Markdown parser tests

Golden fixtures cover:

```text
new generated page
existing owner content before managed block
existing owner content after managed block
managed truth plus managed timeline blocks
missing end marker
duplicate start marker
nested markers
changed generated block hash
unmanaged slug collision
timeline sentinel inside source text
HTML comment inside source text
```

The merger never normalizes owner text outside managed ranges.

## 16. Gate D source-page schemas

Generated Markdown is validated by the existing GBrain parser and additional Gate D checks.

Required frontmatter by page family:

### Person/company

```text
type
title
slug
tags
source_kind
source_manifest_sha256
source_record_id
source_content_hash
identity_map_version
```

### Calendar day/month/log

```text
type
title
slug
tags
source_kind
source_manifest_sha256
calendar_window_start
calendar_window_end
identity_map_version
```

### Import page

```text
type: source
title
slug
source_kind
source_manifest_sha256
validator_key_fingerprint
collector_key_fingerprint
collector_schema_commit
adapter_version
```

Private absolute paths and trust records never enter frontmatter.

## 17. Apply lock

Add a dedicated advisory lock constant to `src/core/db-lock.ts`:

```ts
export const APPLE_COLD_START_APPLY_LOCK_ID = 0x4150504c;
```

The value is stable and documented. The filesystem lock is:

```text
~/.gbrain/apple-cold-start/locks/apply.lock
```

It is created with `O_CREAT | O_EXCL | O_NOFOLLOW`, mode `0600`, and contains PID, process-start time, plan ID, and creation time. A stale lock is not deleted automatically; `status` reports the evidence and the owner resolves it manually.

## 18. Git worktree rules

Staging worktrees live only under the private run directory. Before creation:

- source repo `main` is clean;
- no remote exists;
- no branch named `apple-stage/<plan-id>` exists unless it points to the exact expected staged commit;
- run path is owner-only and not a symlink.

Staging never uses `git add -A` across unknown paths. It stages only exact mutation and hidden-evidence paths recorded by the plan builder.

Apply uses `git merge --ff-only <staged-commit>` from source `main`. It never invokes `reset --hard`, `clean`, rebase, cherry-pick, force update, or remote operations.

## 19. CI boundary scanner

`scripts/check-apple-cold-start-boundary.sh` fails if production Gate D roots import or reference:

```text
@anthropic-ai/sdk
openai
Minion
MCP
express
fetch(
URLSession
osascript
AppleScript
CNContactStore
EventKit
EKEventStore
Contacts.framework
LocalAuthentication
security-scoped bookmark creation
child_process.exec(
child_process.execSync(
spawn with shell:true
```

Allowed child-process usage is a fixed allowlist for:

```text
/usr/bin/codesign
/usr/bin/plutil
/usr/bin/git
```

The scanner also verifies `apple-cold-start` is absent from the operations registry, MCP tools JSON, HTTP routes, jobs handlers, and Minions catalog.

## 20. Qualification artifact layout

Private evidence lives outside Git and sync. The checked-in report template references hashes only.

```text
Qualification/AppleColdStartGateD/
├── README.md
├── precondition-register.md
├── fixture-register.md
├── checklist.md
├── report-template.md
└── source-expected/
    ├── contacts-tree.txt
    ├── calendar-tree.txt
    ├── expected-links.json
    └── expected-timeline.json
```

Ignored private evidence:

```gitignore
Qualification/AppleColdStartGateD/private-evidence/
Qualification/AppleColdStartGateD/*.local.env
Qualification/AppleColdStartGateD/gate-d-report-draft-*.md
.gbrain-test-homes/
```

## 21. Gate D qualification script

`scripts/qualify-apple-cold-start-gate-d.sh` requires:

```text
GATE_D_VALIDATOR_APP
GATE_D_VALIDATOR_ENROLLMENT
GATE_B_SNAPSHOT
GATE_B_REQUEST
GATE_B_HANDOFF
GATE_C_SNAPSHOT
GATE_C_REQUEST
GATE_C_HANDOFF
COLLECTORS_GATE_C_COMMIT
GATE_D_EVIDENCE_ROOT
```

It refuses unset variables, relative paths, personal home snapshot paths outside the dedicated fictional test root, and dirty GBrain or collectors checkouts.

It runs:

```text
collector validator Release verification
retained Contacts validation regression
retained Calendar validation regression
Bun typecheck
Gate D unit tests
boundary scanner
schema-lock check
isolated GBRAIN_HOME + PGLite init
validator enrollment
Contacts verify/stage/review/approve/apply
Calendar verify/stage/review/approve/apply
source-tree comparison
source-scoped DB page/link/timeline checks
rerun determinism
post-validation tamper cases
apply resume case
cleanup/retain cases
final receipt and digest capture
```

Human TTY approvals remain manual checkpoints; the script prints the exact command and pauses. It contains no approval bypass.

## 22. Documentation updates

### GBrain README

Document the command as synthetic-only until Gate D and separate real-data approval. State that GBrain receives no Apple permissions and that the source remains non-federated.

### SECURITY.md

Document validator trust assumptions, app reinspection, handoff signatures, post-validation hash verification, local trust-file boundary, no LLM, TTY approval, source Git safety, and cleanup constraints.

### CHANGELOG

Record the local-only Gate D command and explicitly state that Mail and Messages are not enabled.

### Collectors README/SECURITY

Document validator export entitlement, enrollment/handoff file sets, receipt-key reuse, no auto-export, and Gate B/C regression requirements.

## 23. Plan coverage matrix

| Architecture requirement | Gate D implementation location |
|---|---|
| GBrain has no Apple grants | CLI-only adapter, boundary scanner, Gate D report |
| Signed validator trust | Contract §§5–12; plan Tasks 2–6 |
| App-private collector trust remains validator-owned | Validator handoff; GBrain stores only validator trust |
| Reinspect validator every run | `macos-code-identity.ts`; plan Task 8 |
| Validate before parse | `snapshot-verifier.ts`; plan Tasks 9–10 |
| Detect post-validation mutation | dual-pass descriptor hashing; plan Task 10 |
| Deterministic Contacts/Calendar parsing | domain parsers and schema lock; Tasks 11–14 |
| Primary-subject Markdown filing | mappers; Tasks 13–14 |
| Back-links and attendee linking | `attendee-linker.ts`; Task 14 |
| Raw evidence preserved | `raw-evidence.ts`; Task 12 |
| Stable local source repo | `source-repo.ts`; Task 7 |
| Non-federated source | source init and source-row tests; Task 7 |
| Sample review | review renderer; Task 16 |
| Human approval | TTY exact-digest approval; Task 17 |
| Idempotent apply | staged Git commit, ff-only merge, resume receipt; Task 18 |
| Cleanup after apply or seven days | cleanup/retain; Task 19 |
| Prompt injection isolation | deterministic renderer, no LLM boundary; Tasks 12–16 |
| Gate D qualification | Task 20 |
| Mail remains later | decision lock and final report |