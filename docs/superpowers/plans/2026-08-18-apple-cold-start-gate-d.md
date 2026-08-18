# Apple Cold Start Gate D Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Before Task 1, use superpowers:using-git-worktrees separately in both repositories. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the Apple cold-start integrity and durable-write boundary by exporting a signed validator handoff, independently verifying it in GBrain, deterministically staging fictional Contacts and Calendar Markdown, requiring human review, applying through one isolated non-federated source repo, and passing Gate D without giving GBrain Apple permissions.

**Architecture:** Extend the already qualified visible `SnapshotValidator.app` with validator-enrollment and validation-handoff exports signed by its existing Secure Enclave receipt key. Add a local-only `gbrain apple-cold-start` command that enrolls the validator, re-inspects its code identity, verifies signed handoffs and exact snapshot bytes before parsing, stages deterministic Markdown in a Git worktree, requires a TTY-bound plan approval, fast-forwards one private source repo, syncs it, and records resumable receipts.

**Tech Stack:** Swift 6/Xcode 27 for validator changes; Bun 1.3.10+, TypeScript 5.6, Node-compatible `crypto`, Darwin file-descriptor APIs, Git worktrees, existing GBrain source/sync/extraction infrastructure, Bun test, final Apple Development-signed macOS apps, and fictional Gate B/Gate C snapshots.

**Spec:** `docs/superpowers/specs/2026-08-18-cold-start-apple-reader-design.md`

**Normative contract:** `docs/superpowers/plans/2026-08-18-apple-cold-start-gate-d-contract.md`

**Scaffolding appendix:** `docs/superpowers/plans/2026-08-18-apple-cold-start-gate-d-scaffolding.md`

## Global Constraints

- Start only after Contacts Gate B and Calendar Gate C pass and their exact artifacts, reports, validator trust exports, and collector commit are retained.
- Do not modify or re-sign the qualified Contacts or Calendar collector applications.
- Validator bundle identifier remains `com.jordanschwartz.gbrain.coldstart.validator`.
- Validator has App Sandbox and user-selected read-write file entitlement only; no Apple personal-information, network, Apple Events, app-group, or temporary-exception entitlement.
- GBrain receives no Apple permission or Full Disk Access and contains no collector or validator private key.
- Gate D is macOS-only at runtime and CLI-only inside GBrain. It is not an MCP, HTTP, Minions, jobs, scheduler, or agent tool.
- Every validator enrollment export requires fresh device-owner authentication. Handoff export is visible and explicit and never automatic.
- GBrain re-inspects validator code identity on every verification.
- GBrain decodes no source record before validator signature, V2 receipt, manifest, paths, lengths, and first-pass hashes verify.
- Snapshot content is hashed again during parsing; parsed results are discarded when the second hash or final file identity differs.
- Only collector status `complete` and validator `importEligible=true` can stage.
- Gate D uses one private source repo with source ID `apple-cold-start`, no Git remote, and `federated=false`.
- No LLM, model API, shell agent, or semantic worker is used in Gate D core.
- Source strings never control paths, Git refs, commands, SQL, Markdown markers, frontmatter keys, approval state, or cleanup scope.
- No source deletion propagation in V1.
- Human approval is TTY-only and bound to one exact plan digest; no `--yes` or noninteractive bypass exists.
- Apply is fast-forward-only and resumable; it never resets, cleans, rebases, force-updates, pushes, or deletes owner content.
- Raw source evidence is preserved under hidden Git-tracked paths before original snapshot cleanup.
- Real Contacts and Calendar data remain prohibited throughout Gate D qualification.
- Mail feasibility Gate M0 follows only after Gate D.

---

## Task 1: Establish Both Isolated Gate D Workspaces and Prove Preconditions

**Repositories:**
- `jordanschwartz-js/cold-start-apple-collectors`
- `jordanschwartz-js/gbrain`

**Files:**
- Modify in collectors: `.gitignore`
- Modify in GBrain: `.gitignore`
- Create locally, ignored: `.gate-d.local.env` in each worktree
- Create in GBrain: `Qualification/AppleColdStartGateD/precondition-register.md`

**Interfaces:**
- Produces isolated branches `feature/gate-d-validator-handoff` and `feature/apple-cold-start-gate-d`.
- Produces verified Gate B/Gate C artifact digests and clean baseline evidence.

- [ ] **Step 1: Verify the collectors baseline and create its worktree**

```bash
cd /path/to/cold-start-apple-collectors
git switch main
git pull --ff-only
./script/test_packages.sh
./script/test_apps.sh

if ! git check-ignore -q .worktrees; then
  printf '\n.worktrees/\n.gate-d.local.env\n' >> .gitignore
  git add .gitignore
  git commit -m "chore: ignore Gate D worktrees and local evidence"
fi

git worktree add .worktrees/gate-d-validator -b feature/gate-d-validator-handoff
cd .worktrees/gate-d-validator
```

Expected: all baseline tests exit `0`; the worktree is on the new branch.

- [ ] **Step 2: Verify the GBrain baseline and create its worktree**

```bash
cd /path/to/gbrain
git switch master
git pull --ff-only
bun install --frozen-lockfile
bun run verify
bun test test/sources.test.ts test/sync*.test.ts

if ! git check-ignore -q .worktrees; then
  printf '\n.worktrees/\n.gate-d.local.env\n.gbrain-test-homes/\n' >> .gitignore
  git add .gitignore
  git commit -m "chore: ignore Gate D worktrees and local evidence"
fi

git worktree add .worktrees/apple-cold-start-gate-d -b feature/apple-cold-start-gate-d
cd .worktrees/apple-cold-start-gate-d
```

Expected: verification and selected baseline tests pass.

- [ ] **Step 3: Require and hash all private preconditions**

Create an ignored `.gate-d.local.env` containing absolute paths for the contract variables. Run:

```bash
set -a
source .gate-d.local.env
set +a

required=(
  GATE_B_COLLECTOR_APP GATE_B_SNAPSHOT GATE_B_REPORT GATE_B_VALIDATOR_TRUST_EXPORT
  GATE_C_COLLECTOR_APP GATE_C_SNAPSHOT GATE_C_REPORT GATE_C_VALIDATOR_TRUST_EXPORT
  GATE_C_VALIDATOR_APP COLLECTORS_GATE_C_COMMIT
)
for name in "${required[@]}"; do
  [[ -n "${!name:-}" ]] || { echo "missing $name" >&2; exit 1; }
done

grep -q '^Status: PASS' "$GATE_B_REPORT"
grep -q '^Status: PASS' "$GATE_C_REPORT"
[[ "$COLLECTORS_GATE_C_COMMIT" =~ ^[0-9a-f]{40}$ ]]
```

Hash every file and main app executable into private evidence. Do not copy snapshots, trust exports, or private paths into Git.

- [ ] **Step 4: Write the checked-in precondition register template**

Create `Qualification/AppleColdStartGateD/precondition-register.md` with required artifact names, acceptable status, and hash fields populated only with fictional fixture hashes or the phrase `recorded in private Gate D evidence`. It must contain no local path.

