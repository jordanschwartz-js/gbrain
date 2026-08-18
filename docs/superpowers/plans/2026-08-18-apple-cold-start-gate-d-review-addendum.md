# Apple Cold Start Gate D Final Review Corrections

**Primary plan:** `docs/superpowers/plans/2026-08-18-apple-cold-start-gate-d.md`  
**Normative contract:** `docs/superpowers/plans/2026-08-18-apple-cold-start-gate-d-contract.md`  
**Scaffolding appendix:** `docs/superpowers/plans/2026-08-18-apple-cold-start-gate-d-scaffolding.md`  
**Status:** Required, highest-precedence Gate D addendum

This addendum records issues found during the final trust, GBrain source, extraction, and human-approval review. It supersedes the other Gate D documents where wording differs. Every correction is required before Task 1.

## 1. TTY approval is replaced by validator-signed LocalAuthentication approval

A TTY challenge is not proof of human presence. A shell-capable agent can allocate a pseudoterminal, read the plan digest, and type the expected challenge. Gate D already has a visible, enrolled validator app and a trusted Secure Enclave signing key, so the validator becomes the approval authority as well as the validation authority.

Remove the production TTY approval flow from the contract and Task 17. There is no `APPROVE <digest>` challenge.

### 1.1 GBrain stage review bundle

After staging, GBrain writes this fixed bundle beneath the enrolled review inbox:

```text
~/.gbrain/apple-cold-start/inbox/reviews/<plan-id>/
├── review-index-v1.json
├── stage-plan-v1.json
├── review.md
├── diff.patch
├── samples/
│   └── <fixed generated sample files>
└── COMPLETE
```

Create:

```ts
export interface ReviewBundleFileV1 {
  name: string;
  byteLength: number;
  sha256: string;
}

export interface ReviewBundleIndexV1 {
  schemaVersion: 1;
  signatureContext: 'gbrain-stage-review-bundle-v1';
  planId: string;
  planDigest: string;
  domain: 'contacts' | 'calendar';
  manifestSha256: string;
  sourceId: 'apple-cold-start';
  baseCommit: string;
  stagedCommit: string;
  files: ReviewBundleFileV1[];
  generatedAt: string;
}
```

`review-index-v1.json` is not signed. It is deterministic, canonical, and binds every review file. `COMPLETE` contains its SHA-256 plus newline. The validator independently checks fixed paths, hashes, sizes, exact plan-digest recomputation, and file agreement before displaying anything.

Limits:

```text
review-index-v1.json   1 MiB
stage-plan-v1.json     8 MiB
review.md             16 MiB
diff.patch            64 MiB
each sample file      16 MiB
all samples combined  64 MiB
COMPLETE               65 bytes
```

The bundle contains no absolute source-repo, snapshot, handoff, validator, or trust path.

### 1.2 Validator review and approval

Add a visible validator action **Review GBrain Stage Plan**. The validator:

1. selects the review bundle through a file panel;
2. validates the complete fixed bundle before display;
3. renders plan identity, counts, base/staged commits, and plan digest in trusted app chrome;
4. displays `review.md`, `diff.patch`, and sample files as plain noninteractive monospaced text;
5. disables link activation, HTML/Markdown rendering, drag-to-execute, shell, Apple Events, and subprocesses;
6. requires the user to scroll through or explicitly select every required sample category and every ambiguity;
7. creates a fresh `LAContext`, reuse duration `0`, and evaluates `.deviceOwnerAuthentication` with a reason containing the plan-digest prefix;
8. signs an approval only after successful authentication.

Create in `SnapshotValidatorKit`:

```swift
public struct StageApprovalV1: Codable, Equatable, Sendable {
    public let schemaVersion: Int
    public let signatureContext: String
    public let planId: String
    public let planDigest: String
    public let reviewBundleSha256: String
    public let domain: ValidatedCollectorDomain
    public let manifestSha256: String
    public let sourceId: String
    public let baseCommit: String
    public let stagedCommit: String
    public let validatorVersion: String
    public let validatorCodeIdentity: CodeIdentityClaim
    public let validatorKeyFingerprint: String
    public let approvedAt: String
}
```

Fixed values:

```text
schemaVersion = 1
signatureContext = gbrain-stage-approval-v1
sourceId = apple-cold-start
```

Approval output:

```text
~/.gbrain/apple-cold-start/inbox/approvals/<plan-id>/
├── stage-approval-v1.json
├── stage-approval-v1.sig
└── COMPLETE
```

The signature is raw DER over exact canonical approval bytes. `COMPLETE` contains the approval JSON digest plus newline.

### 1.3 GBrain approval import

The command becomes:

```text
gbrain apple-cold-start approve <plan-id>
  --approval <absolute approval directory>
  [--json]
```

It is allowed noninteractively because human presence and intent are proved by the enrolled validator signature and LocalAuthentication-gated approval. GBrain:

- re-inspects the validator app;
- verifies approval signature and context;
- verifies review-bundle digest;
- recomputes plan digest;
- verifies base/staged commits, domain, manifest, and source ID;
- writes `approval-v1.json` as a local copy of the validated approval plus its source digests.

