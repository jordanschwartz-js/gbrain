# Contacts Collector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and synthetically qualify a visible, sandboxed macOS Contacts Collector that exports only an explicitly approved Contacts scope into a deterministic, collector-signed snapshot, plus the minimum visible validator needed to enroll the collector and verify Gate B evidence.

**Architecture:** Create a new private repository, `jordanschwartz-js/cold-start-apple-collectors`, containing two separately signed macOS applications. `ContactsCollector.app` owns the Contacts permission, displays the effective scope, requires a fresh device-owner authentication, reads immutable `CNContact` records, and writes an atomic signed snapshot. `SnapshotValidator.app` has no Contacts permission; it visibly enrolls the collector's public key and code identity, then verifies signatures, request binding, paths, file hashes, schemas, and completion state before any record is parsed.

**Tech Stack:** Xcode 27.x, Swift 6 strict concurrency, SwiftUI, AppKit file panels, Contacts.framework, LocalAuthentication, CryptoKit/Secure Enclave, Security.framework, Foundation, XCTest/XCUITest, XcodeGen 2.46.0 as a pinned development-only project generator.

**Spec:** `docs/superpowers/specs/2026-08-18-cold-start-apple-reader-design.md`

## Global Constraints

- Implement this plan in a new private repository named `jordanschwartz-js/cold-start-apple-collectors`; the GBrain repository contains only this plan and the approved architecture.
- Gate B is Apple-Silicon-only. The production collector and validator require a qualified Secure Enclave signing key; there is no production software-key fallback.
- Use macOS 15.0 as the deployment floor, Swift language mode 6, complete concurrency checking, Automatic Signing, Apple Development signing for owner qualification, Hardened Runtime, and fixed bundle identifiers.
- Contacts Collector bundle identifier: `com.jordanschwartz.gbrain.coldstart.contacts`.
- Snapshot Validator bundle identifier: `com.jordanschwartz.gbrain.coldstart.validator`.
- Production Contacts Collector entitlements are exactly App Sandbox, Contacts, and user-selected read-write file access. It has no network, Apple Events, app-group, keychain-group, Full Disk Access, or Contacts-notes entitlement.
- Production Snapshot Validator entitlements are exactly App Sandbox and user-selected read-only file access. It has no Contacts or other personal-information entitlement and no network or Apple Events entitlement.
- No production CLI export mode, URL scheme, XPC service, daemon, LaunchAgent, background-only helper, arbitrary subprocess execution, arbitrary output path, raw SQL, or generic script execution.
- `CNContactNoteKey`, note content, contact image bytes, `CNMutableContact`, `CNSaveRequest`, and contact-group mutation are excluded from production code.
- Every export requires a visible frozen scope and a new `LAPolicy.deviceOwnerAuthentication` evaluation through a fresh `LAContext` with `touchIDAuthenticationAllowableReuseDuration = 0`.
- Every collector-produced completed snapshot is signed over the exact canonical manifest bytes using the collector's app-private P-256 key. `COMPLETE` is written last.
- All raw qualification data is fictional and deterministic. Do not sign into a personal Contacts account or admit real contacts before Gate B passes.
- No third-party runtime dependencies. XcodeGen is build tooling only, pinned to tag `2.46.0`, built from reviewed source, and excluded from shipped applications.
- General logs and public receipts contain no names, email addresses, phone numbers, postal addresses, organizations, contact identifiers, request payloads, or authentication details.
- A denied, limited, cancelled, failed, ambiguous, truncated, unsigned, invalidly signed, or incomplete run never appears as a successful complete empty export.
- Calendar, Mail, Messages, GBrain normalization, live sync, and real-data admission are outside this plan.

---

## Repository and File Map

The implementation repository must have this layout before feature work begins:

```text
cold-start-apple-collectors/
├── project.yml
├── ColdStartAppleCollectors.xcodeproj/
├── Config/
│   ├── Base.xcconfig
│   ├── Debug.xcconfig
│   ├── Release.xcconfig
│   └── Local.xcconfig.example
├── Tools/
│   └── XcodeGen.lock.json
├── Packages/
│   ├── SnapshotProtocol/
│   │   ├── Package.swift
│   │   ├── Sources/SnapshotProtocol/
│   │   │   ├── CollectorRequest.swift
│   │   │   ├── StrictRequestDecoder.swift
│   │   │   ├── CanonicalJSON.swift
│   │   │   ├── SnapshotModels.swift
│   │   │   ├── SnapshotPaths.swift
│   │   │   ├── AtomicFileWriter.swift
│   │   │   ├── NDJSONWriter.swift
│   │   │   └── SnapshotFileSet.swift
│   │   └── Tests/SnapshotProtocolTests/
│   ├── ContactsDomain/
│   │   ├── Package.swift
│   │   ├── Sources/ContactsDomain/
│   │   │   ├── ContactRecord.swift
│   │   │   ├── ContactValueModels.swift
│   │   │   ├── ContactIdentifierNormalizer.swift
│   │   │   ├── ContactHasher.swift
│   │   │   └── ContactReconciler.swift
│   │   └── Tests/ContactsDomainTests/
│   ├── ContactsCollectorFeature/
│   │   ├── Package.swift
│   │   ├── Sources/ContactsCollectorFeature/
│   │   │   ├── CollectorStage.swift
│   │   │   ├── ContactsCollectorModel.swift
│   │   │   ├── CollectorDependencies.swift
│   │   │   └── Views/
│   │   └── Tests/ContactsCollectorFeatureTests/
│   └── SnapshotValidatorKit/
│       ├── Package.swift
│       ├── Sources/SnapshotValidatorKit/
│       │   ├── CollectorTrustRecord.swift
│       │   ├── CollectorEnrollmentDocument.swift
│       │   ├── CodeIdentity.swift
│       │   ├── SnapshotVerification.swift
│       │   └── SnapshotVerifier.swift
│       └── Tests/SnapshotValidatorKitTests/
├── Apps/
│   ├── ContactsCollector/
│   │   ├── App/ContactsCollectorApp.swift
│   │   ├── Services/
│   │   │   ├── ContactsAuthorizationService.swift
│   │   │   ├── ContactsStoreService.swift
│   │   │   ├── ContactRecordMapper.swift
│   │   │   ├── SnapshotRootService.swift
│   │   │   ├── UserPresenceService.swift
│   │   │   ├── CollectorSigningKeyStore.swift
│   │   │   ├── CollectorCodeIdentityService.swift
│   │   │   └── ContactsSnapshotExporter.swift
│   │   └── Resources/
│   │       ├── Info.plist
│   │       └── ContactsCollector.entitlements
│   ├── ContactsCollectorTestHost/
│   │   ├── App/ContactsCollectorTestHostApp.swift
│   │   └── Resources/Info.plist
│   └── SnapshotValidator/
│       ├── App/SnapshotValidatorApp.swift
│       ├── Models/SnapshotValidatorModel.swift
│       ├── Services/
│       │   ├── ValidatorTrustStore.swift
│       │   ├── ValidatorCodeIdentityInspector.swift
│       │   ├── ValidatorUserPresenceService.swift
│       │   ├── ValidatorReceiptSigner.swift
│       │   └── SnapshotValidationService.swift
│       ├── Views/
│       │   ├── ValidatorHomeView.swift
│       │   ├── EnrollmentReviewView.swift
│       │   └── ValidationResultView.swift
│       └── Resources/
│           ├── Info.plist
│           └── SnapshotValidator.entitlements
├── Tests/
│   ├── ContactsCollectorTests/
│   ├── SnapshotValidatorTests/
│   └── ContactsCollectorUITests/
├── Fixtures/
│   ├── Requests/
│   ├── Contacts/
│   └── Crypto/
├── Qualification/Contacts/
│   ├── README.md
│   ├── synthetic-fixture-register.md
│   ├── gate-b-checklist.md
│   └── report-template.md
├── script/
│   ├── bootstrap_xcodegen.sh
│   ├── write_local_signing_config.sh
│   ├── generate_project.sh
│   ├── build_and_run.sh
│   ├── test_packages.sh
│   ├── test_apps.sh
│   ├── verify_project_shape.sh
│   ├── scan_forbidden_apis.sh
│   ├── inspect_entitlements.sh
│   ├── verify_release.sh
│   └── qualify_contacts.sh
├── .codex/environments/environment.toml
├── .github/workflows/ci.yml
├── .gitignore
├── LICENSE
├── NOTICE
├── README.md
├── SECURITY.md
└── UPSTREAM.md
```

## Authoritative Interfaces

Later tasks must use these names and signatures exactly.

