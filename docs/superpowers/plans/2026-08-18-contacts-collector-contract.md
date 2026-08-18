# Contacts Collector Normative Implementation Contract

**Plan:** `docs/superpowers/plans/2026-08-18-contacts-collector.md`  
**Spec:** `docs/superpowers/specs/2026-08-18-cold-start-apple-reader-design.md`  
**Status:** Required companion to the implementation plan

This contract resolves the type, concurrency, cryptographic, identity, and validator details that were intentionally abbreviated in the task-by-task plan. It is normative. Where an illustrative type or sentence in the plan differs from this contract, this contract governs. An executor must read both files before creating the implementation repository.

## 1. Package Dependency Graph

The package graph is acyclic and fixed:

```text
SnapshotProtocol                 no Apple frameworks
        ▲
        ├──────── ContactsDomain no Apple frameworks
        │               ▲
        │               │
        └── ContactsCollectorFeature  SwiftUI only, protocol seams only

SnapshotProtocol ── SnapshotValidatorKit  Security/CryptoKit allowed; no Contacts
```

The application targets own live framework adapters:

```text
ContactsCollector.app
  ├── SnapshotProtocol
  ├── ContactsDomain
  ├── ContactsCollectorFeature
  ├── Contacts.framework
  ├── LocalAuthentication
  ├── CryptoKit / Security.framework
  └── AppKit file panels

SnapshotValidator.app
  ├── SnapshotProtocol
  ├── SnapshotValidatorKit
  ├── LocalAuthentication
  ├── CryptoKit / Security.framework
  └── AppKit file panels
```

`SnapshotProtocol` may define Contacts-specific coverage records for schema version 1. It must not import `ContactsDomain`, Contacts.framework, LocalAuthentication, AppKit, or SwiftUI.

## 2. Project-Scaffolding Corrections

### 2.1 Local signing configuration

`Config/Base.xcconfig` begins with:

```xcconfig
#include? "Local.xcconfig"
```

and then defines:

```xcconfig
DEVELOPMENT_TEAM = $(GBRAIN_DEVELOPMENT_TEAM)
```

`script/write_local_signing_config.sh` writes exactly:

```xcconfig
GBRAIN_DEVELOPMENT_TEAM = <resolved ten-character Team ID>
```

into the ignored `Config/Local.xcconfig`. It fails if no Team ID is found or more than one Apple Development Team ID is present without an explicit `GBRAIN_DEVELOPMENT_TEAM` shell value.

### 2.2 UI test host signing

`ContactsCollectorTestHost` is a separate ad-hoc-signed app, not an unsigned app:

```yaml
settings:
  base:
    PRODUCT_BUNDLE_IDENTIFIER: com.jordanschwartz.gbrain.coldstart.contacts.testhost
    PRODUCT_NAME: ContactsCollectorTestHost
    CODE_SIGN_STYLE: Manual
    CODE_SIGN_IDENTITY: "-"
    DEVELOPMENT_TEAM: ""
    ENABLE_HARDENED_RUNTIME: NO
```

It has no Contacts entitlement, no production signing key, no production bundle identifier, and no code path shared through runtime flags. Fake dependencies enter only through its compiled initializer.

## 3. Canonical Encoding and Cryptographic Formats

### 3.1 Canonical JSON

For schema version 1:

- UTF-8 only;
- no byte-order mark;
- no insignificant whitespace;
- object keys lexicographically sorted by Unicode scalar order through one checked-in encoder implementation;
- array order determined by the owning type before encoding;
- forward slashes unescaped;
- strings encoded according to JSON rules;
- counts encoded as signed 64-bit-compatible JSON integers;
- no floating-point fields in signed structures;
- timestamps are preformatted strings in UTC RFC 3339 with exactly three fractional digits, for example `2026-08-18T20:00:00.000Z`;
- one golden canonical-byte fixture and SHA-256 is checked into `Fixtures/Crypto/`.

`CanonicalJSON` is the only encoder permitted for request digests, records, manifests, enrollment documents, trust records, and validator receipts.

### 3.2 Hashes and signatures

