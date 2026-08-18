# Contacts Collector Normative Implementation Contract

**Plan:** `docs/superpowers/plans/2026-08-18-contacts-collector.md`  
**Scaffolding appendix:** `docs/superpowers/plans/2026-08-18-contacts-collector-scaffolding.md`  
**Spec:** `docs/superpowers/specs/2026-08-18-cold-start-apple-reader-design.md`  
**Status:** Required companion to the implementation plan

This contract fixes the exact module boundaries, wire types, concurrency rules, cryptographic encodings, identity semantics, and validator trust rules for the Contacts implementation. The executor must read all three plan documents before creating the implementation repository. If shorthand in the task plan differs from this contract, this contract governs.

## 1. Fixed package graph

```text
SnapshotProtocol                     Foundation + CryptoKit hashing only
        ▲
        ├──────── ContactsDomain     Foundation + SnapshotProtocol
        │               ▲
        │               │
        └── ContactsCollectorFeature SwiftUI + both packages; protocol seams only

SnapshotProtocol ── ContactsDomain ── SnapshotValidatorKit
```

Application targets own live platform adapters:

```text
ContactsCollector.app
  ├── SnapshotProtocol
  ├── ContactsDomain
  ├── ContactsCollectorFeature
  ├── Contacts.framework
  ├── LocalAuthentication
  ├── CryptoKit and Security.framework
  └── AppKit file panels

SnapshotValidator.app
  ├── SnapshotProtocol
  ├── ContactsDomain
  ├── SnapshotValidatorKit
  ├── LocalAuthentication
  ├── CryptoKit and Security.framework
  └── AppKit file panels
```

Rules:

- `SnapshotProtocol` imports no Contacts, LocalAuthentication, AppKit, SwiftUI, or Security APIs.
- `ContactsDomain` imports no Apple personal-information framework.
- `ContactsCollectorFeature` never imports Contacts.framework, Security.framework, or CryptoKit. It communicates through the protocols defined below.
- `SnapshotValidatorKit` may decode `ContactRecord` only after the snapshot signature and file hashes pass. It never imports Contacts.framework.
- `CNContact`, `CNContainer`, `LAContext`, `SecKey`, and `SecCode` never cross package or actor boundaries.

## 2. Project and signing corrections

### 2.1 Local Team ID

`Config/Base.xcconfig` begins with:

```xcconfig
#include? "Local.xcconfig"
DEVELOPMENT_TEAM = $(GBRAIN_DEVELOPMENT_TEAM)
```

`Config/Local.xcconfig` is ignored. `script/write_local_signing_config.sh` writes exactly one assignment:

```xcconfig
GBRAIN_DEVELOPMENT_TEAM = ABCDE12345
```

The script accepts an explicit `GBRAIN_DEVELOPMENT_TEAM` environment value. Without one, it resolves Apple Development identities, extracts unique ten-character Team IDs, and succeeds only when exactly one exists.

### 2.2 Test host

`ContactsCollectorTestHost` is a separate ad-hoc-signed app:

```text
bundle ID: com.jordanschwartz.gbrain.coldstart.contacts.testhost
signing identity: -
Hardened Runtime: disabled
Contacts entitlement: absent
production Keychain service: absent
production bundle ID: absent
```

Fake dependencies enter through a test-host initializer compiled into that target. No production launch argument, environment variable, preference, hidden menu, URL, or accessibility action selects a fake dependency.

## 3. Canonical encoding

`CanonicalJSON` defines project canonical JSON version 1:

- UTF-8 with no byte-order mark;
- no insignificant whitespace;
- keys sorted with `JSONEncoder.OutputFormatting.sortedKeys`;
- forward slashes unescaped;
- arrays sorted by the owning type before encoding;
- no floating-point values in signed structures;
- timestamps preformatted as UTC RFC 3339 strings with exactly three fractional digits, such as `2026-08-18T20:00:00.000Z`;
- UUIDs encoded as lowercase canonical strings;
- SHA-256 values encoded as 64 lowercase hexadecimal characters;
- one trailing newline only for NDJSON lines and `COMPLETE`, never for signed JSON documents.