```swift
// SnapshotProtocol
public enum CollectorDomain: String, Codable, Sendable { case contacts }

public struct CollectorLimits: Codable, Equatable, Sendable {
    public let maxRecords: Int
}

public struct CollectorWindow: Codable, Equatable, Sendable {
    public let start: String?
    public let end: String?
}

public struct CollectorRequest: Codable, Equatable, Sendable {
    public let schemaVersion: Int
    public let runId: UUID
    public let domain: CollectorDomain
    public let requestedAt: String
    public let window: CollectorWindow
    public let suggestedScopeIds: [String]
    public let limits: CollectorLimits
}

public enum StrictRequestDecoder {
    public static func decodeContactsRequest(from data: Data) throws -> CollectorRequest
}

public enum CanonicalJSON {
    public static func encode<T: Encodable>(_ value: T) throws -> Data
    public static func sha256Hex<T: Encodable>(_ value: T) throws -> String
}

public enum SnapshotStatus: String, Codable, Sendable {
    case complete, partial, unavailable, error, cancelled
}

public struct SnapshotContentFile: Codable, Equatable, Sendable {
    public let name: String
    public let byteLength: Int64
    public let sha256: String
}

public struct SnapshotManifest: Codable, Equatable, Sendable {
    public let schemaVersion: Int
    public let domainSchemaVersion: Int
    public let runId: UUID
    public let collector: CollectorDomain
    public let status: SnapshotStatus
    public let requestDigest: String
    public let effectiveScopeDigest: String
    public let collectorVersion: String
    public let codeIdentity: CodeIdentityClaim
    public let signingKeyFingerprint: String
    public let startedAt: String
    public let completedAt: String
    public let coverage: ContactsCoverage
    public let contentFiles: [SnapshotContentFile]
    public let hashesFileSha256: String
    public let warnings: [String]
    public let errorCount: Int
}
```

```swift
// ContactsDomain
public struct RawContactLocator: Codable, Hashable, Comparable, Sendable {
    public let containerIdentifier: String
    public let contactIdentifier: String
}

public struct StrongContactIdentifiers: Codable, Equatable, Sendable {
    public let emails: [String]
    public let phones: [String]
}

public struct ContactRecord: Codable, Equatable, Sendable {
    public let schemaVersion: Int
    public let identityMapVersion: Int
    public let snapshotRecordId: String
    public let rawLocators: [RawContactLocator]
    public let observedUnifiedIdentifier: String?
    public let contactType: ContactRecordType
    public let name: ContactName
    public let nickname: String?
    public let organization: ContactOrganization
    public let emails: [LabeledString]
    public let phones: [LabeledString]
    public let postalAddresses: [LabeledPostalAddress]
    public let urls: [LabeledString]
    public let birthday: ContactDateComponents?
    public let dates: [LabeledDateComponents]
    public let relations: [LabeledString]
    public let socialProfiles: [ContactSocialProfile]
    public let instantMessages: [ContactInstantMessage]
    public let hasImage: Bool
    public let notesStatus: ContactNotesStatus
    public let strongIdentifiers: StrongContactIdentifiers
    public let contentHash: String
}

public enum ContactIdentifierNormalizer {
    public static func email(_ value: String) -> String?
    public static func strongPhone(_ value: String) -> String?
}

public enum ContactHasher {
    public static func snapshotRecordId(rawLocators: [RawContactLocator]) -> String
    public static func contentHash(for payload: ContactRecordHashPayload) throws -> String
}

public enum ContactReconciler {
    public static func reconcile(
        current: ContactRecord,
        against previous: [ContactRecord]
    ) -> ContactReconciliationOutcome
}
```

```swift
// Live-service seams
public protocol ContactsAuthorizing: Sendable {
    func status() -> ContactsAuthorizationState
    func requestAccess() async throws -> ContactsAuthorizationState
}

public protocol ContactsContainerListing: Sendable {
    func listContainers() async throws -> [ContactContainerSummary]
}

public protocol ContactsReading: Sendable {
    func readRawCards(
        containerIdentifiers: [String],
        maximumRecordCount: Int
    ) async throws -> RawContactsReadResult
}

public protocol UserPresenceAuthorizing: Sendable {
    func authorize(frozenRequest: FrozenContactsRequest) async throws -> AuthorizedContactsRun
}

public protocol SnapshotRootSelecting: Sendable {
    func selectOrResolveRoot() async throws -> AuthorizedSnapshotRoot
}

public protocol SnapshotSigning: Sendable {
    var publicKeyDER: Data { get async throws }
    var fingerprint: String { get async throws }
    func sign(_ data: Data, context: LAContext) async throws -> Data
}

public protocol CodeIdentityReading: Sendable {
    func currentIdentity() throws -> CodeIdentityClaim
}
```

---

### Task 1: Create the Minimal Private Repository and Deterministic Xcode Project

**Files:**
- Create every top-level path listed in the Repository and File Map.
- Create: `project.yml`
- Create: `Config/Base.xcconfig`
- Create: `Config/Debug.xcconfig`
- Create: `Config/Release.xcconfig`
- Create: `Apps/ContactsCollector/Resources/ContactsCollector.entitlements`
- Create: `Apps/SnapshotValidator/Resources/SnapshotValidator.entitlements`
- Create: `script/bootstrap_xcodegen.sh`
- Create: `script/write_local_signing_config.sh`
- Create: `script/generate_project.sh`
- Create: `script/build_and_run.sh`
- Test: `script/verify_project_shape.sh`

**Interfaces:**
- Produces build schemes `ContactsCollector`, `ContactsCollectorTestHost`, `SnapshotValidator`, and all unit/UI test targets.
- Produces one project-local build/run entry point at `./script/build_and_run.sh`.

- [ ] **Step 1: Initialize the private repository and branch**

```bash
gh repo create jordanschwartz-js/cold-start-apple-collectors --private --clone
cd cold-start-apple-collectors
git switch -c feature/contacts-collector
git config pull.ff only
mkdir -p Config Tools Packages Apps Tests Fixtures Qualification/Contacts script .codex/environments .github/workflows
```

Expected: `gh repo view --json visibility -q .visibility` prints `PRIVATE`.

- [ ] **Step 2: Write the failing project-shape check**

Create `script/verify_project_shape.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

required=(
  project.yml
  Config/Base.xcconfig
  Apps/ContactsCollector/Resources/ContactsCollector.entitlements
  Apps/SnapshotValidator/Resources/SnapshotValidator.entitlements
  ColdStartAppleCollectors.xcodeproj/project.pbxproj
  script/build_and_run.sh
  .codex/environments/environment.toml
)
for path in "${required[@]}"; do
  [[ -e "$path" ]] || { echo "missing: $path" >&2; exit 1; }
done

xcodebuild -project ColdStartAppleCollectors.xcodeproj -list \
  | grep -q 'ContactsCollector'
xcodebuild -project ColdStartAppleCollectors.xcodeproj -list \
  | grep -q 'SnapshotValidator'
```

Run:

```bash
chmod +x script/verify_project_shape.sh
./script/verify_project_shape.sh
```

Expected: FAIL with `missing: project.yml`.

- [ ] **Step 3: Pin XcodeGen 2.46.0 from reviewed source**

Create `script/bootstrap_xcodegen.sh` so it clones exactly tag `2.46.0`, records the resolved full commit and built binary hash in `Tools/XcodeGen.lock.json`, and refuses a later mismatch:

```bash
#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CACHE="$ROOT/.tools/xcodegen-2.46.0"
BIN="$CACHE/.build/release/xcodegen"
LOCK="$ROOT/Tools/XcodeGen.lock.json"

if [[ ! -d "$CACHE/.git" ]]; then
  git clone --branch 2.46.0 --depth 1 https://github.com/yonaskolb/XcodeGen.git "$CACHE"
fi
resolved_commit="$(git -C "$CACHE" rev-parse HEAD)"
git -C "$CACHE" describe --tags --exact-match | grep -qx '2.46.0'
swift build --package-path "$CACHE" -c release --product xcodegen
binary_hash="$(shasum -a 256 "$BIN" | awk '{print $1}')"

if [[ -f "$LOCK" ]]; then
  python3 - "$LOCK" "$resolved_commit" "$binary_hash" <<'PY'
import json, sys
lock = json.load(open(sys.argv[1]))
assert lock["tag"] == "2.46.0"
assert lock["commit"] == sys.argv[2]
assert lock["binarySha256"] == sys.argv[3]
PY
else
  python3 - "$LOCK" "$resolved_commit" "$binary_hash" <<'PY'
import json, sys
payload = {
  "repository": "https://github.com/yonaskolb/XcodeGen",
  "tag": "2.46.0",
  "commit": sys.argv[2],
  "binarySha256": sys.argv[3]
}
open(sys.argv[1], "w").write(json.dumps(payload, sort_keys=True, indent=2) + "\n")
PY
fi
printf '%s\n' "$BIN"
```

Run it once, inspect the resolved commit and hash, then commit the lock file. Do not accept a moved tag silently.

- [ ] **Step 4: Create exact build configuration files**

Create `Config/Base.xcconfig`:

```xcconfig
MACOSX_DEPLOYMENT_TARGET = 15.0
SWIFT_VERSION = 6.0
SWIFT_STRICT_CONCURRENCY = complete
ENABLE_HARDENED_RUNTIME = YES
CODE_SIGN_STYLE = Automatic
DEVELOPMENT_TEAM = $(GBRAIN_DEVELOPMENT_TEAM)
CODE_SIGN_INJECT_BASE_ENTITLEMENTS = NO
CLANG_ENABLE_MODULES = YES
CURRENT_PROJECT_VERSION = 1
MARKETING_VERSION = 0.1.0
```

Create `Config/Debug.xcconfig`:

```xcconfig
#include "Base.xcconfig"
SWIFT_ACTIVE_COMPILATION_CONDITIONS = DEBUG
ENABLE_TESTABILITY = YES
```

Create `Config/Release.xcconfig`:

```xcconfig
#include "Base.xcconfig"
SWIFT_COMPILATION_MODE = wholemodule
SWIFT_OPTIMIZATION_LEVEL = -O
ENABLE_TESTABILITY = NO
GCC_GENERATE_DEBUGGING_SYMBOLS = YES
DEBUG_INFORMATION_FORMAT = dwarf-with-dsym
```

