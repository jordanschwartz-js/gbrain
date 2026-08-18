# Calendar Collector Normative Implementation Contract

**Plan:** `docs/superpowers/plans/2026-08-18-calendar-collector.md`  
**Scaffolding appendix:** `docs/superpowers/plans/2026-08-18-calendar-collector-scaffolding.md`  
**Spec:** `docs/superpowers/specs/2026-08-18-cold-start-apple-reader-design.md`  
**Status:** Required companion to the Calendar implementation plan

This contract fixes the Calendar-specific module boundaries, wire models, EventKit lifecycle, window semantics, recurrence and all-day representations, identity and reconciliation rules, cryptographic isolation, and validator extension. The executor must read all three Calendar plan documents and the approved architecture before changing the implementation repository.

The design document mentions a “limited” Calendar authorization state in one qualification list. EventKit exposes no limited Calendar state. This contract corrects that wording: Calendar qualification covers `.fullAccess`, `.writeOnly`, `.denied`, `.restricted`, `.notDetermined`, and unknown future values.

## 1. Preconditions and non-regression boundary

Calendar implementation begins only after all of the following are true:

1. the Contacts Collector plan has been implemented;
2. Gate B has passed on the recorded Contacts Collector build;
3. the Contacts work is merged into `main` of `jordanschwartz-js/cold-start-apple-collectors`;
4. package, app, validator, and project-generation baseline tests pass from that `main` revision;
5. the exact qualified Contacts Collector `.app` artifact and Gate B report are retained outside the build directory.

Calendar work must not modify or re-sign:

- `Apps/ContactsCollector/**`;
- `Apps/ContactsCollectorTestHost/**`;
- the Contacts Collector bundle identifier, entitlements, Keychain service, signing key, or enrolled public key;
- Contacts record or manifest wire schemas;
- the qualified Contacts Collector binary installed for Gate B.

The Calendar branch may extend the shared validator and build tooling. Before Gate C can pass, the updated validator must still verify every retained Gate B Contacts fixture and the retained signed Gate B snapshot.

## 2. Fixed package graph

Calendar adds three packages without making the Contacts app depend on them:

```text
SnapshotProtocol                         existing package; no Calendar changes required
        ▲
        ├──────── CalendarSnapshotProtocol  Calendar request, coverage, manifest, receipt
        │                       ▲
        │                       ├──────── CalendarDomain
        │                       │               ▲
        │                       │               │
        │                       └── CalendarCollectorFeature
        │
        └── ContactsDomain ───────────────┐
                                         ▼
                               SnapshotValidatorKit
                               extended to verify both domains
```

Application targets:

```text
CalendarCollector.app
  ├── SnapshotProtocol
  ├── CalendarSnapshotProtocol
  ├── CalendarDomain
  ├── CalendarCollectorFeature
  ├── EventKit.framework
  ├── LocalAuthentication
  ├── CryptoKit and Security.framework
  └── AppKit file panels

SnapshotValidator.app
  ├── existing Contacts validation dependencies
  ├── CalendarSnapshotProtocol
  ├── CalendarDomain
  ├── SnapshotValidatorKit
  ├── LocalAuthentication
  ├── CryptoKit and Security.framework
  └── AppKit file panels
```

Rules:

- `CalendarSnapshotProtocol` imports Foundation, CryptoKit hashing through `SnapshotProtocol`, and no EventKit, LocalAuthentication, Security, SwiftUI, or AppKit API.
- `CalendarDomain` imports Foundation, `SnapshotProtocol`, and `CalendarSnapshotProtocol`; it imports no EventKit.
- `CalendarCollectorFeature` imports SwiftUI and the three packages, but no EventKit, Security, or CryptoKit.
- `SnapshotValidatorKit` may decode Calendar records only after signature, code identity, path, length, and hash verification succeeds.
- `EKEventStore`, `EKEvent`, `EKCalendar`, `EKSource`, `EKParticipant`, `EKRecurrenceRule`, `EKAlarm`, `LAContext`, `SecKey`, and `SecCode` never cross an actor or package boundary.

## 3. Platform and authorization facts

The production design assumes these EventKit facts:

- reading events requires `requestFullAccessToEvents()`;
- full access grants read and write capability, because EventKit has no read-only Calendar permission;
- a sandboxed macOS app requires `com.apple.security.personal-information.calendars`;
- `event(withIdentifier:)` and `calendarItem(withIdentifier:)` return the first occurrence rather than every occurrence in a repeating series;
- `eventIdentifier` most likely changes when an event moves calendars;
- a full sync can invalidate `calendarIdentifier` and `calendarItemIdentifier`;
- `occurrenceDate` is the original occurrence date for a recurring event;
- `isDetached` identifies a modified occurrence;
- EventKit can notify the process that the event store changed while a read is in progress.

Consequences:

1. the app explains honestly that macOS grants full read/write Calendar access;
2. the code and final binary, not the OS grant, establish the read-only implementation boundary;
3. collection uses predicates over explicit windows and calendars, never a single-identifier lookup to reconstruct a series;
4. all identifiers are local locators with versioned reconciliation, not permanent GBrain identities;
5. a store change during acquisition makes the snapshot partial and ineligible for Gate C.

## 4. Bundle, entitlement, and key identities

Production Calendar Collector:

```text
bundle ID: com.jordanschwartz.gbrain.coldstart.calendar
Keychain service: com.jordanschwartz.gbrain.coldstart.calendar.snapshot-signing
Keychain account: p256-secure-enclave-v1
```

Production entitlements are exactly:

```xml
<key>com.apple.security.app-sandbox</key>
<true/>
<key>com.apple.security.personal-information.calendars</key>
<true/>
<key>com.apple.security.files.user-selected.read-write</key>
<true/>
```

It has no Contacts, Reminders, Mail, Photos, location, microphone, camera, Bluetooth, network client/server, Apple Events, automation, app-group, Keychain access-group, application-group, Full Disk Access, or temporary sandbox exception entitlement.

`Info.plist` contains:

```xml
<key>NSCalendarsFullAccessUsageDescription</key>
<string>GBrain Calendar Collector needs full Calendar access because macOS does not offer read-only Calendar permission. It reads only the calendars and date range you approve to create a local snapshot, and it does not create, edit, move, invite, or delete events.</string>
```

The Calendar signing key uses the same cryptographic format and Secure Enclave policy as Contacts, but a separate service, private key, public key, fingerprint, and validator trust record. Contacts and Calendar keys are never shared.

## 5. Canonical encoding and signature formats

Calendar reuses `SnapshotProtocol.CanonicalJSON` version 1 exactly:

- UTF-8, no BOM;
- sorted keys;
- unescaped forward slashes;
- no insignificant whitespace;
- no floating-point values in signed structures;
- UTC RFC 3339 timestamps with exactly three fractional digits;
- lowercase canonical UUID strings;
- lowercase SHA-256 hexadecimal;
- no trailing newline on signed JSON;
- one newline on each NDJSON record and on `COMPLETE`.

Calendar reuses:

- SHA-256;
- P-256 signatures;
- 65-byte ANSI X9.63 uncompressed public keys;
- SHA-256 fingerprint over the exact X9.63 bytes;
- ECDSA P-256/SHA-256 ASN.1 DER signatures;
- raw DER `snapshot.sig` and enrollment signatures;
- a 65-byte `COMPLETE` file containing the signed manifest digest plus `\n`.

Coordinates, radii, and alarm offsets are converted to scaled integers before encoding:

- latitude and longitude: degrees multiplied by `10_000_000`, rounded to nearest or away from zero;
- radius: meters multiplied by `1_000`, rounded to an integer number of millimeters;
- relative alarm offsets: seconds multiplied by `1_000`, rounded to integer milliseconds.

## 6. CalendarSnapshotProtocol models

Create these types exactly in `CalendarSnapshotProtocol`.