- Hash algorithm: SHA-256.
- Collector public-key encoding: ANSI X9.63 uncompressed P-256 point, 65 bytes.
- Public-key fingerprint: lowercase SHA-256 hex of those exact 65 bytes.
- Snapshot and enrollment signatures: ECDSA P-256 over SHA-256, encoded as ASN.1 DER.
- `snapshot.sig` and `collector-enrollment.sig` contain raw DER bytes, not Base64 text.
- JSON documents carry X9.63 public key bytes as unpadded standard Base64.
- `COMPLETE` contains lowercase SHA-256 hex of the exact signed `private-manifest.json` bytes followed by one newline.

The collector signs the exact bytes written as `private-manifest.json`; the validator verifies those bytes before decoding the manifest semantically.

## 4. SnapshotProtocol Types

The following definitions replace shorthand in the plan.

```swift
public enum CollectorDomain: String, Codable, Sendable {
    case contacts
}

public enum SnapshotStatus: String, Codable, Sendable {
    case complete
    case partial
    case unavailable
    case error
    case cancelled
}

public enum ContactsAuthorizationValue: String, Codable, Sendable {
    case authorized
    case limited
    case denied
    case restricted
    case notDetermined
    case unknown
}

public enum CollectorWarningCode: String, Codable, Comparable, Sendable {
    case limitedAuthorization
    case resultLimitReached
    case unifiedLookupFailed
    case sourceCardReadFailed
    case noApprovedContainers
    case validEmptyScope
}

public enum CollectorErrorCode: String, Codable, Comparable, Sendable {
    case invalidRequest
    case permissionDenied
    case permissionRestricted
    case authenticationCancelled
    case authenticationFailed
    case authenticationExpired
    case requestChangedAfterAuthentication
    case snapshotRootRejected
    case sourceUnavailable
    case sourceReadFailed
    case mappingFailed
    case secureEnclaveUnavailable
    case signingFailed
    case filesystemFailure
    case invariantViolation
}

public struct CollectorErrorSummary: Codable, Equatable, Sendable {
    public let code: CollectorErrorCode
    public let count: Int
}

public struct CodeIdentityClaim: Codable, Equatable, Sendable {
    public let bundleIdentifier: String
    public let teamIdentifier: String
    public let designatedRequirement: String
    public let cdHash: String
    public let executableSha256: String
    public let marketingVersion: String
    public let buildNumber: String
    public let entitlementsSha256: String
}

public struct ContactsCoverage: Codable, Equatable, Sendable {
    public let authorization: ContactsAuthorizationValue
    public let requestedContainerCount: Int
    public let approvedContainerCount: Int
    public let observedRawCardCount: Int
    public let returnedLogicalRecordCount: Int
    public let failedRawCardCount: Int
    public let unifiedLookupFailureCount: Int
    public let maximumRecordCount: Int
    public let truncated: Bool
    public let localObservationOnly: Bool
}

public struct SnapshotContentFile: Codable, Equatable, Comparable, Sendable {
    public let name: String
    public let byteLength: Int64
    public let sha256: String

    public static func < (lhs: Self, rhs: Self) -> Bool {
        lhs.name < rhs.name
    }
}

public struct SnapshotManifest: Codable, Equatable, Sendable {
    public let schemaVersion: Int                 // exactly 2
    public let domainSchemaVersion: Int           // Contacts exactly 1
    public let runId: UUID
    public let collector: CollectorDomain         // contacts
    public let status: SnapshotStatus
    public let requestDigest: String
    public let effectiveScopeDigest: String
    public let collectorVersion: String
    public let codeIdentity: CodeIdentityClaim
    public let signingKeyFingerprint: String
    public let signatureAlgorithm: String          // ecdsa-p256-sha256-der
    public let startedAt: String
    public let completedAt: String
    public let coverage: ContactsCoverage
    public let contentFiles: [SnapshotContentFile]
    public let hashesFileSha256: String
    public let warningCodes: [CollectorWarningCode]
    public let errorSummary: [CollectorErrorSummary]
}
```

`warningCodes` and `errorSummary` contain codes and counts only. Raw framework error text and identifiers belong, when needed, in owner-only `errors.ndjson`; they never enter public logs or `public-receipt.json`.

## 5. Request and Frozen-Scope Types

```swift
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

public struct FrozenContactsRequest: Codable, Equatable, Sendable {
    public let request: CollectorRequest
    public let selectedContainerIdentifiers: [String]
    public let snapshotRootBookmarkVersion: Int
    public let effectiveScopeDigest: String
}
```

Rules:

- `selectedContainerIdentifiers` is sorted and deduplicated before freezing.
- `effectiveScopeDigest` is SHA-256 over canonical JSON containing `runId`, sorted container IDs, `maxRecords`, and bookmark version. It is private.
- `requestDigest` is SHA-256 over canonical `FrozenContactsRequest` bytes. No digest field participates in its own digest.
- The public receipt contains `publicScopeDigest = SHA256(runId || 0x00 || effectiveScopeDigest)`, preventing a stable public cross-run container-set identifier.
- Contacts requests require both window values to be `null`.

## 6. Swift 6 Concurrency and LocalAuthentication

`LAContext` is not passed through `Sendable` protocols or across actors. User-presence state remains main-actor isolated.

```swift
@MainActor
public protocol UserPresenceAuthorizing: AnyObject {
    func authorize(
        frozenRequest: FrozenContactsRequest,
        requestDigest: String
    ) async throws -> AuthorizedContactsRun
}

@MainActor
public final class AuthorizedContactsRun {
    public let runId: UUID
    public let requestDigest: String
    public let effectiveScopeDigest: String
    public let authorizedAt: ContinuousClock.Instant
    public let expiresAt: ContinuousClock.Instant

    internal let authenticationContext: LAContext
    internal private(set) var consumed = false

    public func consume(
        runId: UUID,
        requestDigest: String,
        effectiveScopeDigest: String,
        now: ContinuousClock.Instant
    ) throws
}

@MainActor
public protocol SnapshotSigning: AnyObject {
    var publicKeyX963: Data { get async throws }
    var fingerprint: String { get async throws }
    func sign(_ bytes: Data, authorization: AuthorizedContactsRun) async throws -> Data
}
```

`AuthorizedContactsRun.consume` succeeds once only. It verifies all supplied values, checks `now < expiresAt`, marks the run consumed before any source read begins, and invalidates its `LAContext` on failure. A retry obtains a new authorization.

The Contacts source adapter is actor-isolated:

```swift
public protocol ContactsAuthorizing: Sendable {
    func status() async -> ContactsAuthorizationState
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
```

Live implementations are actors. Immutable plain Swift DTOs cross actor boundaries; `CNContact`, `CNContainer`, and other Contacts.framework objects do not leave the Contacts actor.

## 7. Contacts Domain Types

```swift
public struct RawContactLocator: Codable, Hashable, Comparable, Sendable {
    public let containerIdentifier: String
    public let contactIdentifier: String

    public static func < (lhs: Self, rhs: Self) -> Bool {
        if lhs.containerIdentifier != rhs.containerIdentifier {
            return lhs.containerIdentifier < rhs.containerIdentifier
        }
        return lhs.contactIdentifier < rhs.contactIdentifier
    }
}

public enum ContactRecordType: String, Codable, Sendable {
    case person
    case organization
}

public struct ContactName: Codable, Equatable, Sendable {
    public let formatted: String?
    public let prefix: String?
    public let given: String?
    public let middle: String?
    public let family: String?
    public let suffix: String?
    public let previousFamily: String?
    public let phoneticGiven: String?
    public let phoneticMiddle: String?
    public let phoneticFamily: String?
}

public struct ContactOrganization: Codable, Equatable, Sendable {
    public let name: String?
    public let department: String?
    public let jobTitle: String?
}

public struct LabeledString: Codable, Equatable, Comparable, Sendable {
    public let labelIdentifier: String?
    public let value: String
}

public struct LabeledPostalAddress: Codable, Equatable, Comparable, Sendable {
    public let labelIdentifier: String?
    public let street: String?
    public let subLocality: String?
    public let city: String?
    public let state: String?
    public let postalCode: String?
    public let country: String?
    public let isoCountryCode: String?
}

public struct ContactDateComponents: Codable, Equatable, Sendable {
    public let calendarIdentifier: String?
    public let era: Int?
    public let year: Int?
    public let month: Int?
    public let day: Int?
    public let isLeapMonth: Bool?
}

public struct LabeledDateComponents: Codable, Equatable, Comparable, Sendable {
    public let labelIdentifier: String?
    public let value: ContactDateComponents
}

public struct ContactSocialProfile: Codable, Equatable, Comparable, Sendable {
    public let labelIdentifier: String?
    public let service: String?
    public let username: String?
    public let userIdentifier: String?
    public let urlString: String?
}

public struct ContactInstantMessage: Codable, Equatable, Comparable, Sendable {
    public let labelIdentifier: String?
    public let service: String
    public let username: String
}

public enum ContactNotesStatus: String, Codable, Sendable {
    case excludedByDesign
}

public struct StrongContactIdentifiers: Codable, Equatable, Sendable {
    public let emails: [String]
    public let phones: [String]
}

public struct ContactRecordHashPayload: Codable, Equatable, Sendable {
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
}

public struct ContactRecord: Codable, Equatable, Sendable {
    public let payload: ContactRecordHashPayload
    public let contentHash: String
}
```