Create `Config/Local.xcconfig.example` containing one commented example line, add `Config/Local.xcconfig` to `.gitignore`, and create `script/write_local_signing_config.sh` that fails unless exactly one `Apple Development` identity is selected or `GBRAIN_DEVELOPMENT_TEAM` is already supplied.

- [ ] **Step 5: Define deterministic Xcode targets in `project.yml`**

Use XcodeGen with these target boundaries:

```yaml
name: ColdStartAppleCollectors
options:
  createIntermediateGroups: true
  deploymentTarget:
    macOS: "15.0"
configs:
  Debug: debug
  Release: release
configFiles:
  Debug: Config/Debug.xcconfig
  Release: Config/Release.xcconfig
packages:
  SnapshotProtocol:
    path: Packages/SnapshotProtocol
  ContactsDomain:
    path: Packages/ContactsDomain
  ContactsCollectorFeature:
    path: Packages/ContactsCollectorFeature
  SnapshotValidatorKit:
    path: Packages/SnapshotValidatorKit
targets:
  ContactsCollector:
    type: application
    platform: macOS
    sources: [Apps/ContactsCollector]
    info:
      path: Apps/ContactsCollector/Resources/Info.plist
    entitlements:
      path: Apps/ContactsCollector/Resources/ContactsCollector.entitlements
    settings:
      base:
        PRODUCT_BUNDLE_IDENTIFIER: com.jordanschwartz.gbrain.coldstart.contacts
        PRODUCT_NAME: ContactsCollector
    dependencies:
      - package: SnapshotProtocol
      - package: ContactsDomain
      - package: ContactsCollectorFeature
      - sdk: Contacts.framework
      - sdk: LocalAuthentication.framework
      - sdk: Security.framework
  ContactsCollectorTestHost:
    type: application
    platform: macOS
    sources: [Apps/ContactsCollectorTestHost]
    info:
      path: Apps/ContactsCollectorTestHost/Resources/Info.plist
    settings:
      base:
        PRODUCT_BUNDLE_IDENTIFIER: com.jordanschwartz.gbrain.coldstart.contacts.testhost
        PRODUCT_NAME: ContactsCollectorTestHost
        CODE_SIGNING_ALLOWED: NO
    dependencies:
      - package: SnapshotProtocol
      - package: ContactsDomain
      - package: ContactsCollectorFeature
  SnapshotValidator:
    type: application
    platform: macOS
    sources: [Apps/SnapshotValidator]
    info:
      path: Apps/SnapshotValidator/Resources/Info.plist
    entitlements:
      path: Apps/SnapshotValidator/Resources/SnapshotValidator.entitlements
    settings:
      base:
        PRODUCT_BUNDLE_IDENTIFIER: com.jordanschwartz.gbrain.coldstart.validator
        PRODUCT_NAME: SnapshotValidator
    dependencies:
      - package: SnapshotProtocol
      - package: SnapshotValidatorKit
      - sdk: LocalAuthentication.framework
      - sdk: Security.framework
```

Add unit and UI test targets in the same file. UI tests target `ContactsCollectorTestHost`, never the production app through launch flags.

- [ ] **Step 6: Create honest Info.plist and minimal entitlements**

`ContactsCollector.entitlements` must contain only:

```xml
<dict>
  <key>com.apple.security.app-sandbox</key><true/>
  <key>com.apple.security.personal-information.addressbook</key><true/>
  <key>com.apple.security.files.user-selected.read-write</key><true/>
</dict>
```

`SnapshotValidator.entitlements` must contain only:

```xml
<dict>
  <key>com.apple.security.app-sandbox</key><true/>
  <key>com.apple.security.files.user-selected.read-only</key><true/>
</dict>
```

The Contacts usage string is:

```text
GBrain Contacts Collector reads only the contacts and contact accounts you approve to create a local snapshot. It never edits your contacts.
```

Register the filename extension `gbrain-contacts-request` as a viewer document type. Do not register a custom URL scheme.

- [ ] **Step 7: Add the one-script build/run loop**

`script/build_and_run.sh` must support `run`, `--debug`, `--logs`, `--telemetry`, and `--verify`; use `xcodebuild`, a deterministic DerivedData path, and `/usr/bin/open -n` on the built `.app`. Default to `ContactsCollector`; allow `APP_TARGET=SnapshotValidator` only as a developer shell variable in the build script, not as behavior inside either production app.

Create `.codex/environments/environment.toml`:

```toml
# THIS IS AUTOGENERATED. DO NOT EDIT MANUALLY
version = 1
name = "cold-start-apple-collectors"

[setup]
script = ""

[[actions]]
name = "Run"
icon = "run"
command = "./script/build_and_run.sh"
```

- [ ] **Step 8: Generate, build, verify, and commit**

```bash
./script/bootstrap_xcodegen.sh
./script/generate_project.sh
./script/write_local_signing_config.sh
./script/verify_project_shape.sh
xcodebuild -project ColdStartAppleCollectors.xcodeproj \
  -scheme ContactsCollector -configuration Debug \
  -derivedDataPath build/DerivedData build
git add .
git commit -m "build: scaffold Contacts collector and validator apps"
```

Expected: project-shape check and Debug build pass; neither app performs an Apple read yet.

---

### Task 2: Implement Strict Contacts Request Decoding and Canonical JSON

**Files:**
- Create: `Packages/SnapshotProtocol/Package.swift`
- Create: `Packages/SnapshotProtocol/Sources/SnapshotProtocol/CollectorRequest.swift`
- Create: `Packages/SnapshotProtocol/Sources/SnapshotProtocol/StrictRequestDecoder.swift`
- Create: `Packages/SnapshotProtocol/Sources/SnapshotProtocol/CanonicalJSON.swift`
- Test: `Packages/SnapshotProtocol/Tests/SnapshotProtocolTests/CollectorRequestTests.swift`
- Test: `Packages/SnapshotProtocol/Tests/SnapshotProtocolTests/CanonicalJSONTests.swift`
- Fixture: `Fixtures/Requests/contacts-valid.gbrain-contacts-request`

**Interfaces:**
- Produces `CollectorRequest`, `StrictRequestDecoder.decodeContactsRequest(from:)`, and deterministic `CanonicalJSON` bytes used by every later signature and digest.

- [ ] **Step 1: Write strict-decoding failures first**

Test unknown keys, wrong domain, non-null Contacts window, schema other than `1`, malformed RFC 3339 `requestedAt`, empty or invalid UUID, and `maxRecords` outside `1...100000`.

```swift
@Test func rejectsUnknownTopLevelField() throws {
    let data = Data(#"{"schemaVersion":1,"runId":"11111111-1111-1111-1111-111111111111","domain":"contacts","requestedAt":"2026-08-18T20:00:00.000Z","window":{"start":null,"end":null},"suggestedScopeIds":[],"limits":{"maxRecords":100},"command":"export"}"#.utf8)
    #expect(throws: RequestDecodingError.self) {
        try StrictRequestDecoder.decodeContactsRequest(from: data)
    }
}
```

Run `swift test --package-path Packages/SnapshotProtocol`; expected failure because the decoder does not exist.

- [ ] **Step 2: Implement exact-key decoding**

Use private `Decodable` wire structs with `CodingKeys`, then separately parse the JSON object and compare its key sets at every nesting level. Do not depend on normal `Decodable` behavior because it ignores unknown keys.

The valid fixture must decode to:

```json
{
  "schemaVersion": 1,
  "runId": "11111111-1111-1111-1111-111111111111",
  "domain": "contacts",
  "requestedAt": "2026-08-18T20:00:00.000Z",
  "window": {"start": null, "end": null},
  "suggestedScopeIds": [],
  "limits": {"maxRecords": 100000}
}
```

- [ ] **Step 3: Write canonical-byte golden tests**

The exact canonical bytes for the fixture are one line with lexicographically sorted object keys, no whitespace, forward slashes unescaped, and the original fixed-millisecond timestamp string. Assert the complete UTF-8 string and its SHA-256.

- [ ] **Step 4: Implement `CanonicalJSON`**

Configure one `JSONEncoder` with `.sortedKeys` and `.withoutEscapingSlashes`. All signed protocol types use strings for timestamps, integers for counts, and no floating-point fields. Reject NaN/infinity by construction. Add a decoding round trip and golden test so a future encoder change breaks CI before changing signatures.

- [ ] **Step 5: Run and commit**

```bash
swift test --package-path Packages/SnapshotProtocol
git add Packages/SnapshotProtocol Fixtures/Requests
git commit -m "feat: add strict contacts requests and canonical JSON"
```

---

### Task 3: Implement the Fixed Snapshot File Protocol and Atomic Writers

**Files:**
- Create: `Packages/SnapshotProtocol/Sources/SnapshotProtocol/SnapshotModels.swift`
- Create: `Packages/SnapshotProtocol/Sources/SnapshotProtocol/SnapshotPaths.swift`
- Create: `Packages/SnapshotProtocol/Sources/SnapshotProtocol/AtomicFileWriter.swift`
- Create: `Packages/SnapshotProtocol/Sources/SnapshotProtocol/NDJSONWriter.swift`
- Create: `Packages/SnapshotProtocol/Sources/SnapshotProtocol/SnapshotFileSet.swift`
- Test: `Packages/SnapshotProtocol/Tests/SnapshotProtocolTests/SnapshotFileSetTests.swift`