```swift
public enum CalendarCollectorDomain: String, Codable, Sendable {
    case calendar
}

public struct CalendarCollectorWindow: Codable, Equatable, Sendable {
    public let start: String
    public let end: String
}

public struct CalendarCollectorLimits: Codable, Equatable, Sendable {
    public let maxRecords: Int
}

public struct CalendarCollectorRequest: Codable, Equatable, Sendable {
    public let schemaVersion: Int
    public let runId: UUID
    public let domain: CalendarCollectorDomain
    public let requestedAt: String
    public let window: CalendarCollectorWindow
    public let suggestedScopeIds: [String]
    public let limits: CalendarCollectorLimits
}

public enum StrictCalendarRequestDecoder {
    public static func decode(from data: Data) throws -> CalendarCollectorRequest
}

public enum CalendarAuthorizationValue: String, Codable, Sendable {
    case fullAccess
    case writeOnly
    case denied
    case restricted
    case notDetermined
    case unknown
}

public enum CalendarWarningCode: String, Codable, CaseIterable, Sendable {
    case delegateSourcesExcludedByDesign
    case resultLimitReached
    case eventStoreChangedDuringRead
    case calendarResolutionFailed
    case eventMappingFailed
    case duplicateSegmentRowsSuppressed
    case unsupportedEvent
    case recordSizeExceeded
    case validEmptyScope
}

public enum CalendarErrorCode: String, Codable, CaseIterable, Sendable {
    case invalidRequest
    case fullAccessRequired
    case permissionDenied
    case permissionRestricted
    case authenticationCancelled
    case authenticationFailed
    case authenticationExpired
    case requestChangedAfterAuthentication
    case snapshotRootRejected
    case calendarNotFound
    case eventStoreChanged
    case sourceUnavailable
    case eventReadFailed
    case mappingFailed
    case secureEnclaveUnavailable
    case signingFailed
    case filesystemFailure
    case invariantViolation
}

public struct CalendarErrorSummary: Codable, Equatable, Sendable {
    public let code: CalendarErrorCode
    public let count: Int
}

public struct PrivateCalendarError: Codable, Equatable, Sendable {
    public let code: CalendarErrorCode
    public let opaqueLocatorDigest: String?
    public let diagnostic: String
}

public struct CalendarCoverage: Codable, Equatable, Sendable {
    public let authorization: CalendarAuthorizationValue
    public let requestedStart: String
    public let requestedEnd: String
    public let effectiveStart: String
    public let effectiveEnd: String
    public let requestedCalendarCount: Int
    public let approvedCalendarCount: Int
    public let resolvedCalendarCount: Int
    public let delegateSourceCountObserved: Int
    public let delegatedSourcesIncluded: Bool
    public let segmentCount: Int
    public let rawEventRowsObserved: Int
    public let returnedEventRecordCount: Int
    public let duplicateRowsSuppressed: Int
    public let failedEventCount: Int
    public let maximumRecordCount: Int
    public let observedCountIsLowerBound: Bool
    public let truncated: Bool
    public let eventStoreChangedDuringRead: Bool
    public let localObservationOnly: Bool
}

public struct CalendarSnapshotManifest: Codable, Equatable, Sendable {
    public let schemaVersion: Int
    public let domainSchemaVersion: Int
    public let runId: UUID
    public let collector: CalendarCollectorDomain
    public let status: SnapshotStatus
    public let requestDigest: String
    public let effectiveScopeDigest: String
    public let collectorVersion: String
    public let codeIdentity: CodeIdentityClaim
    public let signingKeyFingerprint: String
    public let signatureAlgorithm: String
    public let startedAt: String
    public let completedAt: String
    public let coverage: CalendarCoverage
    public let contentFiles: [SnapshotContentFile]
    public let hashesFileSha256: String
    public let warningCodes: [CalendarWarningCode]
    public let errorSummary: [CalendarErrorSummary]
}

public struct CalendarPublicReceipt: Codable, Equatable, Sendable {
    public let schemaVersion: Int
    public let domainSchemaVersion: Int
    public let runId: UUID
    public let collector: CalendarCollectorDomain
    public let status: SnapshotStatus
    public let publicScopeDigest: String
    public let collectorVersion: String
    public let codeIdentity: CodeIdentityClaim
    public let signingKeyFingerprint: String
    public let startedAt: String
    public let completedAt: String
    public let coverage: CalendarCoverage
    public let catalogSha256: String
    public let eventsSha256: String
    public let errorsSha256: String
    public let warningCodes: [CalendarWarningCode]
    public let errorSummary: [CalendarErrorSummary]
}
```

Ordering:

- `contentFiles` by filename;
- warnings by raw value;
- errors by raw value;
- no calendar title, source title, event title, attendee, organizer, location, note, URL, identifier, or raw request payload enters `CalendarPublicReceipt`.

## 7. Strict request and frozen effective scope

```swift
public struct FrozenCalendarScopeItem: Codable, Equatable, Comparable, Sendable {
    public let sourceIdentifier: String
    public let calendarIdentifier: String
    public let sourceTypeRawValue: Int
    public let calendarTypeRawValue: Int
    public let titleSha256: String
}

public struct EffectiveCalendarScope: Codable, Equatable, Sendable {
    public let runId: UUID
    public let eventStoreIdentifier: String
    public let requestedWindow: CalendarCollectorWindow
    public let effectiveWindow: CalendarCollectorWindow
    public let selectedCalendars: [FrozenCalendarScopeItem]
    public let maxRecords: Int
    public let snapshotRootBookmarkVersion: Int
}

public struct FrozenCalendarRequest: Codable, Equatable, Sendable {
    public let request: CalendarCollectorRequest
    public let effectiveScope: EffectiveCalendarScope
}
```

Rules:

- request schema version exactly `1`;
- domain exactly `calendar`;
- timestamps strictly parse as UTC or offset-bearing RFC 3339 instants;
- requested start is before requested end;
- requested window is no longer than 90 calendar days in UTC;
- `maxRecords` is `1...100_000`;
- unknown keys are rejected recursively before decoding;
- the effective window may equal or narrow the requested window and can never broaden it;
- selected calendars are a deduplicated subset of calendars visible in the reviewed catalog;
- selected calendars sort by source ID then calendar ID;
- title hashes use SHA-256 over the exact UTF-8 Calendar title shown during review;
- `effectiveScopeDigest = SHA256(canonical EffectiveCalendarScope)`;
- `requestDigest = SHA256(canonical FrozenCalendarRequest)`;
- `publicScopeDigest = SHA256(UTF8(lowercase runId) || 0x00 || UTF8(effectiveScopeDigest))`.