- [ ] **Step 5: Prove collector source non-regression before edits**

```bash
git -C /path/to/cold-start-apple-collectors diff --quiet
shasum -a 256 "$GATE_B_COLLECTOR_APP/Contents/MacOS/ContactsCollector"
shasum -a 256 "$GATE_C_COLLECTOR_APP/Contents/MacOS/CalendarCollector"
```

Record the hashes privately and fail if they differ from Gate reports.

- [ ] **Step 6: Commit the checked-in precondition template in GBrain**

```bash
git add .gitignore Qualification/AppleColdStartGateD/precondition-register.md
git commit -m "docs: establish Gate D precondition contract"
```

---

## Task 2: Define Validator Enrollment Protocol and Golden Vectors

**Repository:** collectors

**Files:**
- Create: `Packages/SnapshotValidatorKit/Sources/SnapshotValidatorKit/ValidatorEnrollmentDocumentV1.swift`
- Create: `Packages/SnapshotValidatorKit/Sources/SnapshotValidatorKit/ValidatorEnrollmentFileSet.swift`
- Create: `Schemas/validator-enrollment-v1.schema.json`
- Create: `Schemas/code-identity-claim-v1.schema.json`
- Create: `Packages/SnapshotValidatorKit/Tests/SnapshotValidatorKitTests/ValidatorEnrollmentDocumentTests.swift`
- Create: `Fixtures/GateD/Crypto/*` enrollment vector files

**Interfaces:**
- Produces `ValidatorEnrollmentDocumentV1` and fixed enrollment file set from contract §§6–7.

- [ ] **Step 1: Write failing canonical and signature tests**

```swift
import Foundation
import Testing
@testable import SnapshotValidatorKit

@Test func validatorEnrollmentCanonicalBytesMatchGoldenFixture() throws {
    let document = GateDTestFixtures.validatorEnrollment()
    let encoded = try CanonicalJSON.encode(document)
    #expect(encoded == try GateDTestFixtures.data("validator-enrollment.json"))
}

@Test func validatorEnrollmentRejectsWrongAlgorithm() {
    #expect(throws: ValidatorEnrollmentError.unsupportedAlgorithm) {
        try ValidatorEnrollmentDocumentV1.validating(
            GateDTestFixtures.validatorEnrollment(signatureAlgorithm: "raw-p1363")
        )
    }
}
```

- [ ] **Step 2: Run tests to prove they fail**

```bash
swift test --package-path Packages/SnapshotValidatorKit \
  --filter ValidatorEnrollmentDocumentTests
```

Expected: FAIL because the model and validator do not exist.

- [ ] **Step 3: Implement the exact model and file set**

Use the contract fields and constants. Implement:

```swift
public enum ValidatorEnrollmentFileSet {
    public static let document = "validator-enrollment.json"
    public static let signature = "validator-enrollment.sig"
    public static let complete = "COMPLETE"
    public static let allowed = Set([document, signature, complete])
}
```

Validation requires schema `1`, `macos-signing-v1`, `ecdsa-p256-sha256-der`, 65-byte X9.63 key, matching key fingerprint, valid code-identity hash fields, and canonical timestamp.

- [ ] **Step 4: Add test-only software-key golden vectors**

Generate one P-256 software key only inside test code. Write canonical document, raw DER signature, X9.63 public key, and expected hashes to `Fixtures/GateD/Crypto`. The fixture contains fictional code identity values.

- [ ] **Step 5: Validate schema and tests**

```bash
swift test --package-path Packages/SnapshotValidatorKit \
  --filter ValidatorEnrollmentDocumentTests
python3 script/validate_fixtures.py Fixtures/GateD/Crypto
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add Packages/SnapshotValidatorKit Schemas Fixtures/GateD/Crypto
git commit -m "feat(validator): define signed validator enrollment protocol"
```

---

## Task 3: Implement Visible Authenticated Validator Enrollment Export

**Repository:** collectors

**Files:**
- Create: `Apps/SnapshotValidator/Services/ValidatorEnrollmentExportService.swift`
- Create: `Apps/SnapshotValidator/Services/ValidatorExportRootService.swift`
- Create: `Apps/SnapshotValidator/Views/ValidatorEnrollmentExportView.swift`
- Modify: `Apps/SnapshotValidator/Models/SnapshotValidatorModel.swift`
- Modify: `Apps/SnapshotValidator/Views/ValidatorHomeView.swift`
- Test: `Tests/SnapshotValidatorTests/GateD/ValidatorEnrollmentExportTests.swift`
- Test: `Tests/SnapshotValidatorTests/GateD/ValidatorExportRootTests.swift`

**Interfaces:**
- Consumes validator receipt key and code identity.
- Produces one visible LocalAuthentication-gated enrollment directory.

- [ ] **Step 1: Write failing one-shot authorization and file-order tests**

```swift
@Test func enrollmentExportRequiresFreshOwnerAuthentication() async throws {
    let auth = FakeValidatorUserPresence(result: .cancelled)
    let service = ValidatorEnrollmentExportService(
        userPresence: auth,
        rootSelector: FakeExportRootSelector(),
        signer: FakeValidatorReceiptSigner()
    )
    await #expect(throws: ValidatorEnrollmentExportError.authenticationCancelled) {
        try await service.export()
    }
}

@Test func completeIsWrittenLast() async throws {
    let writer = RecordingAtomicWriter()
    let service = GateDTestFixtures.enrollmentService(writer: writer)
    _ = try await service.export()
    #expect(writer.finalizedNames.last == "COMPLETE")
}
```

- [ ] **Step 2: Run tests and confirm failure**

```bash
./script/test_apps.sh --only SnapshotValidatorTests
```

Expected: FAIL because export services and UI actions are absent.

- [ ] **Step 3: Implement root selection and path policy**

Use `NSOpenPanel` visibly. Reject nonlocal volumes, sync roots, Git ancestors, wrong owner, stale bookmark, symlink ancestors, and paths that cannot be normalized to `0700`. Persist an app-scoped bookmark in the validator sandbox.

- [ ] **Step 4: Implement export service**

Create a fresh `LAContext`, reuse duration `0`, evaluate `.deviceOwnerAuthentication`, load the existing validator receipt key with the authorized context where required, build canonical enrollment, sign exact bytes, write temp files with owner-only modes, fsync, rename, then write `COMPLETE` last.

- [ ] **Step 5: Add visible UI and cancellation behavior**

The home view exposes **Export Validator Enrollment**. It displays the fingerprint and destination after success. Cancellation returns to idle and leaves no completed directory. There is no auto-export or hidden invocation.

- [ ] **Step 6: Run tests**

```bash
./script/test_apps.sh --only SnapshotValidatorTests
swift test --package-path Packages/SnapshotValidatorKit
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add Apps/SnapshotValidator Tests/SnapshotValidatorTests/GateD
git commit -m "feat(validator): export authenticated validator enrollment"
```

---

## Task 4: Define Validation Handoff Protocol and Receipt Binding

**Repository:** collectors