**Interfaces:**
- Produces the fixed seven-file collector protocol and safe filesystem primitives used by the exporter and validator.

- [ ] **Step 1: Write failing path and mode tests**

Tests must prove:

- only simple fixed filenames are accepted;
- run directories are `0700` and files `0600`;
- temporary files stay inside the run directory;
- symlink parents and existing `COMPLETE` are rejected;
- `COMPLETE` cannot be written before the manifest and signature exist;
- `hashes.sha256` is sorted by filename and ends in a newline.

- [ ] **Step 2: Implement fixed names and safe relative paths**

```swift
public enum SnapshotFilename: String, CaseIterable, Sendable {
    case privateManifest = "private-manifest.json"
    case publicReceipt = "public-receipt.json"
    case records = "records.ndjson"
    case errors = "errors.ndjson"
    case hashes = "hashes.sha256"
    case signature = "snapshot.sig"
    case complete = "COMPLETE"
}
```

`SnapshotPaths` joins only these enum values beneath a validated run root. It never accepts a filename from source data or a request.

- [ ] **Step 3: Implement atomic writes**

Open files using Darwin `open` with `O_CREAT | O_EXCL | O_WRONLY | O_NOFOLLOW`, mode `0600`; write all bytes, call `fsync`, close, and atomically rename a generated temporary name to the fixed final name. Create directories with mode `0700`, verify owner UID equals `getuid()`, and reject symlinks with `lstat`.

- [ ] **Step 4: Implement deterministic NDJSON and content descriptors**

`NDJSONWriter` canonical-encodes each record and appends exactly one newline. `SnapshotFileSet` returns byte length and SHA-256 for `public-receipt.json`, `records.ndjson`, and `errors.ndjson`; then writes the human-readable sorted hash list.

- [ ] **Step 5: Test interruption semantics**

Simulate failures after each file. No simulation may leave `COMPLETE`. A later retry must use a new staging directory and must not append to the failed one.

- [ ] **Step 6: Run and commit**

```bash
swift test --package-path Packages/SnapshotProtocol
git add Packages/SnapshotProtocol
git commit -m "feat: add atomic signed-snapshot file protocol"
```

---

### Task 4: Define Deterministic Contact Records and Conservative Reconciliation

**Files:**
- Create: `Packages/ContactsDomain/Package.swift`
- Create: `Packages/ContactsDomain/Sources/ContactsDomain/ContactValueModels.swift`
- Create: `Packages/ContactsDomain/Sources/ContactsDomain/ContactRecord.swift`
- Create: `Packages/ContactsDomain/Sources/ContactsDomain/ContactIdentifierNormalizer.swift`
- Create: `Packages/ContactsDomain/Sources/ContactsDomain/ContactHasher.swift`
- Create: `Packages/ContactsDomain/Sources/ContactsDomain/ContactReconciler.swift`
- Test: `Packages/ContactsDomain/Tests/ContactsDomainTests/ContactIdentifierNormalizerTests.swift`
- Test: `Packages/ContactsDomain/Tests/ContactsDomainTests/ContactHasherTests.swift`
- Test: `Packages/ContactsDomain/Tests/ContactsDomainTests/ContactReconcilerTests.swift`

**Interfaces:**
- Produces canonical `ContactRecord` values and cross-run reconciliation outcomes. No file in this package imports Contacts.framework.

- [ ] **Step 1: Write normalization tests**

Email normalization is trim, Unicode NFC, and locale-independent lowercase only. Do not strip Gmail dots or plus aliases. Strong phone normalization accepts only an explicit `+` followed by 8 to 15 digits after removing spaces, parentheses, and hyphens. National-format numbers remain preserved raw but are not strong match keys.

```swift
@Test func phoneWithoutCountryCodeIsNotStrong() {
    #expect(ContactIdentifierNormalizer.strongPhone("(514) 555-0100") == nil)
}
```

- [ ] **Step 2: Implement complete value models**

Model date components as calendar identifier plus optional era/year/month/day; do not convert birthdays or labeled dates into UTC timestamps. Preserve raw label identifiers, not locale-dependent localized labels, in canonical records.

- [ ] **Step 3: Write deterministic identity tests**

`snapshotRecordId` is SHA-256 over:

```text
contacts-v1\n
<container-id>\0<raw-contact-id>\n
...
```

with raw locators sorted lexicographically. Reordering raw cards must not change the ID. Changing either identifier must change it.

- [ ] **Step 4: Implement content hashing**

Build `ContactRecordHashPayload` without the `contentHash` field, canonical-encode it, and hash those bytes. Sort all multi-value arrays deterministically by raw label identifier then canonical value.

- [ ] **Step 5: Write fail-closed reconciliation tests**

Cover exact raw-set match, one exact raw overlap, one unique strong email/phone match, duplicated strong identifiers across two prior records, duplicate display names, and organization-only similarity. Names and organizations alone must return `.ambiguous` or `.newRecord`, never `.matched`.

- [ ] **Step 6: Implement `ContactReconciler` in the locked order**

```swift
public enum ContactReconciliationOutcome: Equatable, Sendable {
    case exact(previousRecordId: String)
    case locatorTransition(previousRecordId: String, added: [RawContactLocator], removed: [RawContactLocator])
    case strongIdentifierTransition(previousRecordId: String)
    case newRecord
    case ambiguous(candidateRecordIds: [String], reason: ContactAmbiguityReason)
}
```

Do not choose the first candidate after any collision.

- [ ] **Step 7: Run and commit**

```bash
swift test --package-path Packages/ContactsDomain
git add Packages/ContactsDomain
git commit -m "feat: add deterministic contact identity model"
```

---

### Task 5: Implement Contacts Authorization and Container Inventory

**Files:**
- Create: `Apps/ContactsCollector/Services/ContactsAuthorizationService.swift`
- Create: `Apps/ContactsCollector/Services/ContactsStoreService.swift`
- Test: `Tests/ContactsCollectorTests/ContactsAuthorizationServiceTests.swift`
- Test: `Tests/ContactsCollectorTests/ContactsContainerListingTests.swift`

**Interfaces:**
- Produces live `ContactsAuthorizing` and `ContactsContainerListing` implementations.
- Produces `ContactsAuthorizationState` with explicit `.limited` and `.unknown` cases.

- [ ] **Step 1: Write authorization-state tests against an injected adapter**

```swift
public enum ContactsAuthorizationState: String, Codable, Sendable {
    case notDetermined, denied, restricted, authorized, limited, unknown
}
```

Tests prove service initialization never prompts, `requestAccess()` is the only prompting method, limited remains limited, and unknown does not become authorized.

- [ ] **Step 2: Implement `ContactsAuthorizationService`**

Map `CNContactStore.authorizationStatus(for: .contacts)` exhaustively, including availability-gated `.limited` and `@unknown default`. Call `requestAccess(for: .contacts)` only from the explicit UI action. Return the post-request status rather than trusting the callback boolean alone.

- [ ] **Step 3: Move all Contacts.framework work to a dedicated actor**

```swift
actor ContactsStoreActor {
    private let store: CNContactStore
    init(store: CNContactStore = CNContactStore()) { self.store = store }
}
```

No synchronous Contacts fetch runs on the main actor.

- [ ] **Step 4: Implement container listing**

Return stable container identifier, title, and mapped type. Sort by title then identifier. A Contacts error is thrown as `ContactsSourceError.unavailable`; an empty successful list is a valid empty result only when authorization is authorized or limited.

- [ ] **Step 5: Add limited-authorization outcome tests**

When status is limited, container inventory may be incomplete. The eventual snapshot status must be `partial`, and coverage must include `authorization: limited`. Do not prompt repeatedly or claim completeness.

- [ ] **Step 6: Run and commit**

```bash
./script/test_apps.sh --only ContactsCollectorTests
git add Apps/ContactsCollector/Services Tests/ContactsCollectorTests
git commit -m "feat: add Contacts authorization and container inventory"
```

---

### Task 6: Implement Raw Source-Card Reads and Raw-to-Unified Grouping

**Files:**
- Modify: `Apps/ContactsCollector/Services/ContactsStoreService.swift`
- Test: `Tests/ContactsCollectorTests/ContactsRawReadTests.swift`
- Fixture: `Fixtures/Contacts/raw-read-fixture.json`

**Interfaces:**
- Produces `ContactsReading.readRawCards(containerIdentifiers:maximumRecordCount:)`.
- Returns `RawContactsReadResult` containing raw cards, raw-to-unified locator observations, total observed count, truncation, warnings, and per-card errors.

- [ ] **Step 1: Write key-set and request-shape tests**

The production fetch key set includes identifier, contact type, formatter descriptor, names, nickname, organization, department, job title, email addresses, phone numbers, postal addresses, URLs, birthday, non-Gregorian birthday, labeled dates, contact relations, social profiles, instant-message addresses, and `imageDataAvailable` only.

Tests fail if the set contains `CNContactNoteKey`, `CNContactImageDataKey`, or `CNContactThumbnailImageDataKey`.

- [ ] **Step 2: Implement one raw fetch per approved container**

For each exact container identifier:

```swift
let request = CNContactFetchRequest(keysToFetch: Self.readKeys)
request.predicate = CNContact.predicateForContactsInContainer(withIdentifier: containerId)
request.unifyResults = false
request.mutableObjects = false
request.sortOrder = .userDefault
```