Immediately after authentication and before reading events, the collector creates a fresh EventKit store, re-resolves every selected calendar, and compares event-store ID, source ID, calendar ID, type raw values, and title hash to the frozen scope. Any mismatch invalidates the authorization and requires a new review/authentication cycle.

## 8. Swift 6 isolation and EventKit lifecycle

`CalendarCollectorFeature` defines plain DTO seams:

```swift
@MainActor
public protocol AuthorizedCalendarRun: AnyObject {
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
public protocol CalendarUserPresenceAuthorizing: AnyObject {
    func authorize(
        frozenRequest: FrozenCalendarRequest,
        requestDigest: String,
        effectiveScopeDigest: String
    ) async throws -> any AuthorizedCalendarRun
}

@MainActor
public protocol CalendarSnapshotSigning: AnyObject {
    func identity() async throws -> CollectorKeyIdentity
    func sign(
        _ bytes: Data,
        authorization: any AuthorizedCalendarRun
    ) async throws -> Data
}

public protocol CalendarAuthorizing: Sendable {
    func status() async -> CalendarAuthorizationValue
    func requestFullAccess() async throws -> CalendarAuthorizationValue
}

public protocol CalendarCatalogListing: Sendable {
    func listCatalog() async throws -> CalendarCatalogReadResult
}

public protocol CalendarEventReading: Sendable {
    func readEvents(
        frozenScope: EffectiveCalendarScope
    ) async throws -> RawCalendarReadResult
}
```

Live rules:

- `CalendarAuthorizationService` is `@MainActor` and never fetches calendars or events before full access is granted;
- after a successful permission request, the app creates a fresh `EKEventStore` instead of relying on a store used before authorization;
- `CalendarEventStoreActor` owns one `EKEventStore` per catalog or export run;
- all EventKit objects are mapped to immutable DTOs inside that actor;
- EventKit objects never escape the actor;
- the actor retains the event store until mapping is complete;
- the export run subscribes to `.EKEventStoreChanged` before the first segment and stops observing after the last segment;
- any observed store-change notification sets `eventStoreChangedDuringRead = true` and forces `partial` status;
- the actor never calls `save`, `remove`, `saveCalendar`, `removeCalendar`, `commit`, `reset`, `rollback`, `refresh`, or a mutation initializer.

LocalAuthentication behavior is identical to Contacts except that the grant type and Keychain service are Calendar-specific. A grant expires after 60 seconds, is consumed once before source reading, and is invalidated on backgrounding, scope change, failure, or restart.

## 9. Window segmentation and event inclusion

```swift
public struct CalendarWindowSegment: Equatable, Sendable {
    public let index: Int
    public let start: Date
    public let end: Date
}

public enum CalendarWindowSegmenter {
    public static func segments(
        start: Date,
        end: Date,
        maximumDaysPerSegment: Int = 31
    ) throws -> [CalendarWindowSegment]
}
```

Rules:

- use Gregorian UTC calendar arithmetic, not fixed seconds and not local-time arithmetic;
- segments are contiguous half-open ranges `[start, end)`;
- no gap and no overlap exists between segment boundaries;
- the final segment ends exactly at the effective end;
- a 90-day window produces three segments of 31, 31, and 28 days, subject to leap-day placement;
- reject empty, reversed, over-90-day, or more-than-four-segment windows;
- EventKit queries each segment with `predicateForEvents(withStart:end:calendars:)` and `events(matching:)`;
- after EventKit returns rows, apply the explicit overlap predicate `event.startDate < effectiveEnd && event.endDate > effectiveStart`; zero-duration events use `start >= effectiveStart && start < effectiveEnd`;
- events spanning segment boundaries may appear more than once and are deduplicated as described below;
- collection stops after observing `maxRecords + 1` unique candidate events and marks the observed count as a lower bound.

## 10. Calendar catalog models

```swift
public enum CalendarSourceTypeName: String, Codable, Sendable {
    case local
    case exchange
    case calDAV
    case mobileMe
    case subscribed
    case birthdays
    case unknown
}

public enum CalendarTypeName: String, Codable, Sendable {
    case local
    case calDAV
    case exchange
    case subscription
    case birthday
    case unknown
}

public struct CalendarCatalogRecord: Codable, Equatable, Sendable {
    public let schemaVersion: Int
    public let eventStoreIdentifier: String
    public let sourceIdentifier: String
    public let sourceTitle: String
    public let sourceType: CalendarSourceTypeName
    public let sourceTypeRawValue: Int
    public let sourceIsDelegate: Bool
    public let calendarIdentifier: String
    public let calendarTitle: String
    public let calendarType: CalendarTypeName
    public let calendarTypeRawValue: Int
    public let allowsContentModifications: Bool
    public let isImmutable: Bool
    public let isSubscribed: Bool
    public let allowedEntityTypesRawValue: UInt
    public let supportedAvailabilityMaskRawValue: UInt
    public let colorRGBA8Hex: String?
    public let contentHash: String
}

public struct CalendarCatalogReadResult: Equatable, Sendable {
    public let eventStoreIdentifier: String
    public let calendars: [CalendarCatalogRecord]
    public let delegateSourceCountObserved: Int
    public let delegatedSourcesIncluded: Bool
}
```