Required API:

```swift
public enum CanonicalJSON {
    public static func encode<T: Encodable>(_ value: T) throws -> Data
    public static func decode<T: Decodable>(_ type: T.Type, from data: Data) throws -> T
    public static func sha256(_ data: Data) -> Data
    public static func sha256Hex(_ data: Data) -> String
    public static func sha256Hex<T: Encodable>(_ value: T) throws -> String
}
```

`encode` uses one configured `JSONEncoder` and rejects non-finite numbers by construction because signed models contain no floating-point fields. Golden fixtures pin the exact canonical bytes and digest.

## 4. Cryptographic formats

- Hash: SHA-256.
- Signing curve: P-256.
- Public key: ANSI X9.63 uncompressed point, exactly 65 bytes.
- Public-key fingerprint: lowercase SHA-256 hex over those exact 65 bytes.
- Signature: ECDSA P-256/SHA-256, ASN.1 DER representation.
- `snapshot.sig`, `collector-enrollment.sig`, and validator receipt signatures contain raw DER bytes.
- JSON public keys use standard unpadded Base64 of the X9.63 bytes.
- `COMPLETE` is exactly 65 bytes: the signed manifest SHA-256 as 64 lowercase hex characters plus `\n`.

The collector signs the exact bytes written to `private-manifest.json`. The validator verifies the raw bytes before decoding the manifest.

## 5. SnapshotProtocol models

Create these definitions exactly. Initializers may be public memberwise initializers or explicit equivalents.

```swift
public enum CollectorDomain: String, Codable, Sendable {
    case contacts
}

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

public enum CollectorWarningCode: String, Codable, CaseIterable, Sendable {
    case limitedAuthorization
    case resultLimitReached
    case unifiedLookupFailed
    case sourceCardReadFailed
    case validEmptyScope
}

public enum CollectorErrorCode: String, Codable, CaseIterable, Sendable {
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

public struct PrivateCollectorError: Codable, Equatable, Sendable {
    public let code: CollectorErrorCode
    public let opaqueRecordLocatorDigest: String?
    public let diagnostic: String
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
    public let signatureAlgorithm: String
    public let startedAt: String
    public let completedAt: String
    public let coverage: ContactsCoverage
    public let contentFiles: [SnapshotContentFile]
    public let hashesFileSha256: String
    public let warningCodes: [CollectorWarningCode]
    public let errorSummary: [CollectorErrorSummary]
}

public struct PublicReceipt: Codable, Equatable, Sendable {
    public let schemaVersion: Int
    public let domainSchemaVersion: Int
    public let runId: UUID
    public let collector: CollectorDomain
    public let status: SnapshotStatus
    public let publicScopeDigest: String
    public let collectorVersion: String
    public let codeIdentity: CodeIdentityClaim
    public let signingKeyFingerprint: String
    public let startedAt: String
    public let completedAt: String
    public let coverage: ContactsCoverage
    public let recordsSha256: String
    public let errorsSha256: String
    public let warningCodes: [CollectorWarningCode]
    public let errorSummary: [CollectorErrorSummary]
}
```

Ordering rules:

- `contentFiles` sorted by `name`.
- warning codes sorted by raw value before encoding.
- error summaries sorted by `code.rawValue`.
- no raw Contacts identifier or source-derived string enters `PublicReceipt`.

## 6. Strict request and frozen scope

```swift
public struct EffectiveContactsScope: Codable, Equatable, Sendable {
    public let runId: UUID
    public let selectedContainerIdentifiers: [String]
    public let maxRecords: Int
    public let snapshotRootBookmarkVersion: Int
}

public struct FrozenContactsRequest: Codable, Equatable, Sendable {
    public let request: CollectorRequest
    public let effectiveScope: EffectiveContactsScope
}
```