**Files:**
- Create: `Packages/SnapshotValidatorKit/Sources/SnapshotValidatorKit/ValidationHandoffV1.swift`
- Create: `Packages/SnapshotValidatorKit/Sources/SnapshotValidatorKit/ValidationHandoffFileSet.swift`
- Create: `Schemas/validation-handoff-v1.schema.json`
- Create: `Packages/SnapshotValidatorKit/Tests/SnapshotValidatorKitTests/ValidationHandoffTests.swift`
- Extend: `Fixtures/GateD/Crypto/*`

**Interfaces:**
- Produces `ValidationHandoffV1` bound to an exact V2 receipt and verified collector manifest.

- [ ] **Step 1: Write failing agreement tests**

```swift
@Test func handoffRequiresImportEligibleCompleteReceipt() throws {
    let receipt = GateDTestFixtures.receipt(status: .partial, importEligible: false)
    #expect(throws: ValidationHandoffError.notImportEligible) {
        try ValidationHandoffV1.build(
            validatedSnapshot: GateDTestFixtures.validatedSnapshot(),
            receipt: receipt,
            receiptBytes: Data(),
            receiptSignature: Data()
        )
    }
}

@Test func handoffContentFilesAreSortedAndUnique() throws {
    let handoff = try GateDTestFixtures.handoff(contentNames: ["records.ndjson", "errors.ndjson", "records.ndjson"])
    #expect(throws: ValidationHandoffError.duplicateContentFile("records.ndjson")) {
        try handoff.validate()
    }
}
```

- [ ] **Step 2: Run tests and confirm failure**

```bash
swift test --package-path Packages/SnapshotValidatorKit \
  --filter ValidationHandoffTests
```

Expected: FAIL because handoff types are absent.

- [ ] **Step 3: Implement contract model and builder**

The builder takes only `ValidatedSnapshotResult`, the exact V2 receipt bytes/signature, validator identity, and clock. It copies already verified manifest fields and computes receipt digests. It refuses field disagreement or noncomplete status.

- [ ] **Step 4: Add canonical handoff and invalid vectors**

Create valid, wrong-key, tampered-byte, wrong-receipt-digest, and wrong-content-table fixtures with raw DER signatures.

- [ ] **Step 5: Run tests and schema validation**

```bash
swift test --package-path Packages/SnapshotValidatorKit \
  --filter ValidationHandoffTests
python3 script/validate_fixtures.py Fixtures/GateD/Crypto
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add Packages/SnapshotValidatorKit Schemas Fixtures/GateD/Crypto
git commit -m "feat(validator): define signed GBrain validation handoff"
```

---

## Task 5: Export Handoffs Only From Completed In-Session Validations

**Repository:** collectors

**Files:**
- Create: `Apps/SnapshotValidator/Services/ValidationHandoffExportService.swift`
- Create: `Apps/SnapshotValidator/Views/ValidationHandoffExportView.swift`
- Modify: `Apps/SnapshotValidator/Services/SnapshotValidationService.swift`
- Modify: `Apps/SnapshotValidator/Models/SnapshotValidatorModel.swift`
- Modify: `Apps/SnapshotValidator/Views/ValidationResultView.swift`
- Test: `Tests/SnapshotValidatorTests/GateD/ValidationHandoffExportTests.swift`

**Interfaces:**
- Consumes an in-memory `ValidatedSnapshotResult` and existing V2 receipt.
- Produces fixed signed handoff directory with no snapshot content.

- [ ] **Step 1: Write failing session-binding and no-auto-export tests**

```swift
@Test func cannotExportHandoffFromAReconstructedManifest() async {
    let service = GateDTestFixtures.handoffExportService()
    await #expect(throws: ValidationHandoffExportError.noCurrentValidation) {
        try await service.export(currentValidation: nil)
    }
}

@Test func successfulValidationDoesNotExportAutomatically() async throws {
    let writer = RecordingAtomicWriter()
    let model = GateDTestFixtures.validatorModel(writer: writer)
    try await model.validateSelectedSnapshot()
    #expect(writer.finalizedNames.isEmpty)
}
```

- [ ] **Step 2: Run tests and confirm failure**

```bash
./script/test_apps.sh --only SnapshotValidatorTests
```

Expected: FAIL.

- [ ] **Step 3: Retain the completed validation result in memory**

`SnapshotValidationService` returns a value containing exact manifest bytes/digest, content table, request/effective digests, collector identity, V2 receipt bytes/signature, and validation timestamps. No source record body is added to the model.

- [ ] **Step 4: Implement explicit export**

On **Export for GBrain**, choose the enrolled handoff root, build the handoff, sign it with the validator receipt key, copy exact receipt bytes/signature, atomically write the fixed file set, and write `COMPLETE` last. Refuse an existing manifest directory.

- [ ] **Step 5: Verify handoff privacy**

Tests search all handoff bytes for fictional names, emails, titles, notes, locations, record identifiers, and absolute snapshot paths. None may appear except fixed nonprivate hashes and code identity fields.

- [ ] **Step 6: Run tests**

```bash
./script/test_apps.sh --only SnapshotValidatorTests
swift test --package-path Packages/SnapshotValidatorKit
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add Apps/SnapshotValidator Tests/SnapshotValidatorTests/GateD
git commit -m "feat(validator): export signed in-session validation handoffs"
```

---

## Task 6: Requalify the Updated Validator and Lock the Collectors Commit

**Repository:** collectors

**Files:**
- Modify: `Apps/SnapshotValidator/Resources/SnapshotValidator.entitlements`
- Create: `script/scan_gate_d_validator_boundary.sh`
- Create: `script/verify_gate_d_validator_nonregression.sh`
- Create: `script/verify_gate_d_validator_release.sh`
- Create: `Qualification/GateDValidator/*`
- Modify: `README.md`, `SECURITY.md`, `project.yml`

**Interfaces:**
- Produces final qualified validator app, enrollment export, Contacts handoff, Calendar handoff, report, and exact collectors commit for GBrain schema locking.

- [ ] **Step 1: Write the failing entitlement and boundary scan**

The scan requires exactly sandbox plus user-selected read-write and rejects personal-information, network, Apple Events, subprocess, generic script, CLI export, XPC, URL, daemon, or automatic handoff code.

Run:

```bash
./script/scan_gate_d_validator_boundary.sh
```

Expected: FAIL while the validator still has read-only entitlement and missing export allowlist.

- [ ] **Step 2: Apply exact entitlement and update project tests**

Replace the entitlement file with the scaffolding appendix content. Add Gate D test targets/resources without weakening Contacts or Calendar tests.

- [ ] **Step 3: Implement retained snapshot non-regression script**

The script requires the Gate B and Gate C snapshots, trust exports, reports, and collector apps. It imports the existing validator trust state into the dedicated fictional test user, validates both snapshots, and confirms V2 receipts remain valid. It never silently recreates trust.

- [ ] **Step 4: Run complete Release verification**

```bash
./script/verify_gate_d_validator_release.sh
./script/verify_gate_d_validator_nonregression.sh
```