Stop after `maximumRecordCount + 1` raw cards across the whole approved scope. If the extra card is observed, discard it from records and report `truncated = true` with `status = partial`.

- [ ] **Step 3: Implement raw-to-unified observation without discarding raw cards**

For each raw identifier, call `unifiedContact(withIdentifier:keysToFetch:)`. Record the unified identifier returned. Group raw cards that produce the same observed unified identifier, but preserve every raw locator. A failed unified fetch leaves the raw card as a standalone logical record and adds a warning; it never drops the raw card.

- [ ] **Step 4: Write linked-card and failure tests using protocol fakes**

Prove two raw cards from different containers can form one logical record while keeping two locators. Prove a unified lookup failure produces one record plus an error/warning rather than zero records.

- [ ] **Step 5: Run and commit**

```bash
./script/test_apps.sh --only ContactsCollectorTests
 git add Apps/ContactsCollector/Services/ContactsStoreService.swift Tests/ContactsCollectorTests Fixtures/Contacts
 git commit -m "feat: read raw Contacts cards with unified observations"
```

---

### Task 7: Map CNContact Values into Stable ContactRecord NDJSON

**Files:**
- Create: `Apps/ContactsCollector/Services/ContactRecordMapper.swift`
- Test: `Tests/ContactsCollectorTests/ContactRecordMapperTests.swift`
- Fixture: `Fixtures/Contacts/contact-record-golden.ndjson`

**Interfaces:**
- Produces `ContactRecordMapper.map(group:) throws -> ContactRecord`.

- [ ] **Step 1: Write full-field mapping tests**

Use fake immutable source-card values covering all V1 fields. Assert:

- raw label identifiers are preserved;
- arrays are sorted deterministically;
- birthday and labeled dates preserve date components and calendar identifiers;
- `hasImage` is a boolean only;
- `notesStatus == .excludedByDesign` even when the synthetic source fixture declares that a note exists;
- no note or image bytes appear in encoded JSON.

- [ ] **Step 2: Implement deterministic source precedence**

For merged user-facing fields, sort raw cards by `RawContactLocator` and choose the first non-empty scalar consistently. Union multi-value fields and deduplicate exact canonical values. Keep the complete raw-locator set so source precedence never erases provenance.

- [ ] **Step 3: Implement exact canonical record ordering**

The exporter sorts logical records by `snapshotRecordId`; the mapper sorts every nested array. Assert two source arrays in opposite orders produce byte-identical `CanonicalJSON` output.

- [ ] **Step 4: Add the golden NDJSON fixture**

Commit only fictional names, domains, addresses, and phone numbers reserved for examples. The fixture must contain `alice@example.test`, `+15550101001`, and `Acme Example Ltd`, not a real person or company.

- [ ] **Step 5: Run and commit**

```bash
./script/test_apps.sh --only ContactsCollectorTests
shasum -a 256 Fixtures/Contacts/contact-record-golden.ndjson
git add Apps/ContactsCollector/Services/ContactRecordMapper.swift Tests/ContactsCollectorTests Fixtures/Contacts
git commit -m "feat: map Contacts records deterministically"
```

---

### Task 8: Build the Visible Request and Scope-Review UI Without an Export Path Yet

**Files:**
- Create: `Packages/ContactsCollectorFeature/Package.swift`
- Create: `Packages/ContactsCollectorFeature/Sources/ContactsCollectorFeature/CollectorStage.swift`
- Create: `Packages/ContactsCollectorFeature/Sources/ContactsCollectorFeature/CollectorDependencies.swift`
- Create: `Packages/ContactsCollectorFeature/Sources/ContactsCollectorFeature/ContactsCollectorModel.swift`
- Create focused files under: `Packages/ContactsCollectorFeature/Sources/ContactsCollectorFeature/Views/`
- Create: `Apps/ContactsCollector/App/ContactsCollectorApp.swift`
- Create: `Apps/ContactsCollectorTestHost/App/ContactsCollectorTestHostApp.swift`
- Test: `Packages/ContactsCollectorFeature/Tests/ContactsCollectorFeatureTests/ContactsCollectorModelTests.swift`
- Test: `Tests/ContactsCollectorUITests/ContactsCollectorUITests.swift`

**Interfaces:**
- Produces visible stages `.noRequest`, `.invalidRequest`, `.permissionReview`, `.scopeReview`, `.readyForAuthentication`, `.exporting`, `.completed`, and `.failed`.
- Produces no actual export in this task.

- [ ] **Step 1: Write model transition tests**

Opening a valid request moves to permission review, never exporting. Unknown fields move to invalid request. Permission denial moves to a truthful denied screen. Limited access moves to a partial-coverage warning. Selecting zero containers disables Continue.

- [ ] **Step 2: Implement dependency-injected feature state**

The feature package depends only on protocols. The production app injects live services. `ContactsCollectorTestHost` injects fictional containers, fake authorization, fake root selection, and fake authentication. No launch argument or environment variable is read by the production app.

- [ ] **Step 3: Implement the macOS window flow**

Use one regular `WindowGroup`. Keep views small and stage-specific. The scope review lists containers with checkboxes, title, and type; it never lists contact names before export. Show the exact requested maximum record count and state that count/completeness is local to this Mac.

- [ ] **Step 4: Handle request documents safely**

Register the request extension and use `.onOpenURL` for file URLs. Also provide a visible Open Request button using `NSOpenPanel`. Opening a request populates UI only. Do not parse command-line arguments and do not accept non-file URLs.

- [ ] **Step 5: Add UI accessibility identifiers and no-auto-export test**

Use identifiers `request.open`, `permission.request`, `scope.container.<hashed-test-id>`, `scope.continue`, `export.authenticate`, and `export.status`. The UI test opens a fixture in the test host, clicks through scope review, and proves no `COMPLETE` file exists because authentication/export has not been supplied.

- [ ] **Step 6: Run and commit**

```bash
swift test --package-path Packages/ContactsCollectorFeature
./script/test_apps.sh --only ContactsCollectorUITests
git add Packages/ContactsCollectorFeature Apps/ContactsCollector Apps/ContactsCollectorTestHost Tests/ContactsCollectorUITests
git commit -m "feat: add visible Contacts scope-review flow"
```

---

### Task 9: Constrain the User-Selected Snapshot Root and Persist a Security-Scoped Bookmark

**Files:**
- Create: `Apps/ContactsCollector/Services/SnapshotRootService.swift`
- Test: `Tests/ContactsCollectorTests/SnapshotRootServiceTests.swift`

**Interfaces:**
- Produces `AuthorizedSnapshotRoot` with resolved standardized URL, active security scope, bookmark version, and validation receipt.

- [ ] **Step 1: Write root rejection tests**

Reject:

- non-file URLs;
- symlinks;
- volumes where `volumeIsLocal == false`;
- any root inside an ancestor containing `.git`;
- paths beneath `~/Library/Mobile Documents`, `~/Library/CloudStorage`, `~/Dropbox`, `~/Google Drive`, or `~/OneDrive`;
- roots not owned by `getuid()`;
- roots whose POSIX mode is not exactly `0700`;
- stale bookmarks.

- [ ] **Step 2: Implement visible directory selection using AppKit**

Use `NSOpenPanel` configured for one directory, no files, no directory creation by the app, and no aliases. The suggested path is `~/.gbrain/apple-cold-start-inbox`; the user must select it. The collector does not take an output path from the request.

- [ ] **Step 3: Create and resolve an app-scoped security-scoped bookmark**

Use bookmark creation and resolution options with security scope. Store bookmark data in the collector's sandboxed `UserDefaults`. On use, resolve with a stale flag, call `startAccessingSecurityScopedResource()`, revalidate the resolved root, and guarantee `stopAccessingSecurityScopedResource()` through a scoped token.

- [ ] **Step 4: Add TOCTOU revalidation**

Validate once after panel selection and again immediately before staging-directory creation. Open the root directory with `O_DIRECTORY | O_NOFOLLOW`; create descendants relative to that directory descriptor rather than rebuilding arbitrary absolute paths.

- [ ] **Step 5: Run and commit**

```bash
./script/test_apps.sh --only ContactsCollectorTests
git add Apps/ContactsCollector/Services/SnapshotRootService.swift Tests/ContactsCollectorTests
git commit -m "feat: confine Contacts snapshots to a reviewed local root"
```

---

### Task 10: Freeze Effective Scope and Require Fresh Device-Owner Authentication

**Files:**
- Create: `Apps/ContactsCollector/Services/UserPresenceService.swift`
- Modify: `Packages/ContactsCollectorFeature/Sources/ContactsCollectorFeature/ContactsCollectorModel.swift`
- Test: `Tests/ContactsCollectorTests/UserPresenceServiceTests.swift`
- Test: `Packages/ContactsCollectorFeature/Tests/ContactsCollectorFeatureTests/AuthorizationInvalidationTests.swift`

**Interfaces:**
- Produces `FrozenContactsRequest`, `AuthorizedContactsRun`, and `UserPresenceAuthorizing`.

- [ ] **Step 1: Define the non-recursive frozen request**