Rules:

- Contacts request schema version is exactly `1`.
- `domain` is exactly `.contacts`.
- `window.start` and `window.end` are both `nil`.
- `maxRecords` is `1...100_000`.
- unknown keys are rejected recursively before `Decodable` conversion.
- selected container identifiers are trimmed, deduplicated, and sorted.
- `effectiveScopeDigest = SHA256(canonical EffectiveContactsScope)`.
- `requestDigest = SHA256(canonical FrozenContactsRequest)`.
- no digest field participates in its own digest.
- `publicScopeDigest = SHA256(UTF8(lowercase runId) || 0x00 || UTF8(effectiveScopeDigest))`.

`StrictRequestDecoder` first uses `JSONSerialization` to enforce exact object key sets, then decodes with `CanonicalJSON.decode`.

## 7. Feature protocols and Swift 6 isolation

`ContactsCollectorFeature` defines only protocol seams and plain DTOs.

```swift
@MainActor
public protocol AuthorizedContactsRun: AnyObject {
    var runId: UUID { get }
    var requestDigest: String { get }
    var effectiveScopeDigest: String { get }

    func consume(
        runId: UUID,
        requestDigest: String,
        effectiveScopeDigest: String
    ) throws

    func invalidate()
}

@MainActor
public protocol UserPresenceAuthorizing: AnyObject {
    func authorize(
        frozenRequest: FrozenContactsRequest,
        requestDigest: String,
        effectiveScopeDigest: String
    ) async throws -> any AuthorizedContactsRun
}

public struct CollectorKeyIdentity: Codable, Equatable, Sendable {
    public let publicKeyX963: Data
    public let fingerprint: String
    public let algorithm: String
}

@MainActor
public protocol SnapshotSigning: AnyObject {
    func identity() async throws -> CollectorKeyIdentity
    func sign(
        _ bytes: Data,
        authorization: any AuthorizedContactsRun
    ) async throws -> Data
}

public protocol ContactsAuthorizing: Sendable {
    func status() async -> ContactsAuthorizationValue
    func requestAccess() async throws -> ContactsAuthorizationValue
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

Live authorization implementation:

- is `@MainActor`;
- creates a new `LAContext` for every call;
- sets `touchIDAuthenticationAllowableReuseDuration = 0`;
- calls `evaluatePolicy(.deviceOwnerAuthentication, localizedReason:)`;
- stores the `LAContext` only inside a private `@MainActor` grant object;
- expires the grant after 60 seconds using `ContinuousClock`;
- consumes it exactly once before the first source read;
- invalidates it on digest mismatch, expiry, cancellation, app backgrounding, export failure, or collector restart.

`LAContext` is never marked `@unchecked Sendable` and never crosses an actor boundary.

## 8. ContactsDomain models

```swift
public enum ContactContainerType: String, Codable, Sendable {
    case local
    case exchange
    case cardDAV
    case unassigned
    case unknown
}

public struct ContactContainerSummary: Codable, Equatable, Sendable {
    public let identifier: String
    public let title: String
    public let type: ContactContainerType
}

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

    public static func < (lhs: Self, rhs: Self) -> Bool {
        let left = (lhs.labelIdentifier ?? "", lhs.value)
        let right = (rhs.labelIdentifier ?? "", rhs.value)
        return left < right
    }
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

    public static func < (lhs: Self, rhs: Self) -> Bool {
        lhs.sortKey < rhs.sortKey
    }

    private var sortKey: String {
        [labelIdentifier, street, subLocality, city, state, postalCode, country, isoCountryCode]
            .map { $0 ?? "" }
            .joined(separator: "\u{001F}")
    }
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

    public static func < (lhs: Self, rhs: Self) -> Bool {
        lhs.sortKey < rhs.sortKey
    }

    private var sortKey: String {
        [
            labelIdentifier ?? "",
            value.calendarIdentifier ?? "",
            String(value.era ?? -1),
            String(value.year ?? -1),
            String(value.month ?? -1),
            String(value.day ?? -1),
            String(value.isLeapMonth ?? false),
        ].joined(separator: "\u{001F}")
    }
}