Expected: all package/app tests pass, exact entitlements pass, both retained snapshots validate, enrollment and both handoffs export, and no collector binary hash changes.

- [ ] **Step 5: Complete the validator Gate D report**

Record exact app hash, Team ID, CDHash, entitlements hash, validator key fingerprint, schema hashes, Gate B/C regression receipt hashes, macOS/Xcode/Swift versions, and remaining limits. Status must be `PASS` before GBrain Task 9 enrollment.

- [ ] **Step 6: Commit and merge the validator branch**

```bash
git add Apps Packages Schemas Fixtures Tests Qualification script README.md SECURITY.md project.yml
git commit -m "security(validator): qualify signed Gate D handoff export"
```

After review, merge to collectors `main`, record the resulting 40-character commit, and rebuild/reverify the final app from that commit. Do not proceed with a pre-merge build.

---

## Task 7: Scaffold the Local-Only GBrain Command, State Paths, and Source Initialization

**Repository:** GBrain

**Files:**
- Create: `src/commands/apple-cold-start.ts`
- Create: `src/core/apple-cold-start/constants.ts`
- Create: `src/core/apple-cold-start/errors.ts`
- Create: `src/core/apple-cold-start/types.ts`
- Create: `src/core/apple-cold-start/paths.ts`
- Create: `src/core/apple-cold-start/state-store.ts`
- Create: `src/core/apple-cold-start/source-repo.ts`
- Modify: `src/cli.ts`
- Test: `test/apple-cold-start-cli.test.ts`
- Test: `test/apple-cold-start-source.test.ts`

**Interfaces:**
- Produces strict command parser, owner-only state roots, and `apple-cold-start` source initialization.

- [ ] **Step 1: Write failing CLI-locality tests**

```ts
import { describe, expect, test } from 'bun:test';
import { parseAppleColdStartArgs } from '../src/commands/apple-cold-start.ts';

test('rejects unknown flags and relative paths', () => {
  expect(() => parseAppleColdStartArgs(['verify', '--snapshot', './relative'])).toThrow('absolute');
});

test('apple-cold-start is CLI-only', async () => {
  const operations = await import('../src/core/operations.ts');
  expect(operations.operations.some(op => op.name.includes('apple_cold_start'))).toBe(false);
});
```

- [ ] **Step 2: Run tests and confirm failure**

```bash
bun test test/apple-cold-start-cli.test.ts
```

Expected: FAIL because command and parser are absent.

- [ ] **Step 3: Add command dispatch and exact grammar**

Add only `apple-cold-start` to `CLI_ONLY`, dynamic dispatch, and help. Implement a hand-written strict parser for the contract grammar. Do not use shared permissive operation parsing.

- [ ] **Step 4: Add owner-only state-path helpers**

Create directories under `gbrainPath('apple-cold-start')` with mode `0700`, reject symlink ancestors, and write JSON atomically with mode `0600`.

- [ ] **Step 5: Write failing source-init tests**

Test new repo, existing matching repo, remote refusal, dirty/nonlocal/sync-root refusal, overlapping GBrain source path, and existing source row with wrong federation/path.

- [ ] **Step 6: Implement source init**

Initialize branch `main`, local Git identity, fixed README/gitattributes/source marker, no remote, hidden state/raw paths, initial commit, and source row `apple-cold-start` with `federated=false`.

- [ ] **Step 7: Run tests**

```bash
bun test test/apple-cold-start-cli.test.ts test/apple-cold-start-source.test.ts
bun run typecheck
```

Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add src/commands/apple-cold-start.ts src/core/apple-cold-start src/cli.ts test/apple-cold-start-*.test.ts
git commit -m "feat: scaffold local Apple cold-start Gate D command"
```

---

## Task 8: Implement Safe Files, P-256 Verification, and macOS App Reinspection

**Repository:** GBrain

**Files:**
- Create: `src/core/apple-cold-start/safe-files.ts`
- Create: `src/core/apple-cold-start/canonical-json.ts`
- Create: `src/core/apple-cold-start/p256.ts`
- Create: `src/core/apple-cold-start/macos-code-identity.ts`
- Test: `test/apple-cold-start-safe-files.test.ts`
- Test: `test/apple-cold-start-p256.test.ts`
- Test: `test/apple-cold-start-code-identity.test.ts`

**Interfaces:**
- Produces safe fixed-file readers, canonical hashing, DER signature verification, and `macos-signing-v1` app inspection.

- [ ] **Step 1: Write failing safe-file attack tests**

Cover symlink, hard link, wrong mode, wrong owner fixture, oversized file, extra directory, file replacement, in-place mutation during parse, and descriptor closure.

- [ ] **Step 2: Write failing Swift/Bun signature-vector tests**

```ts
expect(verifyP256Der(enrollmentBytes, enrollmentSig, x963Key)).toBe(true);
expect(verifyP256Der(tamperedBytes, enrollmentSig, x963Key)).toBe(false);
expect(() => p256PublicKeyFromX963(Buffer.alloc(64))).toThrow('invalid_p256_public_key');
```

- [ ] **Step 3: Run tests and confirm failure**

```bash
bun test test/apple-cold-start-safe-files.test.ts \
  test/apple-cold-start-p256.test.ts \
  test/apple-cold-start-code-identity.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Implement safe descriptor API**

Use the contract functions, `O_NOFOLLOW`, `fstat`, exact mode/UID/nlink/type/size, fixed directory entries, two-pass hashing, and final identity checks. Parse callbacks cannot emit durable output before second-pass success.

- [ ] **Step 5: Implement P-256 X9.63/JWK verification**

Use `createPublicKey` and `crypto.verify('sha256', ...)` exactly. Reject raw/P1363 signatures, malformed DER, compressed points, unsupported curves, and padded/extra key bytes.

- [ ] **Step 6: Implement fixed absolute-tool code inspection**

Use `/usr/bin/codesign` and `/usr/bin/plutil` via `execFile`. Parse one exact identity, canonicalize entitlements to sorted JSON, hash executable and entitlements, and compare golden fixtures.

- [ ] **Step 7: Run tests and boundary scan draft**

```bash
bun test test/apple-cold-start-safe-files.test.ts \
  test/apple-cold-start-p256.test.ts \
  test/apple-cold-start-code-identity.test.ts
bun run typecheck
```

Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add src/core/apple-cold-start test/apple-cold-start-*.test.ts
git commit -m "security: add Gate D file crypto and validator identity checks"
```

---

## Task 9: Enroll Validator Trust Into GBrain

**Repository:** GBrain

**Files:**
- Create: `src/core/apple-cold-start/validator-enrollment.ts`
- Create: `src/core/apple-cold-start/validator-trust-store.ts`
- Modify: `src/commands/apple-cold-start.ts`
- Create: `schemas/apple-cold-start/validator-trust-v1.schema.json`
- Test: `test/apple-cold-start-trust.test.ts`

**Interfaces:**
- Produces owner-reviewed `ValidatorTrustRecordV1` and trust-status command.

- [ ] **Step 1: Write failing enrollment tests**

Cover valid enrollment, non-TTY refusal, wrong typed fingerprint, wrong self-signature, changed app identity, stale app path, changed entitlements, existing trust replacement, and owner-only file modes.

- [ ] **Step 2: Run tests and confirm failure**

```bash
bun test test/apple-cold-start-trust.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement strict enrollment verification**