There is no unsigned, TTY-only, `--yes`, environment, or test bypass in production.

## 2. Add cryptographic domain separation to every validator-signed document

Add exact `signatureContext` fields:

```text
ValidatorEnrollmentDocumentV1.signatureContext = gbrain-validator-enrollment-v1
ValidationHandoffV1.signatureContext = gbrain-validation-handoff-v1
StageApprovalV1.signatureContext = gbrain-stage-approval-v1
```

The validator refuses an unknown context. GBrain verifies the expected context before considering a signature valid. A signature from one protocol cannot be replayed as another protocol document.

Update schemas, fixtures, golden vectors, and tests.

## 3. Handoff must attest every fixed collector protocol file

The prior handoff attested the collector manifest and declared content files but not the collector signature file itself. GBrain does not re-own collector trust, yet raw evidence and post-validation mutation detection must cover every fixed byte the validator reviewed.

Add to `ValidationHandoffV1`:

```swift
public let collectorSignatureSha256: String
public let collectorCompleteSha256: String
```

`collectorCompleteSha256` is the SHA-256 of the exact 65-byte collector `COMPLETE` file. `hashesFileSha256` already covers the hash list, and `manifestSha256` covers the private manifest.

GBrain verifies these fields before parsing or copying raw evidence. Any change to `snapshot.sig` or collector `COMPLETE` after validator review fails Gate D verification.

## 4. Production verification is confined to enrolled inbox roots

`verify` must not accept arbitrary owner-readable paths in production.

`source init` creates and records these owner-only roots:

```text
~/.gbrain/apple-cold-start/inbox/snapshots
~/.gbrain/apple-cold-start/inbox/handoffs
~/.gbrain/apple-cold-start/inbox/reviews
~/.gbrain/apple-cold-start/inbox/approvals
```

Production `verify`, `approve`, and cleanup require realpath containment beneath the corresponding root. Collector and validator apps receive access through visible file panels. Tests use an isolated `GBRAIN_HOME`, so the same containment rule applies without a production bypass.

Retained Gate B/Gate C artifacts are copied into the dedicated fictional Gate D test inbox with verified hashes before qualification. GBrain never verifies or deletes them in their archival locations.

## 5. Track hidden source directories in the initial source commit

Git does not track empty directories. `source init` must create:

```text
.raw/README.md
.apple-state/schema-v1.json
```

`.raw/README.md` states that files are private validated provenance and skipped by GBrain indexing. `.apple-state/schema-v1.json` is canonical JSON containing:

```json
{"schemaVersion":1,"sourceId":"apple-cold-start"}
```

Both are included in the initial commit. Do not use `.gitkeep` where a meaningful fixed file exists.

## 6. Use source-aware strict graph extraction, not best-effort sync hooks

The existing `extractLinksForSlugs` and `extractTimelineForSlugs` helpers omit source IDs and swallow per-row errors. They are unsafe for a nondefault multi-source brain and cannot satisfy Gate D's fail-loud requirement.

Task 18 must not call them.

Create `src/core/apple-cold-start/graph-extraction.ts` that uses the existing pure parsers:

```ts
extractLinksFromFile
extractTimelineFromContent
walkMarkdownFiles
```

It builds batches with explicit source fields:

```ts
const sourceId = 'apple-cold-start';

const link: LinkBatchInput = {
  from_slug,
  to_slug,
  link_type,
  context,
  link_source: 'markdown',
  from_source_id: sourceId,
  to_source_id: sourceId,
  origin_source_id: sourceId,
};

const timeline: TimelineBatchInput = {
  slug,
  date,
  source,
  summary,
  detail,
  source_id: sourceId,
};
```

Call `engine.addLinksBatch` and `engine.addTimelineEntriesBatch` directly. Do not catch and continue. Verify expected links and timeline rows using source-aware engine queries. Extend engine tests when required so page and graph verification always supplies `sourceId:'apple-cold-start'`.

Gate D does not modify the general-purpose extractor behavior in this stage.

## 7. Timeline Markdown must match the existing parser contract

The person-page Calendar timeline line is exactly:

```text
- **YYYY-MM-DD** | Apple Calendar — Attended [[daily/calendar/YYYY/YYYY-MM-DD|<escaped event title>]]. [Source: Apple Calendar snapshot <manifest-prefix>, event <event-prefix>, validated <date>]
```

The text before the em dash is the timeline source; the text after it is the summary. The earlier form without `Apple Calendar —` would not be extracted by GBrain's current timeline parser.

Golden tests must prove the generated line creates one source-scoped timeline entry and one source-scoped wikilink.

## 8. Validator approval UI treats review content as hostile plain text

Review files can contain imported source strings. The validator must not use a Markdown renderer, WebView, automatic data detector, clickable link, rich-text attachment, or HTML parser.

Use a read-only plain `NSTextView`/SwiftUI bridge with:

```text
isEditable = false
isSelectable = true
isRichText = false
importsGraphics = false
automaticLinkDetectionEnabled = false
```

Trusted plan digest, commits, counts, and approval controls live outside that text view. Source content cannot imitate trusted chrome.