public struct ContactSocialProfile: Codable, Equatable, Comparable, Sendable {
    public let labelIdentifier: String?
    public let service: String?
    public let username: String?
    public let userIdentifier: String?
    public let urlString: String?

    public static func < (lhs: Self, rhs: Self) -> Bool {
        lhs.sortKey < rhs.sortKey
    }

    private var sortKey: String {
        [labelIdentifier, service, username, userIdentifier, urlString]
            .map { $0 ?? "" }
            .joined(separator: "\u{001F}")
    }
}

public struct ContactInstantMessage: Codable, Equatable, Comparable, Sendable {
    public let labelIdentifier: String?
    public let service: String
    public let username: String

    public static func < (lhs: Self, rhs: Self) -> Bool {
        (lhs.labelIdentifier ?? "", lhs.service, lhs.username)
            < (rhs.labelIdentifier ?? "", rhs.service, rhs.username)
    }
}

public enum ContactNotesStatus: String, Codable, Sendable {
    case excludedByDesign
}

public struct StrongContactIdentifiers: Codable, Equatable, Sendable {
    public let emails: [String]
    public let phones: [String]
}

public struct RawContactValues: Equatable, Sendable {
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

public struct ContactRecordPayload: Codable, Equatable, Sendable {
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
    public let payload: ContactRecordPayload
    public let contentHash: String
}
```

Wire JSON is flat rather than nested under `payload`. Implement custom `Codable`: encode every payload key plus `contentHash` at one object level; decode the same exact key set. `contentHash` is SHA-256 of canonical `ContactRecordPayload`.

Deterministic construction:

- raw locators sorted;
- all labeled arrays sorted using the definitions above;
- snapshot record ID is SHA-256 of canonical sorted raw locators;
- email strong key is `email:` plus POSIX-lowercased trimmed address;
- international phone strong key is `phone:+` plus digits when the trimmed source begins with `+` and contains at least seven digits;
- other phone strong key is `phone-digits:` plus digits when at least seven exist;
- invalid/short values remain in the record but are omitted from strong identifiers;
- strong identifier arrays are unique and sorted.

Production Contacts fetch keys are one constant, `ContactsStoreActor.readKeys`. They include only fields represented above plus `CNContactImageDataAvailableKey`. They exclude `CNContactNoteKey`, `CNContactImageDataKey`, and `CNContactThumbnailImageDataKey`.

## 9. Raw and unified grouping

`ContactsStoreActor` performs all Contacts.framework work serially:

1. resolve each approved `CNContainer` by exact identifier;
2. enumerate with a container predicate and `CNContactFetchRequest.unifyResults = false`;
3. map each immutable raw card to `RawContactCard` inside the actor;
4. call `unifiedContact(withIdentifier:keysToFetch:)` for the raw identifier;
5. group cards that return the same observed unified identifier;
6. if unified lookup fails, keep the card as a singleton, increment failure count, and emit `.unifiedLookupFailed`;
7. stop before emitting a record beyond `maximumRecordCount`, set `truncated`, and return `.resultLimitReached`.

No `CNContact` leaves the actor.

## 10. Reconciliation

```swift
public struct PriorContactIdentity: Codable, Equatable, Sendable {
    public let durableRecordId: String
    public let rawLocators: [RawContactLocator]
    public let strongIdentifiers: StrongContactIdentifiers
    public let contactType: ContactRecordType
    public let normalizedName: String?
    public let normalizedOrganization: String?
}

public enum ContactAmbiguityReason: String, Codable, Sendable {
    case multipleRawLocatorMatches
    case multipleStrongIdentifierMatches
    case strongIdentifierContradiction
    case recordTypeContradiction
}

public enum ContactMatchDecision: Equatable, Sendable {
    case matched(durableRecordId: String, reason: String)
    case newRecord
    case ambiguous(reason: ContactAmbiguityReason, candidateIds: [String])
}

public enum ContactReconciler {
    public static func decide(
        current: ContactRecord,
        prior: [PriorContactIdentity]
    ) -> ContactMatchDecision
}
```

Before an automatic match:

- when both sides have at least one strong identifier and their combined email/phone sets are disjoint, return `.strongIdentifierContradiction`;
- when record types differ and both records have nonempty type-defining person/organization data, return `.recordTypeContradiction`;
- absence of strong identifiers is not a contradiction.

Then apply:

1. one exact raw-locator-set match;
2. one unique raw-locator-overlap match;
3. one unique strong-identifier match;
4. no match becomes `.newRecord`;
5. several candidates become ambiguity.

Display name and organization are never match keys. A changed locator is preserved as an alias transition by the later Gate D importer; Gate B proves the reconciler reports the decision deterministically.

## 11. Outcome semantics

| Condition | Result |
|---|---|
| user cancels before authentication or export | no completed directory |
| malformed request before authentication | no completed directory |
| permission denied or restricted after authentication | signed `unavailable` snapshot |
| Contacts store cannot be read | signed `unavailable` snapshot |
| limited authorization | signed `partial` snapshot |
| result limit reached | signed `partial` snapshot |
| per-card, mapping, or unified failures with useful records | signed `partial` snapshot |
| full authorization, scope exhausted, no failures | signed `complete` snapshot |
| full authorization, scope exhausted, zero raw cards | signed `complete` snapshot with `.validEmptyScope` |
| invariant/signing/filesystem failure before finalization | no `COMPLETE`; validator rejects the run |

`cancelled` is reserved for a future signed audit artifact and is not emitted in Gate B.

## 12. Secure Enclave collector key

Collector key constants:

```text
Keychain service: com.jordanschwartz.gbrain.coldstart.contacts.snapshot-signing
Keychain account: p256-secure-enclave-v1
accessibility: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
synchronizable: false
access group: none
access-control flags: privateKeyUsage and userPresence
```

Implementation uses `SecureEnclave.P256.Signing.PrivateKey`:

- creation receives the fresh export `LAContext` and the access control above;
- persisted value is only `dataRepresentation` in the app-private Keychain item;
- restoration receives the same authorized context;
- public output is `publicKey.x963Representation`;
- signatures use `signature(for: bytes).derRepresentation`;
- there is no production software-key fallback;
- key loss or reinstall requires enrollment again.

Software P-256 keys exist only in package and test targets under distinct service names.

The `AuthorizedContactsRun` is consumed before Contacts access begins. The same private grant retains its `LAContext` solely for the signing-key operation; it cannot authorize another run and is invalidated immediately after signing or failure.

## 13. Snapshot write order

For `<root>/<run-id>/contacts/`, the collector writes:

1. canonical contact records to `records.ndjson`, sorted by `snapshotRecordId`, one line each;
2. canonical private errors to `errors.ndjson`, sorted by `(code.rawValue, opaqueRecordLocatorDigest ?? "")`;
3. hashes and lengths of those two files;
4. `public-receipt.json`, containing the records and errors hashes but no self-hash;
5. the public-receipt hash and length;
6. `hashes.sha256`, sorted by filename with exact lines `<sha256>  <filename>\n` for the three declared content files;
7. `private-manifest.json`, declaring those three content files plus the hash of `hashes.sha256`;
8. raw DER `snapshot.sig` over the exact manifest bytes;
9. `COMPLETE` last, containing the manifest digest.

The manifest does not declare or hash itself. The signature does not sign itself. `COMPLETE` has no authority beyond binding finalization to the already signed manifest.

## 14. Safe filesystem rules

Collector and validator use Darwin file-descriptor APIs for finalized protocol files:

- open the selected root and descendants with directory file descriptors;
- create directories with mode `0700`;
- create files with `openat`, `O_CREAT | O_EXCL | O_WRONLY | O_NOFOLLOW`, mode `0600`;
- write to temporary names generated by the collector;
- `fsync` files and parent directory;
- rename atomically inside the same directory;
- never accept a caller-supplied descendant path;
- reject an existing run/domain directory;
- never append after `COMPLETE`.

Snapshot root policy requires:

- selected through `NSOpenPanel`;
- app-scoped security-scoped bookmark;
- local volume resource value is true;
- path is not beneath iCloud `Mobile Documents`, Dropbox, OneDrive, Google Drive, or another configured sync root;
- no ancestor contains `.git`;
- owner UID equals the current effective UID;
- root mode is owner-only after normalization to `0700`;
- stale bookmarks require reselection.

## 15. Collector enrollment

```swift
public struct CollectorEnrollmentDocument: Codable, Equatable, Sendable {
    public let schemaVersion: Int
    public let domain: CollectorDomain
    public let publicKeyX963Base64: String
    public let keyFingerprint: String
    public let codeIdentity: CodeIdentityClaim
    public let issuedAt: String
}

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

Collector enrollment export is a visible collector action requiring fresh device-owner authentication. It writes the canonical document and raw DER signature to a user-selected local directory. It does not export the private key.

Validator enrollment:

1. visibly select `ContactsCollector.app` and the enrollment document/signature;
2. require fresh `.deviceOwnerAuthentication`;
3. verify the selected app with `SecStaticCodeCheckValidityWithErrors`;
4. recompute bundle ID, Team ID, designated requirement, CDHash, executable hash, and entitlements hash;
5. require exact equality with the enrollment document;
6. decode the X9.63 key and verify the enrollment signature;
7. store the trust record, including a security-scoped bookmark to the selected app, in the validator's app-private Keychain item.

Validator trust Keychain constants:

```text
service: com.jordanschwartz.gbrain.coldstart.validator.collector-trust
account: contacts-v1
accessibility: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
synchronizable: false
access group: none
```

Any key, code identity, or stale bookmark change requires visible re-enrollment.

## 16. Validation order

Before parsing any contact record, the validator:

1. opens a user-selected snapshot directory with security scope;
2. loads the contacts trust record from its Keychain;
3. resolves the enrolled collector-app bookmark;
4. rejects a stale/missing bookmark;
5. revalidates and re-inspects that app's current code identity;
6. requires exact match to the enrolled identity;
7. reads exact manifest bytes under the file cap;
8. verifies `snapshot.sig` with the enrolled X9.63 public key;
9. decodes the manifest and checks schema/domain/key fingerprint/code identity;
10. verifies `COMPLETE` against the manifest digest;
11. validates fixed filenames, ownership, modes, link counts, sizes, no symlinks, and no subdirectories;
12. rejects undeclared files except the fixed protocol files;
13. hashes every declared content file and `hashes.sha256`;
14. checks byte lengths and exact hash-list contents;
15. only then decodes the public receipt, records, and errors;
16. enforces NDJSON line counts, schema, record hashes, ordering, coverage counts, and status semantics;
17. writes a signed validation receipt in the validator sandbox.

Per-validation app reinspection prevents an updated app that retained the old Keychain key from claiming an enrolled older code identity.

## 17. Validator receipt

```swift
public struct ValidationReceipt: Codable, Equatable, Sendable {
    public let schemaVersion: Int
    public let manifestSha256: String
    public let collectorDomain: CollectorDomain
    public let collectorKeyFingerprint: String
    public let collectorCodeIdentity: CodeIdentityClaim
    public let snapshotStatus: SnapshotStatus
    public let recordCount: Int
    public let validatedAt: String
    public let validatorCodeIdentity: CodeIdentityClaim
    public let validatorKeyFingerprint: String
}
```

Validator receipt key:

```text
service: com.jordanschwartz.gbrain.coldstart.validator.receipt-signing
account: p256-secure-enclave-v1
accessibility: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
access-control flags: privateKeyUsage
```

Receipt location:

```text
~/Library/Containers/com.jordanschwartz.gbrain.coldstart.validator/
Data/Library/Application Support/ValidationReceipts/<manifest-sha256>/
```

Files are `validation-receipt.json`, `validation-receipt.sig`, and `COMPLETE`, modes `0600` under a `0700` directory. Gate B records their digest through visible validator UI. Gate D later defines how GBrain consumes validator receipts.

## 18. Validator file limits

```text
private-manifest.json  1 MiB
public-receipt.json    1 MiB
records.ndjson       256 MiB
errors.ndjson          4 MiB
hashes.sha256          1 MiB
snapshot.sig         256 bytes maximum
COMPLETE              exactly 65 bytes
```

Validation uses `lstat`, `openat(..., O_NOFOLLOW)`, `fstat`, owner UID equality, exact modes, and link count `1`. It reads and hashes every byte under the cap. Sparse-file detection uses `SEEK_HOLE` when supported; lack of support is a recorded qualification limitation, not a reason to infer safety from block counts.

## 19. Public receipt privacy

`public-receipt.json` may contain only:

- protocol/domain versions;
- run ID;
- status;
- per-run public scope digest;
- collector version and public code-identity hashes;
- collector key fingerprint;
- timestamps;
- counts and booleans from `ContactsCoverage`;
- warning/error codes and counts;
- `records.ndjson` and `errors.ndjson` hashes.

It contains no container/contact identifier, name, email, phone, address, organization, title, relationship, social handle, request payload, LocalAuthentication detail, or source-derived free text.

## 20. Gate B separation

- Package tests may use software P-256 keys and fake user-presence protocols.
- UI tests target `ContactsCollectorTestHost` only.
- Production apps contain no test switch.
- CI proves source, package, schema, and deterministic fixture properties only.
- Gate B uses final Apple Development-signed Release apps, real TCC, real LocalAuthentication, real Secure Enclave keys, and a dedicated macOS test user containing fictional Contacts records only.
- Passing CI never implies Gate B.

## 21. Fixed synthetic coverage

Automated unit/integration fixtures cover:

- raw cards linked across two containers;
- duplicate display names;
- identifier drift and contradiction rules;
- limited authorization result shaping;
- valid empty scope;
- canonical JSON and cryptographic vectors;
- snapshot tampering, wrong key, stale collector bookmark, changed collector binary, path traversal, symlink, hard link, undeclared file, truncation, interruption, and rerun determinism.

Final signed-build live qualification in a dedicated synthetic macOS user covers:

- person card;
- organization-only card;
- multiple labeled emails and phones;
- birthday and labeled date;
- duplicate names;
- a card containing a note, proving note content is neither fetched nor exported;
- permission grant, denial, restriction/limited state when available on that macOS build;
- device-owner authentication success, cancellation, failure, timeout, request mutation, and attempted reuse;
- export and validator enrollment/signature flows;
- before/after semantic equality of the fictional Contacts store;
- interrupted export and identical rerun.

When a live OS state cannot be induced safely, the report labels the corresponding evidence as fixture-only. It does not silently upgrade fixture evidence to a live proof.

## 22. Decision locks

Changing any item below requires design review:

- one Contacts bundle ID and one separate validator bundle ID;
- no production headless/CLI/XPC/URL export path;
- fresh device-owner authentication for every export;
- no Contacts notes or image bytes;
- no mutable Contacts APIs;
- Secure Enclave-only production collector signing key;
- X9.63 public key and DER signature formats;
- validator reinspection of the enrolled collector app on every validation;
- no real Contacts data before Gate B;
- no Calendar, Mail, Messages, or GBrain ingestion work in this plan.