Canonical record JSON uses flattened keys rather than a nested `payload` object. Implement custom `Codable` or a factory so the hash payload excludes `contentHash` while the wire representation remains the flat schema described by the plan.

## 8. Raw Contacts DTOs

Contacts.framework objects remain inside `ContactsStoreActor`. The actor returns these DTOs:

```swift
public struct ContactContainerSummary: Codable, Equatable, Sendable {
    public let identifier: String
    public let title: String
    public let type: ContactContainerType
}

public struct RawContactCard: Equatable, Sendable {
    public let locator: RawContactLocator
    public let observedUnifiedIdentifier: String?
    public let values: RawContactValues
}

public struct RawContactGroup: Equatable, Sendable {
    public let observedUnifiedIdentifier: String?
    public let cards: [RawContactCard]
}

public struct RawContactsReadResult: Equatable, Sendable {
    public let groups: [RawContactGroup]
    public let observedRawCardCount: Int
    public let failedRawCardCount: Int
    public let unifiedLookupFailureCount: Int
    public let truncated: Bool
    public let warningCodes: [CollectorWarningCode]
    public let privateErrors: [PrivateCollectorError]
}
```

`RawContactValues` contains only V1 fields and no note or image bytes. Production fetch keys are defined once in `ContactsStoreService.readKeys`; tests compare the exact key identifiers.

## 9. Snapshot Outcome Semantics

Status is derived deterministically:

| Condition | Status |
|---|---|
| User cancels before export | no completed snapshot |
| Request invalid or invariant fails before useful read | `error` diagnostic snapshot only when user authentication already occurred; otherwise no completed snapshot |
| Permission denied/restricted or Contacts store cannot be read | `unavailable` |
| Authorization limited | `partial` |
| Maximum record count hit | `partial` |
| One or more source-card/unified-lookup/mapping failures but useful records exist | `partial` |
| Full authorization, approved scope exhausted, no per-record failures | `complete` |
| Full authorization, approved scope exhausted, zero raw cards, no failures | `complete` with `validEmptyScope` warning code |

A valid empty scope is distinguishable from unavailable by authorization, coverage counts, warning code, signature, and manifest status.

## 10. Reconciliation Contradiction Rule

Raw locators are strong local evidence but not infallible. Before automatic exact or overlap reconciliation:

- if both current and prior records have at least one strong identifier and the sets are disjoint, return `.ambiguous(reason: .strongIdentifierContradiction)`;
- if record types differ and both records contain nonempty organization/person fields inconsistent with that type, return ambiguity;
- absence of strong identifiers is not itself a contradiction.

Only after contradiction checks apply the order in the plan: exact raw set, unique raw overlap, unique strong identifier, new, or ambiguous. Display name and organization are never match keys.

## 11. Secure Enclave Key Storage

Collector key service:

- Keychain service: `com.jordanschwartz.gbrain.coldstart.contacts.snapshot-signing`.
- Keychain account: `p256-secure-enclave-v1`.
- `kSecAttrSynchronizable = false`.
- no explicit keychain access group;
- `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`;
- key access control flags `.privateKeyUsage` and `.userPresence`;
- stored value is CryptoKit's opaque Secure Enclave private-key `dataRepresentation` only;
- production API exposes X9.63 public key, fingerprint, and sign operation only;
- test software keys live under a separate test target and separate service name.

The validator receipt key is also Secure Enclave-backed but uses `.privateKeyUsage` without `.userPresence`; validation is visible, and the receipt key does not authorize Apple data collection. It is stored under the validator's app-private Keychain service.

## 12. Enrollment and Per-Validation Code Identity Binding

Enrollment alone is insufficient because an updated app may retain its Keychain signing key. Therefore validator trust includes a security-scoped bookmark to the exact collector app selected at enrollment.