```swift
public struct FrozenContactsRequest: Codable, Equatable, Sendable {
    public let request: CollectorRequest
    public let selectedContainerIdentifiers: [String]
    public let snapshotRootBookmarkVersion: Int
    public let effectiveScopeDigest: String
}

public struct AuthorizedContactsRun: Sendable {
    public let runId: UUID
    public let requestDigest: String
    public let effectiveScopeDigest: String
    public let authorizedAt: ContinuousClock.Instant
    public let expiresAt: ContinuousClock.Instant
    public let authenticationContext: LAContext
}
```

Compute `requestDigest` from canonical `FrozenContactsRequest` bytes; do not include the digest inside the object being hashed.

- [ ] **Step 2: Write fake-context tests first**

Cover success, user cancel, system cancel, authentication failure, unavailable policy, prior-context reuse, expiration, a changed container selection, changed root bookmark version, scene deactivation before export, retry, and app model recreation.

- [ ] **Step 3: Implement production LocalAuthentication**

For every attempt:

```swift
let context = LAContext()
context.touchIDAuthenticationAllowableReuseDuration = 0
try await context.evaluatePolicy(
    .deviceOwnerAuthentication,
    localizedReason: "Export approved Contacts containers to your local GBrain snapshot folder"
)
```

Create a new context per attempt. Never cache successful contexts globally. Bind success to the exact run ID and digests. Set a 60-second start window. If the app leaves the active scene before export starts, invalidate immediately.

- [ ] **Step 4: Prevent material changes after authentication**

Changing scope, request, root, limit, or bookmark version discards `AuthorizedContactsRun`. Starting another domain or retry requires another authentication. Once the export begins, freeze the request and do not read mutable UI state again.

- [ ] **Step 5: Add UI behavior**

The final button is labeled `Authenticate and Export`, not `Export`. Show a summary of selected container count, maximum records, local output root, and that contact notes/images are excluded before invoking LocalAuthentication.

- [ ] **Step 6: Run and commit**

```bash
swift test --package-path Packages/ContactsCollectorFeature
./script/test_apps.sh --only ContactsCollectorTests
git add Apps/ContactsCollector/Services/UserPresenceService.swift Packages/ContactsCollectorFeature Tests
git commit -m "feat: bind Contacts exports to fresh user authentication"
```

---

### Task 11: Create the Secure Enclave Collector Identity and Code-Identity Receipt

**Files:**
- Create: `Apps/ContactsCollector/Services/CollectorSigningKeyStore.swift`
- Create: `Apps/ContactsCollector/Services/CollectorCodeIdentityService.swift`
- Create: `Packages/SnapshotValidatorKit/Sources/SnapshotValidatorKit/CollectorEnrollmentDocument.swift`
- Create fixture: `Fixtures/Crypto/software-p256-enrollment.json`
- Test: `Tests/ContactsCollectorTests/CollectorSigningKeyStoreTests.swift`
- Test: `Packages/SnapshotValidatorKit/Tests/SnapshotValidatorKitTests/EnrollmentDocumentTests.swift`

**Interfaces:**
- Produces a Secure Enclave-backed `SnapshotSigning` implementation for production.
- Produces a test-only software P-256 signer compiled only into test targets.
- Produces signed `CollectorEnrollmentDocument` bytes.

- [ ] **Step 1: Write signer contract tests using the software test signer**

Prove DER signatures verify, wrong messages fail, fingerprints are SHA-256 over ANSI X9.63 public key representation, private key material is never returned by the protocol, and a recreated signer keeps the same test identity.

- [ ] **Step 2: Implement production key creation**

Create `SecAccessControl` with accessibility `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` and flags `[.privateKeyUsage, .userPresence]`. Create `SecureEnclave.P256.Signing.PrivateKey` using that access control and the current authenticated `LAContext`. Store only the key's opaque `dataRepresentation` in an app-private non-synchronizing Keychain generic-password item.

On later runs, reconstruct the key using the stored representation and a fresh authenticated context. If Secure Enclave is unavailable, key creation/reconstruction fails closed with `CollectorSigningError.secureEnclaveUnavailable`. Do not fall back to `P256.Signing.PrivateKey` in production.

- [ ] **Step 3: Inspect the running collector's signed code identity**

Use Security.framework Code Signing Services to capture bundle identifier, Team ID, designated requirement string, CDHash, executable hash, semantic version/build, and entitlements present. `CodeIdentityClaim` contains claims only; validator enrollment independently re-inspects the app.

- [ ] **Step 4: Define and sign the enrollment document**

Canonical fields:

```swift
public struct CollectorEnrollmentDocument: Codable, Equatable, Sendable {
    public let schemaVersion: Int
    public let collectorDomain: CollectorDomain
    public let publicKeyX963Base64: String
    public let keyFingerprint: String
    public let codeIdentity: CodeIdentityClaim
    public let generatedAt: String
}
```

Write `collector-enrollment.json` and detached `collector-enrollment.sig` only through a visible `Create Enrollment Package` action after fresh device-owner authentication. The enrollment package is not a completed data snapshot.

- [ ] **Step 5: Test key loss and rotation**

Deleting the Keychain item produces a new fingerprint only after explicit user-authenticated setup. It never silently replaces the prior key. Record this as a trust migration that requires validator re-enrollment.

- [ ] **Step 6: Run and commit**

```bash
./script/test_apps.sh --only ContactsCollectorTests
swift test --package-path Packages/SnapshotValidatorKit
git add Apps/ContactsCollector/Services Packages/SnapshotValidatorKit Fixtures/Crypto Tests/ContactsCollectorTests
git commit -m "feat: add Secure Enclave collector signing identity"
```

---

### Task 12: Export an Atomic Collector-Signed Contacts Snapshot

**Files:**
- Create: `Apps/ContactsCollector/Services/ContactsSnapshotExporter.swift`
- Modify: `Packages/ContactsCollectorFeature/Sources/ContactsCollectorFeature/ContactsCollectorModel.swift`
- Test: `Tests/ContactsCollectorTests/ContactsSnapshotExporterTests.swift`

**Interfaces:**
- Produces `ContactsSnapshotExporter.export(authorizedRun:root:scope:) async throws -> CompletedSnapshot`.

- [ ] **Step 1: Write the end-to-end exporter failure matrix first**

Using injected reader, mapper, signer, clock, and code identity, fail at every protocol stage and assert no `COMPLETE` exists. Cover limited authorization, truncation, one raw-card error, zero valid records, root revalidation failure, signing failure, and a source read exceeding the frozen maximum.

- [ ] **Step 2: Implement the exact export order**

1. Verify `AuthorizedContactsRun` has not expired and all frozen digests still match.
2. Re-resolve and revalidate the security-scoped root.
3. Create `<root>/<run-id>/contacts.staging-<uuid>` with `0700`.
4. Read only approved containers with the frozen maximum.
5. Map and sort records by `snapshotRecordId`.
6. Derive `SnapshotStatus`: authorized/full/nontruncated/no errors is complete; limited, truncated, or per-card failures is partial; source failure is unavailable/error.
7. Write `public-receipt.json`, `records.ndjson`, and `errors.ndjson`.
8. Compute their descriptors and write sorted `hashes.sha256`.
9. Build and canonical-encode `private-manifest.json` with the hash-list digest.
10. Sign those exact manifest bytes and write binary DER `snapshot.sig`.
11. Verify the signature locally before finalization.
12. Write `COMPLETE` as lowercase manifest SHA-256 plus newline.
13. Atomically rename staging directory to `<root>/<run-id>/contacts`.

- [ ] **Step 3: Keep the public receipt PII-free**

It may contain run ID, collector version/build, code identity hashes, key fingerprint, status, counts, hashed scope IDs, file hashes, and warnings by code. It must not contain container titles or identifiers, contact identifiers, names, organizations, email/phone/address values, or raw error strings.

- [ ] **Step 4: Make identical records byte-stable**

Two runs over the same injected records with different timestamps/signatures must produce byte-identical `records.ndjson`. The manifest and receipt may differ only in documented run/time/signature-related fields.

- [ ] **Step 5: Connect the real UI flow**

Only a valid `AuthorizedContactsRun` can call the exporter. Cancellation writes no completed directory. The completion screen shows counts, status, root, manifest digest, and signing-key fingerprint without showing contact content.

- [ ] **Step 6: Run and commit**

```bash
./script/test_apps.sh --only ContactsCollectorTests
git add Apps/ContactsCollector/Services/ContactsSnapshotExporter.swift Packages/ContactsCollectorFeature Tests/ContactsCollectorTests
git commit -m "feat: export signed atomic Contacts snapshots"
```

---

### Task 13: Implement Visible Validator Enrollment Bound to the Exact Collector App

**Files:**
- Create: `Packages/SnapshotValidatorKit/Sources/SnapshotValidatorKit/CollectorTrustRecord.swift`
- Create: `Packages/SnapshotValidatorKit/Sources/SnapshotValidatorKit/CodeIdentity.swift`
- Create: `Apps/SnapshotValidator/Services/ValidatorCodeIdentityInspector.swift`
- Create: `Apps/SnapshotValidator/Services/ValidatorTrustStore.swift`
- Create: `Apps/SnapshotValidator/Services/ValidatorUserPresenceService.swift`
- Create: `Apps/SnapshotValidator/Models/SnapshotValidatorModel.swift`
- Create: `Apps/SnapshotValidator/Views/EnrollmentReviewView.swift`
- Test: `Packages/SnapshotValidatorKit/Tests/SnapshotValidatorKitTests/CollectorTrustRecordTests.swift`
- Test: `Tests/SnapshotValidatorTests/ValidatorEnrollmentTests.swift`