Verify file set, `COMPLETE`, canonical schema, key/fingerprint, self-signature, and independent app identity. Require bundle ID `com.jordanschwartz.gbrain.coldstart.validator` and exact enrollment claim.

- [ ] **Step 4: Implement TTY challenge**

Production prompt displays nonprivate identity fields and requires `ENROLL <prefix>`. Tests inject a `TrustEnrollmentPrompter`; production construction has no environment or flag bypass.

- [ ] **Step 5: Implement atomic trust store**

Write `validator-v1.json` mode `0600` under `0700` parent, no symlinks. Re-enrollment replaces trust only after a new successful challenge and writes a private replacement receipt.

- [ ] **Step 6: Run tests**

```bash
bun test test/apple-cold-start-trust.test.ts
bun run typecheck
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add src/core/apple-cold-start src/commands/apple-cold-start.ts schemas/apple-cold-start test/apple-cold-start-trust.test.ts
git commit -m "feat: enroll signed validator trust for Gate D"
```

---

## Task 10: Verify Validator Handoff and Exact Snapshot Bytes Before Parsing

**Repository:** GBrain

**Files:**
- Create: `src/core/apple-cold-start/validation-handoff.ts`
- Create: `src/core/apple-cold-start/snapshot-verifier.ts`
- Modify: `src/commands/apple-cold-start.ts`
- Create: `schemas/apple-cold-start/verified-snapshot-v1.schema.json`
- Test: `test/apple-cold-start-handoff.test.ts`
- Test: `test/apple-cold-start-snapshot-verifier.test.ts`

**Interfaces:**
- Produces `VerifiedCollectorSnapshotV1` only after the full contract order succeeds.

- [ ] **Step 1: Write failing handoff-chain tests**

Test wrong validator key, changed app, altered handoff, altered V2 receipt, receipt/handoff disagreement, noncomplete status, wrong domain, wrong run ID, unknown policy version, and malformed code identity.

- [ ] **Step 2: Write failing post-validation mutation test**

Open a valid fixture, mutate `records.ndjson` after first-pass verification and before/during second-pass parsing, and assert no verification state is written.

- [ ] **Step 3: Run tests and confirm failure**

```bash
bun test test/apple-cold-start-handoff.test.ts \
  test/apple-cold-start-snapshot-verifier.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Implement handoff and V2 receipt verification**

Reinspect validator, verify handoff fixed files/signature/COMPLETE, verify exact V2 receipt bytes/signature and digest links, then enforce field agreement.

- [ ] **Step 5: Implement collector snapshot byte verification**

Verify manifest digest, handoff agreement, collector COMPLETE, fixed entries, content table, lengths, hash list, first-pass hashes, second-pass hashes, final file identity, and status/coverage semantics. Do not verify collector signature or duplicate collector trust.

- [ ] **Step 6: Implement request context checks and verification ID**

Strictly parse original request, require run ID/domain, enforce Calendar requested/effective window bounds and Contacts limit/count upper bounds where observable, preserve opaque signed request/effective digests, compute deterministic verification ID, and write state atomically.

- [ ] **Step 7: Run tests**

```bash
bun test test/apple-cold-start-handoff.test.ts \
  test/apple-cold-start-snapshot-verifier.test.ts
bun run typecheck
```

Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add src/core/apple-cold-start src/commands/apple-cold-start.ts schemas/apple-cold-start test/apple-cold-start-*.test.ts
git commit -m "security: verify validator handoff and snapshot bytes"
```

---

## Task 11: Vendor and Enforce Exact Collector Schemas and Strict Wire Decoders

**Repository:** GBrain

**Files:**
- Create: `scripts/import-apple-collector-schemas.ts`
- Create: `scripts/check-apple-schema-lock.ts`
- Create: `src/core/apple-cold-start/schema-lock.ts`
- Create: `src/core/apple-cold-start/strict-json.ts`
- Create: `src/core/apple-cold-start/ndjson.ts`
- Create: `src/core/apple-cold-start/contact-wire.ts`
- Create: `src/core/apple-cold-start/calendar-wire.ts`
- Create: `schemas/apple-cold-start/collectors-schema-lock-v1.json`
- Copy exact collector schemas under locked commit path
- Test: `test/apple-cold-start-strict-wire.test.ts`

**Interfaces:**
- Produces strict source wire objects only from bytes already verified by Task 10.

- [ ] **Step 1: Write failing unknown-field and wrong-version tests**

Use Contacts and Calendar fixtures with one extra field, missing required field, wrong enum, wrong content hash, unsorted record, blank NDJSON line, and unknown schema version. Every case must fail closed.

- [ ] **Step 2: Run tests and confirm failure**

```bash
bun test test/apple-cold-start-strict-wire.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Import exact schemas from the approved collectors commit**

```bash
bun run scripts/import-apple-collector-schemas.ts \
  --collectors-repo /absolute/path/to/cold-start-apple-collectors \
  --commit "$COLLECTORS_GATE_C_COMMIT"
```

Inspect and commit unchanged bytes plus sorted lock.

- [ ] **Step 4: Implement strict decoders**

Use recursive exact-key checks and explicit TypeScript guards. Do not add a permissive JSON-schema runtime. Recompute every record content hash from the hash payload, enforce sorted records/arrays and coverage counts, and return immutable plain objects.

- [ ] **Step 5: Add cross-language crypto fixture verification**

GBrain verifies the exact Swift enrollment/handoff vectors and invalid variants. `check-apple-schema-lock.ts` validates every vendored schema hash and length.

- [ ] **Step 6: Run tests and lock check**

```bash
bun test test/apple-cold-start-strict-wire.test.ts \
  test/apple-cold-start-p256.test.ts
bun run scripts/check-apple-schema-lock.ts
bun run typecheck
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add scripts src/core/apple-cold-start schemas/apple-cold-start fixtures/apple-cold-start test/apple-cold-start-*.test.ts
git commit -m "feat: lock and decode qualified Apple collector schemas"
```

---

## Task 12: Implement Raw Evidence Copy, Managed Blocks, and Injection-Safe Rendering

**Repository:** GBrain

**Files:**
- Create: `src/core/apple-cold-start/raw-evidence.ts`
- Create: `src/core/apple-cold-start/managed-blocks.ts`
- Create: `src/core/apple-cold-start/markdown-escaping.ts`
- Create: `src/core/apple-cold-start/markdown-renderer.ts`
- Test: `test/apple-cold-start-markdown-escaping.test.ts`
- Test: `test/apple-cold-start-managed-blocks.test.ts`

**Interfaces:**
- Produces safe Markdown primitives, owner-content-preserving managed updates, and exact hidden evidence copies.

- [ ] **Step 1: Write adversarial rendering tests**

Feed source strings containing frontmatter delimiters, timeline sentinels, HTML comments, Markdown links, wikilinks, shell/SQL text, path traversal, control characters, backticks, and multiline content. Assert output cannot create a new frontmatter key, heading, marker, timeline split, or path.

- [ ] **Step 2: Write managed-block drift tests**

Cover new insertion, owner text preservation, exact update, edited managed block, missing/duplicate/nested markers, unmanaged slug collision, and two distinct managed kinds in one page.

- [ ] **Step 3: Run tests and confirm failure**

```bash
bun test test/apple-cold-start-markdown-escaping.test.ts \
  test/apple-cold-start-managed-blocks.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Implement escaping and deterministic frontmatter**