Catalog rules:

- use `calendars(for: .event)` from the default event store;
- observe but do not open delegate sources in V1;
- record delegate-source count and `delegatedSourcesIncluded = false`;
- sort records by source title, calendar title, source ID, then calendar ID;
- `contentHash` covers the catalog payload except itself;
- color is best-effort and never an identity field;
- a full sync may invalidate source/calendar IDs, so these remain local locators.

## 11. Calendar event wire models

### 11.1 Common locator and source context

```swift
public struct CalendarObservedLocator: Codable, Equatable, Sendable {
    public let eventStoreIdentifier: String
    public let sourceIdentifier: String
    public let calendarIdentifier: String
    public let calendarItemIdentifier: String
    public let calendarItemExternalIdentifier: String?
    public let eventIdentifier: String?
    public let occurrenceAnchor: String
    public let isDetached: Bool
}

public struct CalendarSourceContext: Codable, Equatable, Sendable {
    public let sourceIdentifier: String
    public let sourceTitle: String
    public let sourceType: CalendarSourceTypeName
    public let sourceTypeRawValue: Int
    public let sourceIsDelegate: Bool
    public let calendarIdentifier: String
    public let calendarTitle: String
    public let calendarType: CalendarTypeName
    public let calendarTypeRawValue: Int
}

public struct CalendarEnumValue: Codable, Equatable, Comparable, Sendable {
    public let name: String
    public let rawValue: Int
}
```

A saved event missing `calendarItemIdentifier` or source/calendar context is unsupported in V1 and produces a private mapping error. The collector never fabricates an identifier.

### 11.2 Time and all-day representation

```swift
public struct CalendarInstantSpan: Codable, Equatable, Sendable {
    public let start: String
    public let end: String
    public let timeZoneIdentifier: String?
}

public struct CalendarLocalDate: Codable, Equatable, Comparable, Sendable {
    public let calendarIdentifier: String
    public let era: Int?
    public let year: Int
    public let month: Int
    public let day: Int
}

public enum CalendarTimeZoneSource: String, Codable, Sendable {
    case event
    case systemCurrentAtCollection
}

public struct CalendarAllDaySpan: Codable, Equatable, Sendable {
    public let startDate: CalendarLocalDate
    public let endExclusiveDate: CalendarLocalDate
    public let interpretationTimeZoneIdentifier: String
    public let timeZoneSource: CalendarTimeZoneSource
}
```

All events preserve absolute start/end instants. All-day events additionally preserve local start and exclusive-end date components using `event.timeZone ?? TimeZone.current`, with the source of that choice explicit. GBrain must use the local date span for calendar-day filing, not derive a day from UTC alone.

### 11.3 Recurrence

```swift
public struct CalendarRecurrenceDayOfWeek: Codable, Equatable, Comparable, Sendable {
    public let dayOfWeekRawValue: Int
    public let weekNumber: Int
}

public enum CalendarRecurrenceEndKind: String, Codable, Sendable {
    case never
    case date
    case count
}

public struct CalendarRecurrenceEndRecord: Codable, Equatable, Sendable {
    public let kind: CalendarRecurrenceEndKind
    public let endDate: String?
    public let occurrenceCount: Int?
}

public struct CalendarRecurrenceRuleRecord: Codable, Equatable, Sendable {
    public let calendarIdentifier: String?
    public let frequency: CalendarEnumValue
    public let interval: Int
    public let firstDayOfWeek: Int
    public let daysOfTheWeek: [CalendarRecurrenceDayOfWeek]
    public let daysOfTheMonth: [Int]
    public let monthsOfTheYear: [Int]
    public let weeksOfTheYear: [Int]
    public let daysOfTheYear: [Int]
    public let setPositions: [Int]
    public let end: CalendarRecurrenceEndRecord
}
```

Preserve every recurrence selector EventKit exposes. Negative ordinal values remain negative. Arrays sort numerically, except days of week sort by raw day then week number. No recurrence rule is approximated or reverse-engineered from expanded occurrences.

### 11.4 Participants, location, and alarms