**Interfaces:**
- Produces an app-private `CollectorTrustRecord` and no GBrain-readable key database.

- [ ] **Step 1: Write enrollment rejection tests**

Reject malformed documents, bad self-signatures, mismatched bundle ID/Team ID/CDHash/designated requirement, wrong domain, unsupported schema, a collector containing forbidden entitlements, and a changed key fingerprint.

- [ ] **Step 2: Inspect the selected collector app independently**

Use `NSOpenPanel` to select one `.app`. Use `SecStaticCodeCreateWithPath`, `SecStaticCodeCheckValidityWithErrors`, and `SecCodeCopySigningInformation`; derive bundle ID, Team ID, designated requirement, CDHash, and entitlements. Do not trust those values from the enrollment document.

- [ ] **Step 3: Verify enrollment self-signature**

Decode the X9.63 public key from the enrollment document, verify the detached DER signature over the exact canonical document bytes, then compare every code-identity claim to the independently inspected app.

- [ ] **Step 4: Add visible fingerprint comparison and validator LocalAuthentication**

Display full collector bundle ID, Team ID, designated requirement, CDHash, and grouped key fingerprint. Require the user to check `I compared this fingerprint with the Contacts Collector` and then pass a fresh `.deviceOwnerAuthentication` evaluation before enrollment.

- [ ] **Step 5: Store trust only in the validator's app-private Keychain**

Store canonical `CollectorTrustRecord` bytes as a non-synchronizing `kSecClassGenericPassword` item accessible when unlocked on this device. Replacing or deleting trust requires another visible authenticated action. GBrain never reads or edits this item directly.

- [ ] **Step 6: Run and commit**

```bash
swift test --package-path Packages/SnapshotValidatorKit
./script/test_apps.sh --only SnapshotValidatorTests
git add Packages/SnapshotValidatorKit Apps/SnapshotValidator Tests/SnapshotValidatorTests
git commit -m "feat: enroll exact Contacts collector identity"
```

---

### Task 14: Verify Signed Snapshots Before Parsing Any Record

**Files:**
- Create: `Packages/SnapshotValidatorKit/Sources/SnapshotValidatorKit/SnapshotVerification.swift`
- Create: `Packages/SnapshotValidatorKit/Sources/SnapshotValidatorKit/SnapshotVerifier.swift`
- Create: `Apps/SnapshotValidator/Services/SnapshotValidationService.swift`
- Create: `Apps/SnapshotValidator/Services/ValidatorReceiptSigner.swift`
- Create: `Apps/SnapshotValidator/Views/ValidationResultView.swift`
- Test: `Packages/SnapshotValidatorKit/Tests/SnapshotValidatorKitTests/SnapshotVerifierTests.swift`
- Test: `Tests/SnapshotValidatorTests/SnapshotValidationServiceTests.swift`

**Interfaces:**
- Produces `SnapshotVerifier.verifyContactsSnapshot(at:expectedRequestDigest:trust:)`.
- Produces a validator-signed validation receipt without exposing contact records in UI or logs.

- [ ] **Step 1: Write the complete tampering matrix**

Fixtures and tests must reject:

- missing/invalid `COMPLETE`;
- wrong manifest digest;
- wrong key, invalid DER signature, or altered manifest bytes;
- request digest mismatch;
- unknown manifest/domain schema;
- missing, duplicate, extra, nested, symlinked, hard-linked, or non-regular files;
- files larger than fixed caps;
- sparse files detected using `SEEK_HOLE` before EOF;
- wrong owner or modes;
- content length/hash mismatch;
- inconsistent `hashes.sha256`;
- an untrusted collector code identity or key fingerprint;
- status `cancelled` represented as complete.

- [ ] **Step 2: Verify signature before record parsing**

Read only fixed protocol files with `openat` and `O_NOFOLLOW`. Cap manifest/receipt/errors at 1 MiB each and records at 256 MiB for Gate B. Verify trust, exact manifest bytes, signature, `COMPLETE`, request digest, fixed content descriptors, and file hashes before opening `records.ndjson` for JSON parsing.

- [ ] **Step 3: Enforce fixed-file and link safety**

Use `lstat`/`fstat` to require regular files, owner UID, `0600`, link count `1`, and no hole before EOF. Permit only the seven protocol filenames and no child directories.

- [ ] **Step 4: Validate every NDJSON line**

After cryptographic/path checks pass, decode every line as `ContactRecord`, reject blank lines and trailing non-newline data, verify record schema, sorted unique `snapshotRecordId`, per-record content hash, returned count, and manifest coverage counts.

- [ ] **Step 5: Add a validator-signed receipt**

The validator owns its own Secure Enclave P-256 receipt key. Sign a PII-free receipt containing snapshot manifest digest, collector trust fingerprint, expected request digest, validation result, validator code identity, timestamp, and validator key fingerprint. This plan does not enroll that validator key into GBrain; Gate D handles that later.

- [ ] **Step 6: Display only safe validation results**

Show domain, status, counts, collector version/code identity, key fingerprint, request digest, manifest digest, and validation failures by code. Do not show contact content or local source identifiers.

- [ ] **Step 7: Run and commit**

```bash
swift test --package-path Packages/SnapshotValidatorKit
./script/test_apps.sh --only SnapshotValidatorTests
git add Packages/SnapshotValidatorKit Apps/SnapshotValidator Tests/SnapshotValidatorTests Fixtures/Crypto
git commit -m "feat: verify Contacts snapshots before parsing"
```

---

### Task 15: Add a Complete Seam Test Without a Production Bypass

**Files:**
- Create: `Tests/ContactsCollectorTests/ContactsCollectorSeamTests.swift`
- Create: `Tests/SnapshotValidatorTests/ContactsSnapshotSeamTests.swift`
- Modify test host files under: `Apps/ContactsCollectorTestHost/`
- Fixture: `Fixtures/Contacts/seam-expected-records.ndjson`

**Interfaces:**
- Proves the complete logical chain with injected fictional services while leaving the production app free of fake-mode switches.

- [ ] **Step 1: Build deterministic test dependencies**

The test host supplies fixed request bytes, authorization state, containers, raw/unified cards, root, clock, code identity, software signer, and authentication success through initializer injection. No production environment variable or launch argument controls these dependencies.

- [ ] **Step 2: Execute the full in-process seam**

```text
request decode
→ scope selection
→ frozen digest
→ fake user-presence authorization
→ raw/unified read
→ ContactRecord mapping
→ atomic content files
→ canonical manifest
→ signature
→ COMPLETE
→ validator trust
→ signature/hash/path verification
→ ContactRecord parse
```

Assert exact records bytes and all safe receipt fields.

- [ ] **Step 3: Prove front-end state cannot neutralize the handler contract**

Change the selected container after authorization and assert exporter refusal. Change the request maximum after authorization and assert refusal. Open the same request twice and assert separate run state. This guards the seam class that handler-only tests miss.

- [ ] **Step 4: Run and commit**

```bash
./script/test_packages.sh
./script/test_apps.sh
git add Tests Apps/ContactsCollectorTestHost Fixtures/Contacts
git commit -m "test: cover Contacts request-to-validator seam"
```

---

### Task 16: Add Release-Binary Read-Only, Entitlement, and Supply-Chain Gates

**Files:**
- Create: `script/scan_forbidden_apis.sh`
- Create: `script/inspect_entitlements.sh`
- Create: `script/verify_release.sh`
- Create: `.github/workflows/ci.yml`
- Test: shell scripts themselves using known-bad temporary fixtures.

**Interfaces:**
- Produces one blocking command: `./script/verify_release.sh`.

- [ ] **Step 1: Write a forbidden-source scan that fails on a seeded bad fixture**

Scan production source only for exact forbidden tokens:

```text
CNMutableContact
CNSaveRequest
CNMutableGroup
CNContactNoteKey
CNContactImageDataKey
CNContactThumbnailImageDataKey
NSAppleScript
osascript
URLSession
NWConnection
NWListener
NSXPCConnection
Process()
```

Exclude tests, fixtures, docs, and scripts. The scan must fail when a temporary production file contains one token, then pass after deletion.

- [ ] **Step 2: Scan linked release symbols and embedded content**

Run `nm -m`, `otool -L`, and `strings` against the final app executable. Fail on Contacts mutation symbols, Apple Events/script runners, network clients, embedded helper executables, or test-host/fake-service names. Treat this as defense in depth, not proof by itself.

- [ ] **Step 3: Verify exact signed entitlements**

Build Release, extract entitlements with:

```bash
codesign -dvvv --entitlements :- "$APP"
```

For Contacts Collector require exactly sandbox, addressbook, and user-selected read-write. For Validator require exactly sandbox and user-selected read-only. Fail on network client/server, automation Apple Events, contacts notes, app groups, keychain access groups, temporary exceptions, or `get-task-allow`.

- [ ] **Step 4: Inspect signing and provisioning**

Capture `codesign -dvvv`, `spctl -a -vv`, executable SHA-256, embedded provisioning profile decoded with `security cms -D`, bundle IDs, Team IDs, designated requirements, and CDHashes. Verify fixed bundle IDs and Automatic Signing metadata.

- [ ] **Step 5: Verify no unreviewed XcodeGen/upstream drift**