Implement the contract functions, fixed key ordering, LF endings, source literal blocks, and exact managed markers. Validate output with existing `parseMarkdown(..., {validate:true})`.

- [ ] **Step 5: Implement raw evidence copy**

Copy only already verified fixed files and request bytes into `.raw/snapshots/<domain>/<manifest>/`, preserve exact bytes, owner-only modes, and post-copy hashes. Never copy a caller-discovered filename.

- [ ] **Step 6: Run tests**

```bash
bun test test/apple-cold-start-markdown-escaping.test.ts \
  test/apple-cold-start-managed-blocks.test.ts
bun run typecheck
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add src/core/apple-cold-start test/apple-cold-start-*.test.ts fixtures/apple-cold-start
git commit -m "security: add injection-safe Apple Markdown staging"
```

---

## Task 13: Map and Reconcile Contacts Into Stable Person and Company Pages

**Repository:** GBrain

**Files:**
- Create: `src/core/apple-cold-start/contact-reconciler.ts`
- Create: `src/core/apple-cold-start/contact-mapper.ts`
- Create: `schemas/apple-cold-start/contacts-identity-v1.schema.json`
- Test: `test/apple-cold-start-contact-reconcile.test.ts`
- Test: `test/apple-cold-start-contact-mapper.test.ts`

**Interfaces:**
- Consumes verified Contacts wire records and prior identity state.
- Produces deterministic page mutations, identity updates, raw evidence reference, skips, and ambiguities.

- [ ] **Step 1: Write failing conservative identity tests**

Cover exact raw locator, unique overlap, unique strong ID, duplicate name, strong-ID contradiction, record-type contradiction, locator drift alias, multiple candidates, stable slug after rename, and unmanaged slug collision.

- [ ] **Step 2: Write failing page golden tests**

Test person, organization-only company, multiple labeled values, excluded notes, image-present boolean, exact inline citations, unique organization link, and ambiguous organization text.

- [ ] **Step 3: Run tests and confirm failure**

```bash
bun test test/apple-cold-start-contact-reconcile.test.ts \
  test/apple-cold-start-contact-mapper.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Implement identity decision and stable slugging**

Use the contract order and slug algorithm. Preserve prior slug and aliases. Emit ambiguity objects instead of choosing the first candidate.

- [ ] **Step 5: Implement deterministic page mapping**

Render fixed frontmatter and managed truth block, preserve owner content, create company pages only for organization identities, link a person's organization only to one unique organization identity, and stage hidden identity state.

- [ ] **Step 6: Run tests**

```bash
bun test test/apple-cold-start-contact-reconcile.test.ts \
  test/apple-cold-start-contact-mapper.test.ts
bun run typecheck
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add src/core/apple-cold-start schemas/apple-cold-start fixtures/apple-cold-start test/apple-cold-start-*.test.ts
git commit -m "feat: deterministically stage validated Apple Contacts"
```

---

## Task 14: Map Calendar Days, Recurrence, Attendee Links, and Person Back-Links

**Repository:** GBrain

**Files:**
- Create: `src/core/apple-cold-start/calendar-reconciler.ts`
- Create: `src/core/apple-cold-start/calendar-mapper.ts`
- Create: `src/core/apple-cold-start/attendee-linker.ts`
- Create: `schemas/apple-cold-start/calendar-identity-v1.schema.json`
- Test: `test/apple-cold-start-calendar-reconcile.test.ts`
- Test: `test/apple-cold-start-calendar-mapper.test.ts`

**Interfaces:**
- Consumes verified Calendar catalog/events and staged Contacts identity state.
- Produces day/month/log mutations, person timeline mutations, stubs, identity updates, skips, and ambiguities.

- [ ] **Step 1: Write failing reconciliation tests**

Cover exact locator, moved calendar in same source, full-sync source-ID change with unique source-account hint, copied event across two accounts, strong-fingerprint ambiguity, detached occurrence, and missing record.

- [ ] **Step 2: Write failing local-date and recurrence tests**

Cover timed event time zone, all-day DST boundary, exclusive end date, cross-midnight timed event, recurring occurrence, detached edit, recurrence selectors, structured location scaled integers, alarms, and source strings containing Markdown control syntax.

- [ ] **Step 3: Write failing attendee/back-link tests**

Cover one unique mailto-to-contact match, ambiguous Contacts match, no match, three-event stub threshold, same attendee repeated in one event, and person timeline managed-block preservation.

- [ ] **Step 4: Run tests and confirm failure**

```bash
bun test test/apple-cold-start-calendar-reconcile.test.ts \
  test/apple-cold-start-calendar-mapper.test.ts
```

Expected: FAIL.

- [ ] **Step 5: Implement Calendar identity and page filing**

Use collector-recorded all-day local date span and event time-zone context. Generate deterministic day blocks, month indexes, and calendar log; preserve every public event field without analytical inference.

- [ ] **Step 6: Implement attendee linking/back-links**

Normalize only `mailto:` URLs, require one exact Contacts strong-email match, add person timeline back-link, and create a stub only at three distinct events. Ambiguity blocks linking.

- [ ] **Step 7: Run tests**

```bash
bun test test/apple-cold-start-calendar-reconcile.test.ts \
  test/apple-cold-start-calendar-mapper.test.ts
bun run typecheck
```

Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add src/core/apple-cold-start schemas/apple-cold-start fixtures/apple-cold-start test/apple-cold-start-*.test.ts
git commit -m "feat: deterministically stage validated Apple Calendar"
```

---

## Task 15: Build Deterministic Git Worktree Staging and Stage Plans

**Repository:** GBrain

**Files:**
- Create: `src/core/apple-cold-start/git-worktree.ts`
- Create: `src/core/apple-cold-start/stage-plan.ts`
- Create: `src/core/apple-cold-start/stage-runner.ts`
- Modify: `src/commands/apple-cold-start.ts`
- Create: `schemas/apple-cold-start/stage-plan-v1.schema.json`
- Create: `schemas/apple-cold-start/import-ledger-v1.schema.json`
- Test: `test/apple-cold-start-stage.test.ts`

**Interfaces:**
- Produces deterministic staged branch/commit, plan digest, review data, and no source-main mutation.

- [ ] **Step 1: Write failing deterministic stage tests**