## 9. Approval bundle and signed approval schemas are added to both repositories

Collectors repository additions:

```text
Packages/SnapshotValidatorKit/Sources/SnapshotValidatorKit/
├── ReviewBundleIndexV1.swift
├── ReviewBundleVerifier.swift
├── StageApprovalV1.swift
└── StageApprovalFileSet.swift

Apps/SnapshotValidator/Services/
├── StageReviewService.swift
└── StageApprovalExportService.swift

Apps/SnapshotValidator/Views/
└── StagePlanApprovalView.swift

Schemas/
├── review-bundle-index-v1.schema.json
└── stage-approval-v1.schema.json
```

GBrain additions:

```text
src/core/apple-cold-start/
├── review-bundle.ts
└── signed-approval.ts

schemas/apple-cold-start/
├── review-bundle-index-v1.schema.json
└── signed-stage-approval-v1.schema.json
```

Add exact fixed-file, size, signature, LocalAuthentication, plain-text display, and cross-language tests.

## 10. Task-sequence corrections

Apply these changes to the primary 20-task plan:

- **Task 2:** add enrollment `signatureContext`.
- **Task 4:** add handoff `signatureContext`, collector signature digest, and collector COMPLETE digest.
- **Task 5:** keep handoff export visible and explicit.
- **Task 6:** include Stage Approval models, UI, LocalAuthentication flow, exact entitlement regression, and approval golden vectors in validator qualification.
- **Task 7:** source init creates all four inbox roots and meaningful hidden tracked files.
- **Task 10:** require snapshot/handoff containment and verify all fixed collector protocol digests.
- **Task 15:** create the fixed review bundle after the staged commit and bind it in the stage plan.
- **Task 16:** review command verifies and reports the review-bundle digest.
- **Task 17:** replace TTY approval with signed-approval import and verification.
- **Task 18:** use Gate D source-aware strict graph extraction and source-aware verification.
- **Task 19:** cleanup includes review and approval bundles only after their digests are rechecked.
- **Task 20:** final qualification uses the visible validator review/LocalAuthentication/approval export and proves pseudoterminal tricks cannot produce an approval.

## 11. Updated approval state model

```ts
export interface ApprovalRecordV1 {
  schemaVersion: 1;
  planId: string;
  planDigest: string;
  reviewBundleSha256: string;
  approvalDocumentSha256: string;
  approvalSignatureSha256: string;
  domain: 'contacts' | 'calendar';
  manifestSha256: string;
  sourceId: 'apple-cold-start';
  baseCommit: string;
  stagedCommit: string;
  validatorKeyFingerprint: string;
  validatorCodeIdentity: CodeIdentityClaim;
  approvedAt: string;
  importedAt: string;
}
```

Apply verifies every field against current trust, plan, Git, and staged tree. It never accepts a legacy unsigned approval record.

## 12. Updated StagePlanV1 fields

Add:

```ts
reviewBundlePath: string;
reviewBundleSha256: string;
```

`reviewBundlePath` is private state and is omitted from default JSON output. `planDigest` includes the review-bundle digest but excludes its absolute path, so moving the private Gate D home does not change the logical plan.

To avoid digest recursion:

1. build the logical plan without `planDigest`, `reviewBundlePath`, or `reviewBundleSha256`;
2. compute `planDigest` over that logical plan;
3. build the review bundle containing the finalized plan;
4. compute `reviewBundleSha256` over the canonical review index;
5. store the private absolute review path and review-bundle digest in a separate `stage-state-v1.json` next to `stage-plan-v1.json`.

Therefore, do **not** add review-bundle fields to the signed logical `StagePlanV1`. The two private fields live in:

```ts
export interface StageStateV1 {
  schemaVersion: 1;
  planId: string;
  planDigest: string;
  reviewBundlePath: string;
  reviewBundleSha256: string;
}
```

This correction supersedes the earlier sentence adding those fields directly to `StagePlanV1`.

## 13. Final acceptance additions

Gate D also requires evidence that:

- validator-signed approval cannot be produced without LocalAuthentication;
- review text cannot create trusted UI, links, or executable actions;
- every approval signature is domain-separated;
- collector signature and collector COMPLETE mutation are detected;
- production verification refuses paths outside enrolled inboxes;
- source-aware graph extraction creates no default-source or cross-source fan-out;
- generated timeline lines parse exactly once;
- `.raw` and `.apple-state` are tracked but not indexed;
- no pseudoterminal or piped-input technique substitutes for validator approval.

## 14. Evidence basis

This correction is based on inspected GBrain source behavior:

- `extractLinksForSlugs` and `extractTimelineForSlugs` call single-row engine writes without source IDs and catch failures;
- `LinkBatchInput` and `TimelineBatchInput` explicitly support source IDs to prevent multi-source fan-out;
- the current timeline parser requires `- **date** | Source — Summary`;
- Git does not preserve empty directories;
- a TTY challenge proves interactivity, not device-owner presence.

The corrected design uses existing validator trust and LocalAuthentication instead of inventing a weaker second approval boundary.