Re-run `bootstrap_xcodegen.sh`, regenerate the project to a temporary path, compare it with the committed project, and fail if `Tools/XcodeGen.lock.json` or `UPSTREAM.md` is stale.

- [ ] **Step 6: Add CI for pure and synthetic tests only**

GitHub Actions runs package tests, source scans, fixture validation, and project-generation drift on a pinned macOS runner. It must not claim Gate B, because CI cannot prove real TCC, LocalAuthentication, Secure Enclave, signed-app, or Contacts semantic behavior.

- [ ] **Step 7: Run and commit**

```bash
./script/verify_release.sh
git add script .github/workflows
git commit -m "security: gate Contacts collector release surface"
```

---

### Task 17: Document Attribution, Synthetic Fixtures, and the Exact Gate B Procedure

**Files:**
- Create: `UPSTREAM.md`
- Create: `NOTICE`
- Create: `SECURITY.md`
- Create: `Qualification/Contacts/synthetic-fixture-register.md`
- Create: `Qualification/Contacts/gate-b-checklist.md`
- Create: `Qualification/Contacts/report-template.md`
- Create: `script/qualify_contacts.sh`

**Interfaces:**
- Produces an auditable synthetic-only qualification procedure and no real-data workflow.

- [ ] **Step 1: Record selected upstream lineage**

`UPSTREAM.md` records exact repository, reviewed commit, source path, copied/adapted functions, local file, local changes, and MIT license for each Apple PIM, PyApple, macos-mcp, or Orchard-derived portion. No generic merge from an upstream branch is allowed.

- [ ] **Step 2: Define the dedicated QA environment**

Gate B runs in a dedicated local macOS account named `gbrain-contacts-qa`. It has no personal Apple Account, mail, messages, files, browser profile, SSH keys, or agent credentials. FileVault remains enabled on the Mac.

For the linked-card system test, use one disposable synthetic-only Apple/CardDAV account plus `On My Mac`; never sign the QA account into a personal Contacts source.

- [ ] **Step 3: Define the fictional fixture register**

Create these cards manually in Contacts.app and record expected fields/counts without recording any real information:

1. Alice Example, ordinary card, `alice@example.test`, `+15550101001`.
2. Acme Example Ltd, organization-only card.
3. Bob Example, multiple labeled emails/phones and postal address.
4. Casey Example, birthday plus a labeled anniversary date.
5. Alex Example A and Alex Example B, duplicate display names with different strong identifiers.
6. Linked Example, two linked raw cards across the two synthetic containers.
7. Note Example, a contact with a note that the collector must exclude.
8. Image Example, a card with an image for which only `hasImage` may be exported.

- [ ] **Step 4: Write the executable receipt collector**

`script/qualify_contacts.sh` creates a timestamped private evidence directory with `0700`, records OS/build/architecture/Xcode/Swift/Git commit, copies code-signing/entitlement outputs, invokes release verification, and prepares commands for process/network/filesystem observation. It never copies contact records into the repository.

- [ ] **Step 5: Write Gate B pass/fail criteria**

The checklist requires all static gates, visible TCC prompt, authorized/limited/denied states, LocalAuthentication success/cancel/failure/reuse tests, exact scope freezing, Secure Enclave identity, enrollment, signed snapshot, tamper rejection, interrupted-run behavior, raw/unified distinction, ambiguity behavior, byte-identical records rerun, semantic source before/after evidence, no network sockets, and final signed-build inspection.

- [ ] **Step 6: Add cleanup and retention**

The QA procedure deletes raw synthetic snapshots after evidence review or seven days, whichever occurs first. It never deletes Contacts source data automatically. No raw snapshots, vCards, enrollment packages, Keychain exports, or private identifiers are committed.

- [ ] **Step 7: Commit documentation**

```bash
git add UPSTREAM.md NOTICE SECURITY.md Qualification/Contacts script/qualify_contacts.sh
git commit -m "docs: define Contacts synthetic qualification gate"
```

---

### Task 18: Execute Gate B on the Final Signed Build and Publish Only Redacted Evidence

**Files:**
- Create locally, do not commit raw: `Qualification/Contacts/evidence/<timestamp>/`
- Create and commit only after pass: `Qualification/Contacts/gate-b-report.md`

**Interfaces:**
- Produces a truthful Gate B decision. It does not authorize another domain or GBrain integration.

- [ ] **Step 1: Build and freeze the candidate**

```bash
./script/verify_release.sh
git status --porcelain | grep -q '^$'
git rev-parse HEAD
```

Record the exact app hashes, code identities, collector/validator key fingerprints, macOS build, Xcode build, and Git commit. Any code/signing change after this step invalidates the run.

- [ ] **Step 2: Capture an independent Contacts before-state**

From Contacts.app in the synthetic QA account, export all fictional cards to one local vCard evidence file. Record count and SHA-256. Also capture screenshots of the synthetic fixture list. Keep both in the private evidence directory.

- [ ] **Step 3: Exercise Contacts authorization states**

Reset the collector's Contacts TCC decision for the fixed bundle ID using the correct local service name verified on the target macOS build. Test not-determined, deny, authorize, limited selection, and return from limited to full. Each state must produce the exact UI and snapshot status documented by tests.

- [ ] **Step 4: Exercise user-presence boundaries on the production app**

Test successful Touch ID/password, cancel, failed attempt, UI click automation without completing authentication, app deactivation before export, scope change after authentication, root change after authentication, expiration, retry, and app restart. No invalid path may create `COMPLETE`.

- [ ] **Step 5: Enroll the exact collector in the validator**

Generate one enrollment package, inspect the Contacts Collector app independently in Validator, compare the fingerprint, authenticate, and enroll. Then alter the package, select a differently signed copy, rotate/delete the collector key, and prove each unapproved identity is rejected.

- [ ] **Step 6: Run the full synthetic export twice**

Export the exact approved containers twice under separate run IDs. Both snapshots must validate. `records.ndjson` must be byte-identical. Counts must reconcile with the fixture register. Raw linked locators and observed unified locator must remain distinguishable. Duplicate names must not merge.

- [ ] **Step 7: Run tamper and incomplete-run tests**

On copied snapshots, alter one record, manifest byte, signature, hash list, completion digest, mode, hard link, symlink, sparse file, schema, request digest, and extra filename. Remove files and interrupt a new export. Validator must reject every case before parsing records.

- [ ] **Step 8: Capture process and network evidence**

During a full export, record process-attributed filesystem activity and run:

```bash
lsof -nP -a -p "$COLLECTOR_PID" -i
```

Expected: no collector-owned network socket. Review filesystem traces for writes outside the app container and selected snapshot root. Any Contacts-store write attributed to the collector is a hard failure.

- [ ] **Step 9: Capture an independent Contacts after-state**

Repeat the Contacts.app vCard export and screenshots. Compare count and content with the before-state. Review any byte difference semantically. Source contacts, linking, labels, images, and notes must be unchanged.

- [ ] **Step 10: Write the redacted Gate B report**

The committed report contains only:

- PASS or FAIL;
- exact code/OS/Xcode identities and public hashes;
- counts by fictional fixture class;
- safe test-case outcomes;
- validator/collector public key fingerprints;
- known limitations and residual risks;
- private evidence-directory receipt hash.

It contains no raw contact data, local account/container/contact identifiers, vCards, screenshots, private paths, or authentication details.

- [ ] **Step 11: Commit only on a genuine pass**

```bash
git add Qualification/Contacts/gate-b-report.md
git commit -m "test: qualify Contacts Collector Gate B"
```

If any criterion fails, commit a redacted failure report only when useful, keep real-data admission closed, and return to the failing task rather than weakening the gate.

---

## Final Verification Sequence

Run from the implementation repository on the final frozen commit:

```bash
./script/bootstrap_xcodegen.sh
./script/generate_project.sh
./script/verify_project_shape.sh
./script/test_packages.sh
./script/test_apps.sh
./script/scan_forbidden_apis.sh
./script/inspect_entitlements.sh
./script/verify_release.sh
./script/qualify_contacts.sh
```

Gate B passes only when the final signed production apps, not merely package tests or Debug binaries, satisfy the full qualification checklist.

## Hard Stop Conditions

Stop implementation or qualification rather than working around any of these:

- App Sandbox must be disabled for Contacts collection.
- A Contacts mutation type/API, Contacts notes entitlement, Apple Events path, generic subprocess/script runner, network feature, or unattended IPC surface enters production code.
- The final signed app has an unexpected entitlement or `get-task-allow`.
- Secure Enclave signing is unavailable or the private key can be exported through an app API.
- LocalAuthentication can be bypassed, reused, or remain valid after material scope/root/request change.
- Validator cannot bind an enrolled public key to independently inspected collector code identity.
- Limited Contacts access is represented as complete.
- Raw source cards and unified observations become indistinguishable.
- Contact reconciliation chooses a first candidate after ambiguity.
- Identical fictional source data produces nondeterministic `records.ndjson`.
- An invalid/tampered/incomplete snapshot reaches record parsing.
- Collector writes occur outside its sandbox container and selected snapshot root, or any Contacts semantic source record changes.
- Qualification requires real personal contacts.

## Deliberately Deferred Work

This plan does not create Calendar or Mail targets, launch or parse Messages exports, update the GBrain `cold-start-apple` skill, generate GBrain Markdown, add an unattended helper, add live sync, or admit real Contacts data. Those actions require their own approved plans and gates.