Test same verification/base produces same plan ID/tree/commit; changed base produces different plan; dirty source/ref/remote refuses; ambiguity retained; no delete mutation; raw evidence copied; invalid Markdown blocks commit.

- [ ] **Step 2: Run tests and confirm failure**

```bash
bun test test/apple-cold-start-stage.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement fixed worktree and Git commands**

Use `/usr/bin/git` with argument arrays only. Create `apple-stage/<plan-id>`, generate exact mutations, stage exact paths, validate, and commit with fixed author/message/date. Record base and staged tree.

- [ ] **Step 4: Implement stage plan and import page**

Build sorted mutations, samples, counts, schema commit, identity versions, plan digest, and immutable `imports/<domain>/<manifest>.md`. Write private state atomically.

- [ ] **Step 5: Verify generated Markdown and hidden-state schemas**

Run existing parser validation for every indexed file and strict JSON validation for identity/ledger files. `git diff --check` and source boundary checks must pass before commit.

- [ ] **Step 6: Run tests**

```bash
bun test test/apple-cold-start-stage.test.ts
bun run typecheck
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add src/core/apple-cold-start src/commands/apple-cold-start.ts schemas/apple-cold-start test/apple-cold-start-stage.test.ts
git commit -m "feat: create deterministic Apple cold-start staging plans"
```

---

## Task 16: Render Review Evidence and Required Samples

**Repository:** GBrain

**Files:**
- Create: `src/core/apple-cold-start/review.ts`
- Modify: `src/commands/apple-cold-start.ts`
- Test: `test/apple-cold-start-review.test.ts`

**Interfaces:**
- Produces `review.md`, human summary, JSON summary, and full diff without changing approval state.

- [ ] **Step 1: Write failing sample-selection tests**

Contacts review must select up to five deterministic pages and one company when present. Calendar review must select timed, all-day, recurring, attendee-linked, and every ambiguity. Missing categories are reported as absent, not silently substituted.

- [ ] **Step 2: Write failing privacy tests**

Default review summary omits absolute paths and raw trust state. `--diff` may display staged Markdown because review is the explicit owner-facing content surface.

- [ ] **Step 3: Run tests and confirm failure**

```bash
bun test test/apple-cold-start-review.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Implement review renderer**

Verify plan and staged commit before every display. Write stable review Markdown containing plan digest, source/base/staged commits, counts, changed paths, sample paths, ambiguities, skipped reasons, and exact approval challenge.

- [ ] **Step 5: Run tests**

```bash
bun test test/apple-cold-start-review.test.ts
bun run typecheck
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add src/core/apple-cold-start/review.ts src/commands/apple-cold-start.ts test/apple-cold-start-review.test.ts
git commit -m "feat: render Gate D owner review evidence"
```

---

## Task 17: Require TTY-Only Exact-Digest Approval

**Repository:** GBrain

**Files:**
- Create: `src/core/apple-cold-start/approval.ts`
- Create: `schemas/apple-cold-start/approval-v1.schema.json`
- Modify: `src/commands/apple-cold-start.ts`
- Test: `test/apple-cold-start-approval.test.ts`

**Interfaces:**
- Produces one owner approval record bound to immutable plan/base/staged digests.

- [ ] **Step 1: Write failing bypass and mutation tests**

Cover non-TTY, piped stdin, wrong challenge, changed plan, changed staged commit, changed base, duplicate approval, JSON mode, and unknown flags.

- [ ] **Step 2: Run tests and confirm failure**

```bash
bun test test/apple-cold-start-approval.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement exact challenge**

Production reads from `/dev/tty`, never stdin. It prompts exactly:

```text
Type APPROVE <first-12-plan-digest> to authorize this staged commit:
```

No `--yes`, env, config, file, agent, or hidden bypass is accepted.

- [ ] **Step 4: Write approval atomically**

Record schema, plan ID/digest, base/staged commits, source ID, approved time, and GBrain version. Rehash plan and Git tree immediately before write.

- [ ] **Step 5: Run tests and boundary search**

```bash
bun test test/apple-cold-start-approval.test.ts
grep -R --line-number -- '--yes\|APPLE.*APPROVE\|approve.*env' src/core/apple-cold-start src/commands/apple-cold-start.ts && exit 1 || true
```

Expected: tests pass and no bypass pattern is found.

- [ ] **Step 6: Commit**

```bash
git add src/core/apple-cold-start/approval.ts src/commands/apple-cold-start.ts schemas/apple-cold-start test/apple-cold-start-approval.test.ts
git commit -m "security: require human Gate D plan approval"
```

---

## Task 18: Apply by Fast-Forward, Sync Explicitly, and Resume Safely

**Repository:** GBrain

**Files:**
- Create: `src/core/apple-cold-start/locks.ts`
- Create: `src/core/apple-cold-start/apply.ts`
- Modify: `src/core/db-lock.ts`
- Modify: `src/commands/apple-cold-start.ts`
- Create: `schemas/apple-cold-start/apply-receipt-v1.schema.json`
- Test: `test/apple-cold-start-apply.test.ts`

**Interfaces:**
- Produces fast-forward source commit, source-scoped sync, explicit link/timeline extraction, page verification, and resumable apply receipt.

- [ ] **Step 1: Write failing source-drift and idempotency tests**

Cover missing approval, changed plan, dirty main, base drift, non-fast-forward staged commit, existing remote, lock contention, first apply, repeated apply, sync failure after merge, resume success, and extraction failure.

- [ ] **Step 2: Run tests and confirm failure**

```bash
bun test test/apple-cold-start-apply.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Add dedicated DB and filesystem locks**

Add `APPLE_COLD_START_APPLY_LOCK_ID = 0x4150504c`. Create filesystem lock with `O_EXCL|O_NOFOLLOW`, owner-only mode, and no automatic stale deletion.

- [ ] **Step 4: Implement fast-forward apply**

Reverify approval/plan/Git state, run `/usr/bin/git merge --ff-only <stagedCommit>`, and refuse every dirty/drifted state. When main already equals staged commit, enter resume mode.

- [ ] **Step 5: Sync and extract explicitly**

Call `performSync` with `sourceId:'apple-cold-start'`, `noPull:true`, `noEmbed:true`, `noExtract:true`. Then call exported link and timeline extraction for planned slugs and treat errors as failures. Verify source-scoped pages exist.

- [ ] **Step 6: Write resumable receipt**

After merge and before sync, write `commit_applied_sync_pending`. After successful sync/extraction/page checks, atomically replace with `applied`. Repeated apply returns the existing success receipt.

- [ ] **Step 7: Run tests**