```swift
public struct CalendarParticipantRecord: Codable, Equatable, Comparable, Sendable {
    public let name: String?
    public let url: String
    public let isCurrentUser: Bool
    public let role: CalendarEnumValue
    public let status: CalendarEnumValue
    public let type: CalendarEnumValue
    public let scheduleStatus: CalendarEnumValue
}

public struct CalendarStructuredLocationRecord: Codable, Equatable, Sendable {
    public let title: String?
    public let latitudeE7: Int64?
    public let longitudeE7: Int64?
    public let radiusMillimeters: Int64?
}

public enum CalendarAlarmKind: String, Codable, Sendable {
    case absolute
    case relative
    case location
    case unknown
}

public struct CalendarAlarmRecord: Codable, Equatable, Comparable, Sendable {
    public let kind: CalendarAlarmKind
    public let absoluteDate: String?
    public let relativeOffsetMilliseconds: Int64?
    public let structuredLocation: CalendarStructuredLocationRecord?
    public let proximity: CalendarEnumValue?
}
```

Participant sorting key: normalized URL, name, role raw value, type raw value. The collector never evaluates `contactPredicate`, requests Contacts permission, or resolves a participant through Contacts. Alarm sorting uses kind, absolute date, relative offset, and location fields.

### 11.5 Event record

```swift
public struct CalendarStrongFingerprintPayload: Codable, Equatable, Sendable {
    public let externalIdentifier: String?
    public let occurrenceAnchor: String
    public let isDetached: Bool
    public let isAllDay: Bool
    public let instantSpan: CalendarInstantSpan
    public let allDaySpan: CalendarAllDaySpan?
    public let normalizedTitle: String
    public let organizerURL: String?
    public let sourceTypeRawValue: Int
    public let calendarTypeRawValue: Int
}

public struct CalendarEventHashPayload: Codable, Equatable, Sendable {
    public let schemaVersion: Int
    public let identityMapVersion: Int
    public let snapshotRecordId: String
    public let observedLocator: CalendarObservedLocator
    public let strongFingerprint: String
    public let source: CalendarSourceContext
    public let title: String
    public let notes: String?
    public let location: String?
    public let structuredLocation: CalendarStructuredLocationRecord?
    public let url: String?
    public let creationDate: String?
    public let lastModifiedDate: String?
    public let instantSpan: CalendarInstantSpan
    public let isAllDay: Bool
    public let allDaySpan: CalendarAllDaySpan?
    public let occurrenceDate: String?
    public let isDetached: Bool
    public let recurrenceRules: [CalendarRecurrenceRuleRecord]
    public let alarms: [CalendarAlarmRecord]
    public let organizer: CalendarParticipantRecord?
    public let attendees: [CalendarParticipantRecord]
    public let hasAttendees: Bool
    public let status: CalendarEnumValue
    public let availability: CalendarEnumValue
    public let birthdayContactIdentifier: String?
}

public struct CalendarEventRecord: Codable, Equatable, Sendable {
    public let payload: CalendarEventHashPayload
    public let contentHash: String
}
```

As with Contacts, the wire representation is flat rather than nested under `payload`; implement custom coding or a factory so `contentHash` is excluded from its own hash.

Mapping rules:

- `occurrenceAnchor = occurrenceDate ?? startDate` as canonical instant;
- `snapshotRecordId = SHA256(canonical CalendarObservedLocator)`;
- `strongFingerprint = SHA256(canonical CalendarStrongFingerprintPayload)`;
- `contentHash = SHA256(canonical CalendarEventHashPayload)`;
- `hasAttendees` is retained even when the attendee array is empty;
- unknown enum raw values map to name `unknown` while preserving the raw integer;
- notes, titles, locations, URLs, participant values, and calendar/source names are untrusted source data and never control paths, logs, SQL, scripts, or configuration;
- record byte size is checked after canonical encoding and before writing.

## 12. Deterministic ordering and limits

- catalog records sort by source title, calendar title, source ID, calendar ID;
- event records sort by absolute start, all-day start date, occurrence anchor, source ID, calendar ID, and snapshot record ID;
- recurrence rules sort by canonical encoded bytes;
- attendees and alarms use the ordering above;
- maximum participant count per event: `5_000`;
- maximum recurrence rules per event: `64`;
- maximum alarms per event: `128`;
- maximum canonical event record: `4 MiB`;
- maximum total event records: request `maxRecords`, no more than `100_000`;
- no source field is silently truncated to meet a limit;
- a limit violation omits that event, writes a private error, increments failure counts, and makes the snapshot partial.

## 13. Segment deduplication and conflict handling

Within one run, build a segment deduplication key from:

```text
observed locator
start/end
all-day local span
last-modified date
```

Rules:

1. identical keys with identical content hashes collapse to one event and increment `duplicateRowsSuppressed`;
2. the same observed locator with different times or content during the run is a store-change conflict;
3. conflicting versions are not resolved by “newest wins” or segment order;
4. the snapshot becomes partial and records a private `eventStoreChanged` or `mappingFailed` diagnostic;
5. Gate C requires no conflict and no store-change notification.