```swift
public struct CollectorTrustRecord: Codable, Equatable, Sendable {
    public let schemaVersion: Int
    public let domain: CollectorDomain
    public let publicKeyX963Base64: String
    public let keyFingerprint: String
    public let expectedCodeIdentity: CodeIdentityClaim
    public let collectorAppBookmarkBase64: String
    public let enrolledAt: String
    public let validatorVersion: String
}
```

On **every** collector snapshot validation, before trusting the manifest:

1. resolve the collector-app bookmark with security scope;
2. reject a stale or missing bookmark;
3. run `SecStaticCodeCheckValidityWithErrors` on that app;
4. independently recompute current bundle ID, Team ID, designated requirement, CDHash, executable hash, and entitlements hash;
5. require an exact match to the enrolled `CodeIdentityClaim`;
6. require the manifest's signed code-identity claim to match the same record;
7. then verify the enrolled-key snapshot signature.

Any collector rebuild, re-sign, update, move that stales the bookmark, or signing-key rotation requires visible authenticated re-enrollment and Gate B requalification. The collector cannot merely claim an older CDHash in a signed manifest.

## 13. Validator Receipt Location and Authority

The validator has user-selected read-only snapshot access and does not write into a collector snapshot. It writes its signed validation receipt inside its own sandbox application-support directory:

```text
~/Library/Containers/com.jordanschwartz.gbrain.coldstart.validator/
  Data/Library/Application Support/ValidationReceipts/<manifest-sha256>/
```

Files are `validation-receipt.json`, `validation-receipt.sig`, and `COMPLETE`, mode `0600` under a `0700` directory. Gate D decides how GBrain later receives or verifies that receipt. Gate B displays and records its digest/fingerprint but does not broaden validator filesystem entitlement.

## 14. Public Receipt Privacy

`public-receipt.json` contains:

- schema/domain versions;
- run ID;
- status;
- public scope digest derived with run ID;
- code-identity public hashes;
- collector key fingerprint;
- counts and boolean coverage fields;
- warning/error codes and counts;
- content-file names, lengths, and hashes;
- start/completion timestamps.

It contains no raw scope/container/contact identifier and no source-derived string field. `errors.ndjson` is private and may contain opaque local identifiers only when required to diagnose a fictional qualification failure; it still must not contain note or image bytes.

## 15. File Verification Limits

Gate B limits are fixed:

- `private-manifest.json`: 1 MiB;
- `public-receipt.json`: 1 MiB;
- `errors.ndjson`: 4 MiB;
- `records.ndjson`: 256 MiB;
- `hashes.sha256`: 1 MiB;
- `snapshot.sig`: 256 bytes maximum;
- `COMPLETE`: exactly 65 bytes, 64 lowercase hex characters plus newline.

Validator uses `lstat`, `openat(..., O_NOFOLLOW)`, `fstat`, link count `1`, exact owner UID, exact file mode `0600`, fixed filenames, no subdirectories, and `SEEK_HOLE`/EOF checks where supported. If the target filesystem cannot provide trustworthy hole detection, Gate B records that limitation and the validator still reads and hashes every byte under the size cap; it does not infer safety from allocated-block counts.

## 16. Gate B Build and Test Separation

- Unit tests may use a software P-256 key and fake LocalAuthentication only through test targets.
- UI tests run against `ContactsCollectorTestHost` only.
- Production release tests use the real Contacts Collector and Validator apps, real TCC, real `LAPolicy.deviceOwnerAuthentication`, real Secure Enclave keys, and fictional Contacts records.
- No launch argument, environment variable, preference, hidden menu command, or accessibility action selects fake services in the production app.
- CI proves source/package/synthetic invariants only and never marks Gate B passed.

## 17. Required Self-Review Checks Before Execution

Before implementing Task 1, the executor must verify:

```text
Plan and this contract are both present.
No type in a task is undefined by the plan, this contract, or an explicitly created file.
SnapshotProtocol does not depend on ContactsDomain.
LAContext does not cross a Sendable boundary.
The public key format is X9.63 everywhere.
Validator re-inspects the enrolled collector app on every validation.
A valid empty Contacts scope has complete-but-empty semantics.
Validator receipts remain in the validator sandbox.
ContactsCollectorTestHost is ad-hoc signed and separate from production.
Base.xcconfig optionally includes Local.xcconfig.
```

Any implementation choice that changes these items requires a design review rather than an executor-local substitution.