```bash
bun test test/apple-cold-start-apply.test.ts
bun run typecheck
```

Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add src/core/apple-cold-start src/core/db-lock.ts src/commands/apple-cold-start.ts schemas/apple-cold-start test/apple-cold-start-apply.test.ts
git commit -m "feat: apply Gate D plans through fast-forward and resumable sync"
```

---

## Task 19: Add Status, Retention, and Constrained Cleanup

**Repository:** GBrain

**Files:**
- Create: `src/core/apple-cold-start/status.ts`
- Create: `src/core/apple-cold-start/cleanup.ts`
- Modify: `src/commands/apple-cold-start.ts`
- Create: `schemas/apple-cold-start/cleanup-receipt-v1.schema.json`
- Test: `test/apple-cold-start-cleanup.test.ts`

**Interfaces:**
- Produces privacy-safe state summaries, permanent per-run retention flag, and constrained snapshot/handoff/worktree cleanup.

- [ ] **Step 1: Write failing containment and retention tests**

Cover outside inbox, symlinked run, changed manifest hash, unapplied fresh run, applied run, eight-day run, retained run, repeated cleanup, staged branch removal, and source-repo preservation.

- [ ] **Step 2: Run tests and confirm failure**

```bash
bun test test/apple-cold-start-cleanup.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement status state machine**

Return next allowed action among `enroll-validator`, `initialize-source`, `verify`, `stage`, `review`, `approve`, `apply`, `resume-sync`, `cleanup-eligible`, `retained`, or `complete`. Default output omits private paths and source values.

- [ ] **Step 4: Implement retain and cleanup**

`retain` writes one immutable owner-only flag. Cleanup defaults to dry-run, requires `--confirm` for deletion, revalidates realpath containment and hashes, removes only enrolled inbox run directories and private stage worktree/branch, and never touches source repo or Apple apps/data.

- [ ] **Step 5: Run tests**

```bash
bun test test/apple-cold-start-cleanup.test.ts
bun run typecheck
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add src/core/apple-cold-start src/commands/apple-cold-start.ts schemas/apple-cold-start test/apple-cold-start-cleanup.test.ts
git commit -m "feat: add Gate D status retention and safe cleanup"
```

---

## Task 20: Enforce Boundaries and Run Final Fictional Gate D Qualification

**Repositories:** both

**Files:**
- Create in GBrain: `scripts/check-apple-cold-start-boundary.sh`
- Create in GBrain: `scripts/verify-apple-cold-start-test-fixtures.ts`
- Create in GBrain: `scripts/qualify-apple-cold-start-gate-d.sh`
- Create in GBrain: `Qualification/AppleColdStartGateD/*`
- Modify in GBrain: `package.json`, `README.md`, `SECURITY.md`, `CHANGELOG.md`
- Complete in collectors: `Qualification/GateDValidator/gate-d-validator-report-<date>.md`
- Complete in GBrain: `Qualification/AppleColdStartGateD/gate-d-report-<date>.md`

**Interfaces:**
- Produces final Gate D evidence and PASS/FAIL decision; does not enable real data.

- [ ] **Step 1: Write the failing production-boundary scanner**

Implement the scaffolding allowlist/denylist and assert:

- no Apple frameworks or grants in GBrain Gate D roots;
- no model SDK imports;
- no MCP/HTTP/jobs exposure;
- no shell execution;
- only absolute `codesign`, `plutil`, and `git` child processes;
- no collector source changes;
- exact validator entitlements;
- no approval bypass.

Run:

```bash
bash scripts/check-apple-cold-start-boundary.sh
```

Expected: initially fail until every command/help/test allowlist is wired.

- [ ] **Step 2: Add full end-to-end fictional tests**

`apple-cold-start-gate-d-e2e.test.ts` uses isolated `GBRAIN_HOME`, temporary PGLite, fictional Gate B/C snapshots, valid handoffs, a fake inspected validator identity seam, and real Git worktrees. It verifies Contacts then Calendar stage/apply, links/back-links, rerun determinism, tampering, approval mutation, sync resume, and cleanup.

- [ ] **Step 3: Run all automated checks**

```bash
bun run typecheck
bun run test:apple-cold-start
bun run check:apple-cold-start
bun run verify
```

Expected: all pass with zero real Apple data.

- [ ] **Step 4: Build and verify final GBrain binary**

```bash
bun run build
./bin/gbrain apple-cold-start --help
./bin/gbrain --tools-json | grep -q apple-cold-start && exit 1 || true
```

Expected: local help exists; tools JSON contains no Gate D command.

- [ ] **Step 5: Run the final signed-validator qualification**

Use final Release validator from collectors `main`, real validator enrollment export, retained fictional Gate B/C snapshots, and exported fictional handoffs. Re-run retained snapshot validation and record exact hashes.

- [ ] **Step 6: Run Gate D Contacts workflow manually through the human approval checkpoint**

```bash
GBRAIN_HOME="$GATE_D_TEST_HOME" ./bin/gbrain apple-cold-start trust enroll-validator ...
GBRAIN_HOME="$GATE_D_TEST_HOME" ./bin/gbrain apple-cold-start source init
GBRAIN_HOME="$GATE_D_TEST_HOME" ./bin/gbrain apple-cold-start verify ...
GBRAIN_HOME="$GATE_D_TEST_HOME" ./bin/gbrain apple-cold-start stage --verification <verification-id>
GBRAIN_HOME="$GATE_D_TEST_HOME" ./bin/gbrain apple-cold-start review <plan-id> --diff
GBRAIN_HOME="$GATE_D_TEST_HOME" ./bin/gbrain apple-cold-start approve <plan-id>
GBRAIN_HOME="$GATE_D_TEST_HOME" ./bin/gbrain apple-cold-start apply <plan-id>
```

Use actual IDs printed by the preceding command. The owner performs enrollment and approval interactively. Do not script those responses.

- [ ] **Step 7: Run Gate D Calendar workflow and source comparison**

Repeat verify/stage/review/approve/apply with the fictional Gate C snapshot. Compare source tree, Markdown bytes, links, timeline entries, identity state, raw evidence hashes, and GBrain source-scoped pages to checked-in expected fixtures.

- [ ] **Step 8: Prove negative and recovery cases**

Run wrong validator, changed app, tampered handoff, post-validation record mutation, source drift, approval mutation, injected source text, sync-failure/resume, repeated apply, cleanup outside root, age cleanup, and retain cases. Each must produce the expected stable error and no unauthorized write.

- [ ] **Step 9: Prove deterministic rerun**

From the same source base and verified snapshots, rerun staging in a fresh private state root. Require identical indexed Markdown, hidden identity state, raw evidence, plan digest, Git tree, and staged commit. Receipt timestamps may differ only where the contract explicitly permits them; staged bytes may not.

- [ ] **Step 10: Complete Gate D report**

Record exact validator and GBrain commits/binary hashes, code identities, key fingerprints, schema lock, source commit, test counts, fixture hashes, OS/Xcode/Bun versions, boundary scans, positive/negative evidence, residual risks, and status. Status is `PASS` only if every contract acceptance item is evidenced.

- [ ] **Step 11: Commit implementation and checked-in report**

```bash
git add src test scripts schemas fixtures Qualification package.json README.md SECURITY.md CHANGELOG.md
git commit -m "feat: qualify Apple cold-start Gate D integrity and GBrain adapter"
```

Do not merge until independent code review confirms the plan, contract, source boundaries, and report. A merged Gate D implementation still does not authorize real data; that remains a separate owner decision after reviewing the Gate D evidence.