## 14. Cross-run identity and reconciliation

```swift
public enum CalendarReconciliationReason: String, Codable, Sendable {
    case exactObservedLocator
    case externalIdentifierAndOccurrence
    case uniqueStrongFingerprint
    case noCandidate
    case multipleCandidates
    case strongContradiction
}

public enum CalendarReconciliationOutcome: Equatable, Sendable {
    case matched(previousSnapshotRecordId: String, reason: CalendarReconciliationReason)
    case alias(previousSnapshotRecordId: String, newSnapshotRecordId: String, reason: CalendarReconciliationReason)
    case new
    case ambiguous(candidateSnapshotRecordIds: [String], reason: CalendarReconciliationReason)
}
```

Matching order:

1. exact observed locator;
2. unique `calendarItemExternalIdentifier + occurrenceAnchor + sourceTypeRawValue` match;
3. unique strong fingerprint;
4. no candidate means new;
5. several candidates or a contradiction means ambiguity.

Contradictions fail closed when both sides have values and any of these differ materially:

- all-day versus timed;
- occurrence anchor;
- organizer URL;
- external identifier during strong-fingerprint fallback;
- recurrence/nonrecurrence state;
- detached state when the occurrence anchor is equal but one record claims a different series role.

Display title, calendar title, and source title are never sufficient match keys. A moved event or full sync produces an explicit alias only when one unique higher-confidence rule matches. Otherwise it requires review.

## 15. Snapshot status semantics

| Condition | Status |
|---|---|
| User or LocalAuthentication cancels before export | no completed snapshot |
| Invalid request or invariant before a useful read | no completed snapshot unless authentication already succeeded and a diagnostic artifact is required |
| `.denied` or `.restricted` | `unavailable` |
| `.writeOnly`, `.notDetermined`, or unknown status at read time | `unavailable` with `fullAccessRequired` |
| Selected calendar missing after authentication | `partial` |
| Event-store notification or conflicting row during read | `partial` |
| Record cap, record size, or per-event collection limit hit | `partial` |
| One or more event mapping failures with useful records | `partial` |
| Full access, frozen scope resolved, all segments exhausted, no failure/change/limit | `complete` |
| Full access and approved scope exhausted with zero events | `complete` plus `validEmptyScope` |

`complete` means complete for the approved local calendars and effective window observed in this run. It does not claim server-wide, iCloud-wide, delegated-source, or device-wide completeness.

## 16. Snapshot file set

Each Calendar run writes:

```text
<snapshot-root>/<run-id>/calendar/
├── private-manifest.json
├── public-receipt.json
├── calendar-catalog.ndjson
├── calendar-events.ndjson
├── errors.ndjson
├── hashes.sha256
├── snapshot.sig
└── COMPLETE
```

Authoritative order:

1. write catalog, events, errors, and public receipt to temporary files;
2. atomically rename those declared content files;
3. compute byte lengths and SHA-256 values;
4. write `hashes.sha256` as convenience text;
5. write canonical `private-manifest.json` containing the authoritative content table and hashes-list digest;
6. sign the exact manifest bytes and write raw DER `snapshot.sig`;
7. write `COMPLETE` last with the signed manifest digest.

Fixed file caps:

- private manifest: 1 MiB;
- public receipt: 1 MiB;
- catalog: 4 MiB;
- events: 256 MiB;
- errors: 4 MiB;
- hashes list: 1 MiB;
- signature: 256 bytes;
- COMPLETE: exactly 65 bytes.

Directories are `0700`; files are `0600`; no symlink, hard link, subdirectory, sparse surprise, undeclared content file, append-after-complete, or caller-controlled filename is accepted.

## 17. Validator extension and trust migration

The validator uses an untrusted routing hint only to select a candidate trust record:

```swift
public struct UntrustedSnapshotRoutingHint: Decodable {
    public let collector: String
    public let signingKeyFingerprint: String
}
```

Security order:

1. read bounded manifest bytes without following links;
2. decode only the routing hint;
3. select a trust record by exact domain string and fingerprint;
4. resolve and re-inspect the enrolled collector app bookmark;
5. require current code identity to equal the enrolled identity;
6. verify the signature over exact manifest bytes;
7. strict-decode the Calendar manifest;
8. require its collector/fingerprint/code identity to equal the trusted values;
9. verify COMPLETE, declared files, hashes, lengths, modes, owner, link count, and schema;
10. only then decode Calendar catalog and event records.

Trust store schema version 2:

```swift
public struct MultiDomainCollectorTrustRecord: Codable, Equatable, Sendable {
    public let schemaVersion: Int
    public let domainIdentifier: String
    public let publicKeyX963Base64: String
    public let keyFingerprint: String
    public let expectedCodeIdentity: CodeIdentityClaim
    public let collectorAppBookmarkBase64: String
    public let enrolledAt: String
    public let validatorVersion: String
}
```

Migration:

- existing Contacts trust records become version-2 records with domain `contacts`;
- migration is local, deterministic, and backed up inside validator storage;
- migration never changes the enrolled Contacts key or code identity;
- Contacts validation fixtures and retained Gate B snapshot must pass after migration;
- Calendar enrollment is a separate visible, device-owner-authenticated action.

Validator receipts remain in the validator sandbox and identify the domain. Calendar validation uses a separate receipt from Contacts, signed by the existing validator receipt key.

## 18. Public-receipt privacy and logging

Public Calendar receipts contain only:

- schema versions;
- run ID;
- status;
- run-scoped public scope digest;
- code-identity hashes;
- collector key fingerprint;
- counts, booleans, windows, segment count, and lower-bound flag;
- warning/error codes and counts;
- declared filenames, lengths, and hashes;
- start/completion timestamps.

They contain no source-derived string except the approved start/end timestamps. General logs contain no calendar/source titles, event titles, attendees, organizer, notes, location, URL, birthday contact ID, event identifiers, source identifiers, calendar identifiers, request payload, or authentication details.

Crash reporting, network telemetry, clipboard use, and automatic updates remain absent.

## 19. Gate C qualification requirements

Gate C uses a dedicated macOS test user and fictional Calendar data only. It covers:

- full-access disclosure and permission prompt;
- `.fullAccess`, `.writeOnly`, `.denied`, `.restricted`, `.notDetermined`, and unknown-state handling;
- scope narrowing without broadening;
- three deterministic segments over a 90-day window;
- timed event;
- zero-duration event;
- all-day event across a daylight-saving boundary;
- event spanning a segment boundary;
- recurring series with at least three occurrences;
- detached/edited occurrence retaining original occurrence anchor;
- event moved between two fictional calendars;
- event with full recurrence selectors;
- attendee/organizer role, status, type, and current-user flags;
- notes, URL, plain and structured location, alarm, status, and availability;
- birthday-calendar event when available in the fictional test user;
- duplicate calendar titles and duplicate event titles;
- valid empty approved calendar;
- result-limit and over-size-record paths;
- event-store notification and conflicting-row simulation;
- permission, LocalAuthentication, signing, interrupted-write, tampering, wrong-key, path, schema, and code-identity failures;
- simulated full-sync identifier loss and moved-event aliasing in the pure reconciliation layer;
- exact byte-stable rerun records;
- retained Contacts signed-snapshot regression through the updated validator;
- absence of EventKit mutations and unchanged semantic Calendar source state.

Gate C passes only on the final Apple Development-signed Release Calendar Collector and updated validator. It does not authorize Contacts requalification, Mail, Messages, GBrain ingestion, live sync, or real Calendar data.

## 20. Evidence references

Apple documentation:

- `https://developer.apple.com/documentation/eventkit/accessing-the-event-store`
- `https://developer.apple.com/documentation/eventkit/ekeventstore/requestfullaccesstoevents()`
- `https://developer.apple.com/documentation/eventkit/ekeventstore/predicateforevents(withstart:end:calendars:)`
- `https://developer.apple.com/documentation/eventkit/ekeventstore/event(withidentifier:)`
- `https://developer.apple.com/documentation/eventkit/ekeventstore/calendaritem(withidentifier:)`
- `https://developer.apple.com/documentation/eventkit/ekevent/eventidentifier`
- `https://developer.apple.com/documentation/eventkit/ekevent/occurrencedate`
- `https://developer.apple.com/documentation/eventkit/ekevent/isdetached`
- `https://developer.apple.com/documentation/eventkit/ekcalendar/calendaridentifier`
- `https://developer.apple.com/documentation/eventkit/ekcalendaritem/calendaritemidentifier`
- `https://developer.apple.com/documentation/eventkit/eksource`
- `https://developer.apple.com/documentation/eventkit/ekrecurrencerule`
- `https://developer.apple.com/documentation/eventkit/ekparticipant`
- `https://developer.apple.com/documentation/eventkit/ekalarm`
- `https://developer.apple.com/documentation/foundation/nsurl/bookmarkcreationoptions/withsecurityscope`

Reviewed implementation evidence:

- Apple PIM Calendar CLI at `18b8f91a48e537567151553bcb720eb2ee84d770`;
- PyApple Calendar implementation at `9844fa276474434be92b0ac16be6b43a7bd135f0`;
- Orchard Calendar bridge at `0de0967a1d298286f0101aec230ea86aaada8404`.

These upstream implementations are evidence and selected MIT-licensed source material, not runtime dependencies or authority for this contract.