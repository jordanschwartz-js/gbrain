# Calendar Collector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Before Task 1, use superpowers:using-git-worktrees to enter an isolated workspace. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add and synthetically qualify a visible, sandboxed macOS Calendar Collector that reads only an explicitly approved Calendar scope for at most 90 days, preserves recurrence and local all-day semantics, and writes a separately signed Calendar snapshot that the existing visible validator can verify without changing the qualified Contacts Collector.

**Architecture:** Extend the private `cold-start-apple-collectors` repository after Gate B. Add a separately signed `CalendarCollector.app`, three Calendar-only Swift packages, domain-specific request/manifest/record schemas, and a separate Secure Enclave key. Extend `SnapshotValidator.app` to enroll and verify Calendar independently while retaining Contacts trust and validation behavior. EventKit objects remain inside one actor; the collector reads three bounded UTC segments, detects store changes, deduplicates boundary overlaps, and emits immutable DTOs only.

**Tech Stack:** Xcode 27.x, Swift 6 strict concurrency, SwiftUI, AppKit file panels, EventKit, LocalAuthentication, CryptoKit/Secure Enclave, Security.framework, Foundation, XCTest/XCUITest, the repository’s pinned XcodeGen 2.46.0 tooling, and standard-library Python for fixture/ICS validation.

**Spec:** `docs/superpowers/specs/2026-08-18-cold-start-apple-reader-design.md`

**Normative contract:** `docs/superpowers/plans/2026-08-18-calendar-collector-contract.md`

**Scaffolding appendix:** `docs/superpowers/plans/2026-08-18-calendar-collector-scaffolding.md`

## Global Constraints

- Begin only after Contacts Gate B passes and the Contacts work is merged into `main` of `jordanschwartz-js/cold-start-apple-collectors`.
- Preserve the exact qualified Contacts Collector artifact, bundle identifier, entitlements, Keychain service, signing key, schemas, and Gate B report. Do not modify or replace that installed app.
- Calendar Collector bundle identifier is exactly `com.jordanschwartz.gbrain.coldstart.calendar`.
- Calendar Collector test-host bundle identifier is exactly `com.jordanschwartz.gbrain.coldstart.calendar.testhost` and is a separate ad-hoc-signed app with no Calendar entitlement or production key.
- Use macOS 15.0 deployment floor, Swift language mode 6, complete concurrency checking, Automatic Signing, Apple Development signing for owner qualification, Hardened Runtime, and Apple Silicon for Gate C.
- Production Calendar entitlements are exactly App Sandbox, Calendar personal-information access, and user-selected read-write files.
- The UI and usage description must state that macOS grants full read/write Calendar access because EventKit has no read-only grant, while this collector is implemented and qualified to read only.
- No EventKit save/remove/commit/reset/rollback path, EventKitUI, Calendar Apple Event, private attendee setter, mutable Calendar object creation, network feature, subprocess, URL scheme, XPC service, daemon, LaunchAgent, background helper, or CLI export mode.
- Every export requires visible scope review and a fresh `LAPolicy.deviceOwnerAuthentication` evaluation with reuse duration `0`.
- Calendar uses its own Secure Enclave P-256 key and validator trust record. It never reuses the Contacts collector key.
- EventKit objects never leave `CalendarEventStoreActor`; packages and SwiftUI feature code receive immutable Sendable DTOs only.
- The requested window is explicit, offset-bearing RFC 3339, no longer than 90 UTC calendar days, and may be narrowed but never broadened by the user.
- Event collection uses contiguous 31-day UTC segments. Any store-change notification, conflicting duplicate, unresolved approved calendar, record cap, record-size limit, or mapping failure makes the run partial.
- Calendar identifiers are local locators. Cross-run reconciliation is versioned and fail-closed.
- Preserve all-day local date spans, recurrence selectors, occurrence anchors, detached state, attendees/organizer, alarms, structured location, status, and availability without floating-point values in signed records.
- General logs and public receipts contain no source/calendar/event titles, identifiers, attendees, organizer, notes, locations, URLs, birthday contact IDs, request payloads, or authentication details.
- Qualification uses a dedicated macOS test user and fictional Calendar records only. Do not admit real Calendar data before Gate C passes.
- Calendar-to-GBrain normalization, Contacts changes, Mail, Messages, live sync, and real-data admission are outside this plan.

---

## Repository Delta

The Calendar implementation adds these principal units:

```text
Packages/CalendarSnapshotProtocol   Calendar request, coverage, manifest, receipt
Packages/CalendarDomain             pure Calendar records, segmentation, hashing, reconciliation
Packages/CalendarCollectorFeature   visible state machine and SwiftUI views through protocols
Apps/CalendarCollector              EventKit, LocalAuthentication, signing, export
Apps/CalendarCollectorTestHost      fake-only UI host with no Calendar grant
SnapshotValidatorKit                multi-domain trust and Calendar verification
Qualification/Calendar              synthetic fixtures, checklist, report, source comparison
```

The exact paths, package manifests, Xcode targets, schemas, scripts, and documentation are defined in the scaffolding appendix.

## Authoritative Interfaces

The normative contract defines the full wire types. Later tasks use these principal APIs exactly:

```swift
// CalendarSnapshotProtocol
public enum StrictCalendarRequestDecoder {
    public static func decode(from data: Data) throws -> CalendarCollectorRequest
}

public struct FrozenCalendarRequest: Codable, Equatable, Sendable {
    public let request: CalendarCollectorRequest
    public let effectiveScope: EffectiveCalendarScope
}

public struct CalendarSnapshotManifest: Codable, Equatable, Sendable { /* contract §6 */ }
public struct CalendarPublicReceipt: Codable, Equatable, Sendable { /* contract §6 */ }
```

```swift
// CalendarDomain
public enum CalendarWindowSegmenter {
    public static func segments(
        start: Date,
        end: Date,
        maximumDaysPerSegment: Int = 31
    ) throws -> [CalendarWindowSegment]
}

public enum CalendarEventHasher {
    public static func snapshotRecordId(for locator: CalendarObservedLocator) throws -> String
    public static func strongFingerprint(for payload: CalendarStrongFingerprintPayload) throws -> String
    public static func contentHash(for payload: CalendarEventHashPayload) throws -> String
}

public enum CalendarEventReconciler {
    public static func reconcile(
        current: CalendarEventRecord,
        against previous: [CalendarEventRecord]
    ) -> CalendarReconciliationOutcome
}
```

```swift
// Feature/live seams
public protocol CalendarAuthorizing: Sendable {
    func status() async -> CalendarAuthorizationValue
    func requestFullAccess() async throws -> CalendarAuthorizationValue
}

public protocol CalendarCatalogListing: Sendable {
    func listCatalog() async throws -> CalendarCatalogReadResult
}

public protocol CalendarEventReading: Sendable {
    func readEvents(frozenScope: EffectiveCalendarScope) async throws -> RawCalendarReadResult
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
```

---

### Task 1: Establish the Isolated Calendar Branch and Extend the Project Shape

**Files:**
- Create all Calendar package/app/test/fixture/qualification paths in the scaffolding appendix.
- Modify: `project.yml`
- Modify: `script/build_and_run.sh`
- Modify: `script/test_packages.sh`
- Modify: `script/test_apps.sh`
- Modify: `.codex/environments/environment.toml`
- Test: `script/verify_project_shape.sh`

**Interfaces:**
- Consumes the Gate B `main` baseline and retained Contacts artifacts.
- Produces schemes `CalendarCollector`, `CalendarCollectorTestHost`, and Calendar tests without modifying Contacts production sources.

- [ ] **Step 1: Create an isolated worktree from the Gate B main revision**

```bash
git switch main
git pull --ff-only
./script/test_packages.sh
./script/test_apps.sh

git check-ignore -q .worktrees
mkdir -p .worktrees
git worktree add .worktrees/calendar-collector -b feature/calendar-collector
cd .worktrees/calendar-collector
```

Expected: baseline tests exit `0`. If any baseline test fails, stop and investigate before Calendar work.

- [ ] **Step 2: Record and verify the non-regression preconditions**

```bash
: "${GATE_B_SNAPSHOT:?set GATE_B_SNAPSHOT to the retained signed Contacts snapshot}"
: "${GATE_B_COLLECTOR_APP:?set GATE_B_COLLECTOR_APP to the qualified Contacts app}"
: "${GATE_B_REPORT:?set GATE_B_REPORT to the approved report}"

test -d "$GATE_B_SNAPSHOT"
test -d "$GATE_B_COLLECTOR_APP"
test -f "$GATE_B_REPORT"
shasum -a 256 "$GATE_B_COLLECTOR_APP/Contents/MacOS/ContactsCollector"
```

Write the observed digest into an ignored local qualification environment file. Do not copy the real Contacts snapshot into Git.

- [ ] **Step 3: Extend the failing project-shape test first**

Add required paths and scheme checks to `script/verify_project_shape.sh`:

```bash
required+=(
  Packages/CalendarSnapshotProtocol/Package.swift
  Packages/CalendarDomain/Package.swift
  Packages/CalendarCollectorFeature/Package.swift
  Apps/CalendarCollector/Resources/CalendarCollector.entitlements
  Apps/CalendarCollectorTestHost/Resources/Info.plist
)

schemes="$(xcodebuild -project ColdStartAppleCollectors.xcodeproj -list)"
grep -q 'CalendarCollector' <<<"$schemes"
grep -q 'CalendarCollectorTestHost' <<<"$schemes"
```

Run:

```bash
./script/verify_project_shape.sh
```

Expected: FAIL because the Calendar package and target paths do not exist.

- [ ] **Step 4: Create exact package manifests and XcodeGen targets**

Create the three manifests and add the target/scheme YAML exactly as specified in the scaffolding appendix. Create placeholder Swift files containing only valid module declarations so project generation can resolve every package.

Generate and list schemes:

```bash
./script/generate_project.sh generate
xcodebuild -project ColdStartAppleCollectors.xcodeproj -list
```

Expected: Contacts schemes remain present; Calendar and Validator schemes resolve without duplicate target names.

- [ ] **Step 5: Extend the build/run and Codex actions**

Add `CalendarCollector` to `APP_TARGET`, add the Calendar subsystem mapping, and add this action to `.codex/environments/environment.toml`:

```toml
[[actions]]
name = "Run Calendar Collector"
icon = "run"
command = "APP_TARGET=CalendarCollector ./script/build_and_run.sh"
```

Validate shell syntax:

```bash
bash -n script/build_and_run.sh script/test_packages.sh script/test_apps.sh
```

Expected: exit `0`.

- [ ] **Step 6: Run the shape check and baseline regression**

```bash
./script/verify_project_shape.sh
./script/generate_project.sh --check
./script/test_packages.sh
./script/test_apps.sh --only ContactsCollectorTests
./script/test_apps.sh --only SnapshotValidatorTests
```

Expected: all pass; no Contacts source file changed.

- [ ] **Step 7: Commit the isolated Calendar scaffold**

```bash
git status --short
git diff -- Apps/ContactsCollector Apps/ContactsCollectorTestHost
git add project.yml Packages/CalendarSnapshotProtocol Packages/CalendarDomain \
  Packages/CalendarCollectorFeature Apps/CalendarCollector \
  Apps/CalendarCollectorTestHost Tests script .codex ColdStartAppleCollectors.xcodeproj
git commit -m "build: scaffold isolated Calendar collector targets"
```

Expected: the Contacts diff command prints nothing.

---

### Task 2: Implement Strict Calendar Requests and Frozen Scope Binding

**Files:**
- Create: `Packages/CalendarSnapshotProtocol/Sources/CalendarSnapshotProtocol/CalendarCollectorRequest.swift`
- Create: `Packages/CalendarSnapshotProtocol/Sources/CalendarSnapshotProtocol/StrictCalendarRequestDecoder.swift`
- Create: `Packages/CalendarSnapshotProtocol/Tests/CalendarSnapshotProtocolTests/CalendarRequestTests.swift`
- Create: `Schemas/calendar-collector-request-v1.schema.json`
- Create: `Fixtures/Calendar/Requests/valid-calendar-request.json`
- Create: `Fixtures/Calendar/Requests/unknown-field.json`
- Create: `Fixtures/Calendar/Requests/over-90-days.json`

**Interfaces:**
- Produces `CalendarCollectorRequest`, `EffectiveCalendarScope`, `FrozenCalendarRequest`, strict decoder, request digest, and effective-scope digest.

- [ ] **Step 1: Write failing strict-decoding tests**

```swift
import Foundation
import Testing
@testable import CalendarSnapshotProtocol

@Test func rejectsUnknownTopLevelField() throws {
    let data = Data(#"{
      "schemaVersion":1,
      "runId":"11111111-1111-1111-1111-111111111111",
      "domain":"calendar",
      "requestedAt":"2026-08-18T20:00:00.000Z",
      "window":{"start":"2026-05-20T20:00:00.000Z","end":"2026-08-18T20:00:00.000Z"},
      "suggestedScopeIds":[],
      "limits":{"maxRecords":100000},
      "command":"export"
    }"#.utf8)

    #expect(throws: CalendarRequestError.unknownKey("command")) {
        try StrictCalendarRequestDecoder.decode(from: data)
    }
}

@Test func rejectsWindowLongerThanNinetyUTCDays() throws {
    let data = try #require(Bundle.module.url(forResource: "over-90-days", withExtension: "json"))
    #expect(throws: CalendarRequestError.windowTooLarge) {
        try StrictCalendarRequestDecoder.decode(from: Data(contentsOf: data))
    }
}
```

- [ ] **Step 2: Run tests to prove they fail**

```bash
swift test --package-path Packages/CalendarSnapshotProtocol \
  --filter CalendarRequestTests
```

Expected: FAIL because the request models and decoder are absent.

- [ ] **Step 3: Implement exact request models and recursive key validation**

Implement the contract models and errors:

```swift
public enum CalendarRequestError: Error, Equatable {
    case malformedJSON
    case unknownKey(String)
    case wrongSchemaVersion
    case wrongDomain
    case invalidTimestamp(String)
    case invalidWindow
    case windowTooLarge
    case invalidRecordLimit
    case scopeBroadening
}
```

`StrictCalendarRequestDecoder` must inspect exact key sets with `JSONSerialization`, then decode. Parse timestamps with one RFC 3339 formatter that requires an explicit offset. Use Gregorian UTC `dateComponents([.day], from: start, to: end)` plus exact end comparison to enforce at most 90 days.

- [ ] **Step 4: Add scope-narrowing and digest tests**

```swift
@Test func effectiveScopeCannotBroadenWindow() throws {
    let request = TestFixtures.request()
    let broadened = TestFixtures.effectiveScope(
        requested: request.window,
        effectiveStart: "2026-05-19T20:00:00.000Z"
    )
    #expect(throws: CalendarRequestError.scopeBroadening) {
        try FrozenCalendarRequest.validating(request: request, effectiveScope: broadened)
    }
}

@Test func selectedCalendarsAreSortedBeforeDigesting() throws {
    let first = try TestFixtures.frozenScope(calendarIDs: ["b", "a"])
    let second = try TestFixtures.frozenScope(calendarIDs: ["a", "b"])
    #expect(first.requestDigest == second.requestDigest)
    #expect(first.effectiveScopeDigest == second.effectiveScopeDigest)
}
```

- [ ] **Step 5: Run protocol tests and fixture validator**

```bash
swift test --package-path Packages/CalendarSnapshotProtocol
python3 script/validate_fixtures.py Fixtures/Calendar/Requests
```

Expected: pass with no unknown field or canonicalization warning.

- [ ] **Step 6: Commit**

```bash
git add Packages/CalendarSnapshotProtocol Schemas/calendar-collector-request-v1.schema.json \
  Fixtures/Calendar/Requests script/validate_fixtures.py
git commit -m "feat(calendar): add strict bounded request contract"
```

---

### Task 3: Add Calendar Manifest, Coverage, Receipt, and Fixed File Set

**Files:**
- Create: `Packages/CalendarSnapshotProtocol/Sources/CalendarSnapshotProtocol/CalendarSnapshotModels.swift`
- Create: `Packages/CalendarSnapshotProtocol/Sources/CalendarSnapshotProtocol/CalendarSnapshotPaths.swift`
- Create: `Packages/CalendarSnapshotProtocol/Sources/CalendarSnapshotProtocol/CalendarSnapshotFileSet.swift`
- Create: `Packages/CalendarSnapshotProtocol/Tests/CalendarSnapshotProtocolTests/CalendarSnapshotModelTests.swift`
- Create schemas: `Schemas/calendar-snapshot-manifest-v2.schema.json`, `Schemas/calendar-public-receipt-v1.schema.json`
- Create golden fixtures under `Fixtures/Calendar/Crypto/`

**Interfaces:**
- Produces exact domain-specific manifest, receipt, warnings/errors, content-file table, and file allowlist.

- [ ] **Step 1: Write failing canonical manifest tests**

```swift
@Test func calendarManifestCanonicalBytesMatchGoldenFixture() throws {
    let manifest = CalendarProtocolFixtures.completeManifest()
    let bytes = try CanonicalJSON.encode(manifest)
    let golden = try Data(contentsOf: CalendarProtocolFixtures.goldenManifestURL)
    #expect(bytes == golden)
    #expect(CanonicalJSON.sha256Hex(bytes) == CalendarProtocolFixtures.goldenManifestSHA256)
}

@Test func publicReceiptContainsNoSourceDerivedFields() throws {
    let bytes = try CanonicalJSON.encode(CalendarProtocolFixtures.publicReceipt())
    let text = String(decoding: bytes, as: UTF8.self)
    for forbidden in ["calendarTitle", "sourceTitle", "eventTitle", "attendee", "notes", "location", "url"] {
        #expect(!text.contains(forbidden))
    }
}
```

- [ ] **Step 2: Run tests to verify failure**

```bash
swift test --package-path Packages/CalendarSnapshotProtocol \
  --filter CalendarSnapshotModelTests
```

Expected: FAIL because the manifest and file-set types do not exist.

- [ ] **Step 3: Implement exact contract types and fixed paths**

Use the normative contract without substituting a generic `Any` coverage field. Define:

```swift
public enum CalendarSnapshotPaths {
    public static let privateManifest = "private-manifest.json"
    public static let publicReceipt = "public-receipt.json"
    public static let catalog = "calendar-catalog.ndjson"
    public static let events = "calendar-events.ndjson"
    public static let errors = "errors.ndjson"
    public static let hashes = "hashes.sha256"
    public static let signature = "snapshot.sig"
    public static let complete = "COMPLETE"
}
```

`CalendarSnapshotFileSet.allowedNames` is the exact eight-name set. Content files are the public receipt, catalog, events, and errors only.

- [ ] **Step 4: Test status and ordering invariants**

```swift
@Test func contentFilesSortByFilename() throws {
    let manifest = CalendarProtocolFixtures.unsortedManifest()
    let normalized = try CalendarSnapshotManifest.validating(manifest)
    #expect(normalized.contentFiles.map(\.name) == normalized.contentFiles.map(\.name).sorted())
}

@Test func completeMarkerIsManifestDigestPlusNewline() throws {
    let bytes = Data("abc".utf8)
    let marker = CalendarSnapshotFileSet.completeMarker(forManifestBytes: bytes)
    #expect(marker.count == 65)
    #expect(marker.last == 0x0A)
}
```

- [ ] **Step 5: Run all protocol tests and schema checks**

```bash
swift test --package-path Packages/CalendarSnapshotProtocol
python3 script/validate_fixtures.py Fixtures/Calendar/Crypto
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add Packages/CalendarSnapshotProtocol Schemas/calendar-*manifest* \
  Schemas/calendar-public-receipt-v1.schema.json Fixtures/Calendar/Crypto
git commit -m "feat(calendar): define signed snapshot protocol"
```

---

### Task 4: Implement UTC Window Segmentation, Inclusion, and Segment Deduplication

**Files:**
- Create: `Packages/CalendarDomain/Sources/CalendarDomain/CalendarWindowSegmenter.swift`
- Create: `Packages/CalendarDomain/Sources/CalendarDomain/CalendarEventDeduplicator.swift`
- Create: `Packages/CalendarDomain/Tests/CalendarDomainTests/CalendarWindowSegmenterTests.swift`
- Create: `Packages/CalendarDomain/Tests/CalendarDomainTests/CalendarEventDeduplicatorTests.swift`

**Interfaces:**
- Produces contiguous half-open segments, explicit overlap filtering, and conflict-aware boundary deduplication.

- [ ] **Step 1: Write failing 90-day segmentation tests**

```swift
@Test func ninetyDaysProduceThirtyOneThirtyOneTwentyEight() throws {
    let start = try UTCDate("2026-05-20T00:00:00.000Z")
    let end = try UTCDate("2026-08-18T00:00:00.000Z")
    let segments = try CalendarWindowSegmenter.segments(start: start, end: end)

    #expect(segments.count == 3)
    #expect(segments[0].start == start)
    #expect(segments[0].end == segments[1].start)
    #expect(segments[1].end == segments[2].start)
    #expect(segments[2].end == end)
}

@Test func rejectsNinetyOneDayWindow() throws {
    #expect(throws: CalendarWindowError.tooLarge) {
        try CalendarWindowSegmenter.segments(
            start: try UTCDate("2026-01-01T00:00:00.000Z"),
            end: try UTCDate("2026-04-02T00:00:00.000Z")
        )
    }
}
```

- [ ] **Step 2: Run tests to verify failure**

```bash
swift test --package-path Packages/CalendarDomain \
  --filter CalendarWindowSegmenterTests
```

Expected: FAIL because the segmenter is absent.

- [ ] **Step 3: Implement Gregorian UTC segmentation**

```swift
public enum CalendarWindowSegmenter {
    public static func segments(
        start: Date,
        end: Date,
        maximumDaysPerSegment: Int = 31
    ) throws -> [CalendarWindowSegment] {
        guard start < end else { throw CalendarWindowError.invalidRange }
        guard maximumDaysPerSegment == 31 else { throw CalendarWindowError.invalidSegmentSize }

        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!

        guard let ninetyDayEnd = calendar.date(byAdding: .day, value: 90, to: start), end <= ninetyDayEnd else {
            throw CalendarWindowError.tooLarge
        }

        var result: [CalendarWindowSegment] = []
        var cursor = start
        while cursor < end {
            let candidate = calendar.date(byAdding: .day, value: 31, to: cursor)!
            let segmentEnd = min(candidate, end)
            result.append(.init(index: result.count, start: cursor, end: segmentEnd))
            cursor = segmentEnd
        }
        guard result.count <= 4 else { throw CalendarWindowError.tooManySegments }
        return result
    }
}
```

- [ ] **Step 4: Write overlap and duplicate-conflict tests**

```swift
@Test func spanningEventIsIncluded() {
    let event = TestRawEvent(start: .day(30), end: .day(32))
    #expect(CalendarEventInclusion.overlaps(event, windowStart: .day(31), windowEnd: .day(62)))
}

@Test func identicalBoundaryRowsCollapse() throws {
    let record = CalendarFixtures.eventRecord(id: "a", content: "same")
    let result = CalendarEventDeduplicator.deduplicate([record, record])
    #expect(result.records.count == 1)
    #expect(result.duplicateRowsSuppressed == 1)
    #expect(result.conflicts.isEmpty)
}

@Test func sameLocatorDifferentContentIsConflict() throws {
    let first = CalendarFixtures.eventRecord(id: "a", content: "one")
    let second = CalendarFixtures.eventRecord(id: "a", content: "two")
    let result = CalendarEventDeduplicator.deduplicate([first, second])
    #expect(result.records.isEmpty)
    #expect(result.conflicts.count == 1)
}
```

- [ ] **Step 5: Implement explicit inclusion and fail-closed deduplication**

Implement zero-duration and ordinary overlap predicates exactly from the contract. Deduplicate only identical key/content pairs; never choose a winner for conflicting versions.

- [ ] **Step 6: Run tests and commit**

```bash
swift test --package-path Packages/CalendarDomain \
  --filter CalendarWindowSegmenterTests
swift test --package-path Packages/CalendarDomain \
  --filter CalendarEventDeduplicatorTests

git add Packages/CalendarDomain
git commit -m "feat(calendar): add bounded window and conflict-aware deduplication"
```

---

### Task 5: Implement Calendar Event Identity, Hashing, and Reconciliation

**Files:**
- Create: `Packages/CalendarDomain/Sources/CalendarDomain/CalendarEventModels.swift`
- Create: `Packages/CalendarDomain/Sources/CalendarDomain/CalendarEventHasher.swift`
- Create: `Packages/CalendarDomain/Sources/CalendarDomain/CalendarEventReconciler.swift`
- Test: `Packages/CalendarDomain/Tests/CalendarDomainTests/CalendarIdentityTests.swift`
- Test: `Packages/CalendarDomain/Tests/CalendarDomainTests/CalendarReconciliationTests.swift`
- Fixtures: `Fixtures/Calendar/Reconciliation/*.json`

**Interfaces:**
- Produces occurrence-aware local locators, strong fingerprints, content hashes, and explicit alias/new/ambiguous outcomes.

- [ ] **Step 1: Write failing recurring-occurrence identity tests**

```swift
@Test func recurringOccurrencesHaveDistinctSnapshotIDs() throws {
    let first = CalendarFixtures.locator(occurrence: "2026-08-04T14:00:00.000Z")
    let second = CalendarFixtures.locator(occurrence: "2026-08-11T14:00:00.000Z")
    #expect(try CalendarEventHasher.snapshotRecordId(for: first) !=
            CalendarEventHasher.snapshotRecordId(for: second))
}

@Test func detachedOccurrenceUsesOriginalOccurrenceAnchor() throws {
    let record = CalendarFixtures.detachedOccurrence(
        occurrenceDate: "2026-08-11T14:00:00.000Z",
        movedStart: "2026-08-12T17:00:00.000Z"
    )
    #expect(record.payload.observedLocator.occurrenceAnchor == "2026-08-11T14:00:00.000Z")
    #expect(record.payload.instantSpan.start == "2026-08-12T17:00:00.000Z")
}
```

- [ ] **Step 2: Run tests to verify failure**

```bash
swift test --package-path Packages/CalendarDomain \
  --filter CalendarIdentityTests
```

Expected: FAIL because models and hashers are absent.

- [ ] **Step 3: Implement exact identity and hash payloads**

Use `CanonicalJSON` for all three hashes:

```swift
public enum CalendarEventHasher {
    public static func snapshotRecordId(for locator: CalendarObservedLocator) throws -> String {
        try CanonicalJSON.sha256Hex(locator)
    }

    public static func strongFingerprint(for payload: CalendarStrongFingerprintPayload) throws -> String {
        try CanonicalJSON.sha256Hex(payload)
    }

    public static func contentHash(for payload: CalendarEventHashPayload) throws -> String {
        try CanonicalJSON.sha256Hex(payload)
    }
}
```

Normalize titles only for strong fingerprinting: Unicode compatibility normalization, trim, collapse whitespace, locale-independent lowercase. Preserve original title in the record.

- [ ] **Step 4: Write full-sync, move, and ambiguity tests**

```swift
@Test func fullSyncIDLossAliasesOnUniqueExternalIDAndOccurrence() {
    let prior = CalendarFixtures.record(localIDs: "old", externalID: "server-1", occurrence: "2026-08-11T14:00:00.000Z")
    let current = CalendarFixtures.record(localIDs: "new", externalID: "server-1", occurrence: "2026-08-11T14:00:00.000Z")
    #expect(CalendarEventReconciler.reconcile(current: current, against: [prior]) ==
        .alias(previousSnapshotRecordId: prior.payload.snapshotRecordId,
               newSnapshotRecordId: current.payload.snapshotRecordId,
               reason: .externalIdentifierAndOccurrence))
}

@Test func duplicateTitlesNeverAutoMerge() {
    let current = CalendarFixtures.record(title: "Weekly Review", externalID: nil)
    let a = CalendarFixtures.record(title: "Weekly Review", externalID: nil, startHour: 9)
    let b = CalendarFixtures.record(title: "Weekly Review", externalID: nil, startHour: 10)
    let outcome = CalendarEventReconciler.reconcile(current: current, against: [a, b])
    #expect(outcome.isAmbiguous)
}

@Test func organizerContradictionStopsStrongMatch() {
    let prior = CalendarFixtures.record(organizer: "mailto:one@example.com")
    let current = CalendarFixtures.record(organizer: "mailto:two@example.com")
    #expect(CalendarEventReconciler.reconcile(current: current, against: [prior]).isAmbiguous)
}
```

- [ ] **Step 5: Implement ordered fail-closed reconciliation**

Implement exact locator, external-ID/occurrence/source-type, unique strong fingerprint, new, and ambiguity in that order. Sort ambiguity candidate IDs before returning them.

- [ ] **Step 6: Run tests, validate fixtures, and commit**

```bash
swift test --package-path Packages/CalendarDomain \
  --filter CalendarIdentityTests
swift test --package-path Packages/CalendarDomain \
  --filter CalendarReconciliationTests
python3 script/validate_fixtures.py Fixtures/Calendar/Reconciliation

git add Packages/CalendarDomain Fixtures/Calendar/Reconciliation
git commit -m "feat(calendar): add occurrence-aware identity reconciliation"
```

---

### Task 6: Add Full-Access Authorization, Calendar Catalog, and Event Store Actor

**Files:**
- Create: `Apps/CalendarCollector/Services/CalendarAuthorizationService.swift`
- Create: `Apps/CalendarCollector/Services/CalendarEventStoreActor.swift`
- Create: `Apps/CalendarCollector/Services/CalendarCatalogMapper.swift`
- Create: `Packages/CalendarDomain/Sources/CalendarDomain/CalendarCatalogModels.swift`
- Test: `Tests/CalendarCollectorTests/CalendarAuthorizationServiceTests.swift`
- Test: `Tests/CalendarCollectorTests/CalendarCatalogMapperTests.swift`
- Test: `Tests/CalendarCollectorTests/CalendarEventStoreActorContractTests.swift`

**Interfaces:**
- Produces authorization mapping, deterministic catalog records, fresh post-authorization EventKit stores, and raw event projections contained within an actor.

- [ ] **Step 1: Write failing authorization-state tests**

```swift
@Test func writeOnlyIsNotReadable() async {
    let service = CalendarAuthorizationService(statusProvider: { .writeOnly })
    #expect(await service.status() == .writeOnly)
    await #expect(throws: CalendarLiveError.fullAccessRequired) {
        try await service.requireFullAccess()
    }
}

@Test arguments: CalendarAuthorizationValue.fullAccess,
    .writeOnly, .denied, .restricted, .notDetermined, .unknown
func mapsEveryAuthorizationState(_ expected: CalendarAuthorizationValue) async {
    #expect(await CalendarAuthorizationService.map(rawValue: expected.testRawValue) == expected)
}
```

- [ ] **Step 2: Run app tests to verify failure**

```bash
./script/test_apps.sh --only CalendarCollectorTests
```

Expected: FAIL because Calendar services do not exist.

- [ ] **Step 3: Implement authorization without prefetching**

```swift
@MainActor
final class CalendarAuthorizationService: CalendarAuthorizing {
    func status() async -> CalendarAuthorizationValue {
        Self.map(EKEventStore.authorizationStatus(for: .event))
    }

    func requestFullAccess() async throws -> CalendarAuthorizationValue {
        let store = EKEventStore()
        let granted = try await store.requestFullAccessToEvents()
        guard granted else { return Self.map(EKEventStore.authorizationStatus(for: .event)) }
        return .fullAccess
    }
}
```

Do not list calendars or events on `store` before permission is granted. The catalog/export actor creates a new store after authorization.

- [ ] **Step 4: Write failing catalog-order and delegate-source tests**

```swift
@Test func catalogSortsDeterministically() throws {
    let result = try CalendarCatalogMapper.map(
        eventStoreIdentifier: "store",
        calendars: CalendarLiveFixtures.unsortedCalendars(),
        delegateSourceCount: 2
    )
    #expect(result.calendars.map(\.calendarTitle) == ["Alpha", "Zulu"])
    #expect(result.delegateSourceCountObserved == 2)
    #expect(result.delegatedSourcesIncluded == false)
}
```

Use immutable test projections, not live `EKCalendar` subclasses.

- [ ] **Step 5: Implement the actor and raw projections**

```swift
actor CalendarEventStoreActor: CalendarCatalogListing, CalendarEventReading {
    private let store: EKEventStore
    private var storeChangedCount = 0

    init(store: EKEventStore = EKEventStore()) {
        self.store = store
    }

    func listCatalog() async throws -> CalendarCatalogReadResult {
        let calendars = store.calendars(for: .event)
        let projections = calendars.map(EventKitCalendarProjection.init)
        return try CalendarCatalogMapper.map(
            eventStoreIdentifier: store.eventStoreIdentifier,
            calendars: projections,
            delegateSourceCount: store.delegateSources.count
        )
    }
}
```

Complete `readEvents` in Task 7. Keep every EventKit conversion inside this actor.

- [ ] **Step 6: Add source-change observation contract test**

The actor exposes no notification object. Inject a `CalendarStoreChangeObserving` seam for tests, returning only an integer count. Test that a simulated notification is reflected in `RawCalendarReadResult.eventStoreChangedDuringRead`.

- [ ] **Step 7: Run tests and commit**

```bash
./script/test_apps.sh --only CalendarCollectorTests
swift test --package-path Packages/CalendarDomain

git add Apps/CalendarCollector/Services Packages/CalendarDomain \
  Tests/CalendarCollectorTests
git commit -m "feat(calendar): add full-access catalog and isolated EventKit actor"
```

---

### Task 7: Map Complete EventKit Event Semantics to Immutable Records

**Files:**
- Create: `Packages/CalendarDomain/Sources/CalendarDomain/CalendarRecurrenceModels.swift`
- Create: `Packages/CalendarDomain/Sources/CalendarDomain/CalendarParticipantModels.swift`
- Create: `Apps/CalendarCollector/Services/CalendarEventMapper.swift`
- Modify: `Apps/CalendarCollector/Services/CalendarEventStoreActor.swift`
- Create: `Schemas/calendar-catalog-v1.schema.json`
- Create: `Schemas/calendar-event-v1.schema.json`
- Test: `Tests/CalendarCollectorTests/CalendarEventMapperTests.swift`
- Test: `Packages/CalendarDomain/Tests/CalendarDomainTests/CalendarAllDayTests.swift`
- Test: `Packages/CalendarDomain/Tests/CalendarDomainTests/CalendarRecurrenceTests.swift`

**Interfaces:**
- Produces `CalendarCatalogRecord`, `CalendarEventRecord`, recurrence, participant, alarm, structured-location, all-day, and status/availability DTOs.

- [ ] **Step 1: Write failing all-day and detached-event tests**

```swift
@Test func allDayRecordPreservesLocalDatesAcrossDST() throws {
    let projection = CalendarFixtures.allDayProjection(
        start: "2026-03-07T05:00:00.000Z",
        end: "2026-03-09T04:00:00.000Z",
        timeZone: "America/Montreal"
    )
    let record = try CalendarEventMapper.map(projection)
    #expect(record.payload.allDaySpan?.startDate == .gregorian(2026, 3, 7))
    #expect(record.payload.allDaySpan?.endExclusiveDate == .gregorian(2026, 3, 9))
    #expect(record.payload.allDaySpan?.interpretationTimeZoneIdentifier == "America/Montreal")
}

@Test func detachedEventPreservesOccurrenceAndModifiedStart() throws {
    let projection = CalendarFixtures.detachedProjection()
    let record = try CalendarEventMapper.map(projection)
    #expect(record.payload.isDetached)
    #expect(record.payload.occurrenceDate == "2026-08-11T14:00:00.000Z")
    #expect(record.payload.instantSpan.start == "2026-08-12T17:00:00.000Z")
}
```

- [ ] **Step 2: Run tests to verify failure**

```bash
swift test --package-path Packages/CalendarDomain \
  --filter CalendarAllDayTests
./script/test_apps.sh --only CalendarCollectorTests
```

Expected: FAIL because mapping models are absent.

- [ ] **Step 3: Implement raw EventKit projections inside the actor**

`EventKitEventProjection` is an app-internal immutable struct. The actor copies only V1 properties from `EKEvent`, its calendar/source, recurrence rules, participants, alarms, and structured location. Convert Core Location doubles to scaled integers before returning the projection.

The projection initializer:

```swift
init(event: EKEvent, eventStoreIdentifier: String) throws {
    guard let calendar = event.calendar,
          let source = calendar.source,
          !event.calendarItemIdentifier.isEmpty else {
        throw CalendarLiveError.unsupportedEvent
    }
    // Copy values only; retain no EventKit object.
}
```

Do not call `event(withIdentifier:)`, `calendarItem(withIdentifier:)`, `contactPredicate`, or any mutation API.

- [ ] **Step 4: Write recurrence-completeness tests**

```swift
@Test func preservesEveryRecurrenceSelector() throws {
    let projection = CalendarFixtures.fullRecurrenceProjection()
    let record = try CalendarEventMapper.map(projection)
    let rule = try #require(record.payload.recurrenceRules.first)
    #expect(rule.daysOfTheMonth == [-1, 15])
    #expect(rule.monthsOfTheYear == [1, 6, 12])
    #expect(rule.weeksOfTheYear == [-1, 1, 20])
    #expect(rule.daysOfTheYear == [-1, 1, 100])
    #expect(rule.setPositions == [-1, 2])
    #expect(rule.end.kind == .count)
    #expect(rule.end.occurrenceCount == 12)
}
```

- [ ] **Step 5: Write participant, alarm, and enum tests**

```swift
@Test func participantsAreSortedAndRawEnumsPreserved() throws {
    let record = try CalendarEventMapper.map(CalendarFixtures.participantProjection())
    #expect(record.payload.attendees.map(\.url) == record.payload.attendees.map(\.url).sorted())
    #expect(record.payload.attendees.first?.role.rawValue == 2)
}

@Test func locationUsesScaledIntegers() throws {
    let record = try CalendarEventMapper.map(CalendarFixtures.locationProjection())
    #expect(record.payload.structuredLocation?.latitudeE7 == 455015000)
    #expect(record.payload.structuredLocation?.longitudeE7 == -735676000)
}
```

- [ ] **Step 6: Implement pure mapping and deterministic sorting**

Map all fields in contract §11. Preserve unknown enum raw values with name `unknown`. Never silently truncate source values. Reject an event whose encoded record will exceed limits in Task 8.

- [ ] **Step 7: Complete segmented EventKit reading**

Inside `CalendarEventStoreActor.readEvents`:

1. resolve exact frozen calendars;
2. verify frozen metadata;
3. start store-change observation;
4. build 31-day segments;
5. query each segment;
6. map every returned event immediately to projection;
7. apply explicit overlap predicate;
8. stop at `maxRecords + 1` unique candidates;
9. stop observation and return raw projections plus counts/change state.

- [ ] **Step 8: Run all Calendar mapping tests and schemas**

```bash
swift test --package-path Packages/CalendarDomain
./script/test_apps.sh --only CalendarCollectorTests
python3 script/validate_fixtures.py Fixtures/Calendar
```

Expected: pass.

- [ ] **Step 9: Commit**

```bash
git add Packages/CalendarDomain Apps/CalendarCollector/Services \
  Tests/CalendarCollectorTests Schemas/calendar-catalog-v1.schema.json \
  Schemas/calendar-event-v1.schema.json Fixtures/Calendar
git commit -m "feat(calendar): preserve complete EventKit event semantics"
```

---

### Task 8: Enforce Record Limits, Ordering, and Partial Outcome Semantics

**Files:**
- Create: `Packages/CalendarDomain/Sources/CalendarDomain/CalendarEventOrdering.swift`
- Modify: `Apps/CalendarCollector/Services/CalendarEventMapper.swift`
- Create: `Tests/CalendarCollectorTests/CalendarRecordLimitTests.swift`
- Create: `Packages/CalendarDomain/Tests/CalendarDomainTests/CalendarOrderingTests.swift`

**Interfaces:**
- Produces stable catalog/event ordering and no-silent-truncation behavior.

- [ ] **Step 1: Write failing over-limit tests**

```swift
@Test func tooManyParticipantsRejectsWholeEvent() throws {
    let projection = CalendarFixtures.projection(participantCount: 5_001)
    #expect(throws: CalendarMappingError.tooManyParticipants) {
        try CalendarEventMapper.map(projection)
    }
}

@Test func oversizedCanonicalRecordIsNotTruncated() throws {
    let projection = CalendarFixtures.projection(notesByteCount: 4 * 1024 * 1024)
    #expect(throws: CalendarMappingError.recordTooLarge) {
        try CalendarEventMapper.map(projection)
    }
}
```

- [ ] **Step 2: Run tests to verify failure**

```bash
./script/test_apps.sh --only CalendarCollectorTests
```

Expected: FAIL because limits are not enforced.

- [ ] **Step 3: Implement exact limits and private errors**

After constructing the hash payload, canonical-encode it, enforce `4 MiB`, then produce `contentHash`. Do not prefix-truncate strings or arrays. Convert each mapping failure into `PrivateCalendarError` and increment coverage.

- [ ] **Step 4: Write byte-stable ordering test**

```swift
@Test func shuffledInputsProduceIdenticalNDJSON() throws {
    let events = CalendarFixtures.eventRecords(count: 20)
    let first = try CalendarEventOrdering.ndjson(events.shuffled(using: .seed(1)))
    let second = try CalendarEventOrdering.ndjson(events.shuffled(using: .seed(2)))
    #expect(first == second)
}
```

- [ ] **Step 5: Implement exact sort keys and run tests**

```bash
swift test --package-path Packages/CalendarDomain \
  --filter CalendarOrderingTests
./script/test_apps.sh --only CalendarCollectorTests
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add Packages/CalendarDomain Apps/CalendarCollector/Services \
  Tests/CalendarCollectorTests
git commit -m "feat(calendar): enforce deterministic record limits"
```

---

### Task 9: Add a Calendar-Specific Security-Scoped Snapshot Root

**Files:**
- Create: `Apps/CalendarCollector/Services/CalendarSnapshotRootService.swift`
- Test: `Tests/CalendarCollectorTests/CalendarSnapshotRootServiceTests.swift`

**Interfaces:**
- Produces an app-scoped bookmark and `AuthorizedSnapshotRoot` for the Calendar app only.

- [ ] **Step 1: Write failing root-policy tests**

```swift
@Test func rejectsCloudSyncedRoot() async throws {
    let policy = CalendarSnapshotRootPolicy(
        home: URL(fileURLWithPath: "/Users/test"),
        cloudRoots: [URL(fileURLWithPath: "/Users/test/Library/Mobile Documents")]
    )
    await #expect(throws: SnapshotRootError.synchronizedLocation) {
        try await policy.validate(URL(fileURLWithPath: "/Users/test/Library/Mobile Documents/run"))
    }
}

@Test func rejectsGitAncestor() async throws {
    let fs = FakeFileSystem(gitDirectories: ["/Users/test/work/.git"])
    await #expect(throws: SnapshotRootError.gitControlled) {
        try await CalendarSnapshotRootPolicy(fileSystem: fs)
            .validate(URL(fileURLWithPath: "/Users/test/work/snapshots"))
    }
}
```

- [ ] **Step 2: Run tests to verify failure**

```bash
./script/test_apps.sh --only CalendarCollectorTests
```

Expected: FAIL because the Calendar root service is absent.

- [ ] **Step 3: Implement visible panel and app-scoped bookmark**

Use `NSOpenPanel` configured for one directory, no files, no multiple selection, and no automatic export. Persist bookmark data in the Calendar app container under a Calendar-specific key. Resolve with security scope, require local volume, owner-only root, no stale bookmark, and no detected sync/Git ancestor.

```swift
@MainActor
final class CalendarSnapshotRootService: SnapshotRootSelecting {
    func selectOrResolveRoot() async throws -> AuthorizedSnapshotRoot {
        if let resolved = try resolveStoredBookmark(), !resolved.isStale {
            return try authorize(resolved.url)
        }
        return try await selectWithOpenPanel()
    }
}
```

- [ ] **Step 4: Test Calendar and Contacts bookmarks cannot substitute**

Use separate fake stores and require Calendar service namespace. A Contacts bookmark blob placed under the Contacts key must not be found by Calendar.

- [ ] **Step 5: Run tests and commit**

```bash
./script/test_apps.sh --only CalendarCollectorTests

git add Apps/CalendarCollector/Services/CalendarSnapshotRootService.swift \
  Tests/CalendarCollectorTests/CalendarSnapshotRootServiceTests.swift
git commit -m "feat(calendar): confine Calendar snapshot output root"
```

---

### Task 10: Build the Visible Full-Access and Scope-Review Workflow

**Files:**
- Create feature stage/model/dependency files under `Packages/CalendarCollectorFeature`.
- Create all feature views listed in the scaffolding appendix.
- Create: `Apps/CalendarCollector/App/CalendarCollectorApp.swift`
- Create: `Apps/CalendarCollector/Resources/Info.plist`
- Create: `Apps/CalendarCollector/Resources/CalendarCollector.entitlements`
- Test: `Packages/CalendarCollectorFeature/Tests/CalendarCollectorFeatureTests/CalendarCollectorModelTests.swift`

**Interfaces:**
- Produces visible request review, full-access disclosure, catalog selection, effective-window narrowing, final frozen review, and explicit cancellation.

- [ ] **Step 1: Write failing stage-transition tests**

```swift
@Test func cannotReachExportReviewBeforeFullAccessDisclosureAccepted() async {
    let model = CalendarCollectorModel(dependencies: .fixture())
    await model.loadRequest(CalendarFixtures.request())
    await model.continueFromRequest()
    #expect(model.stage == .permissionDisclosure)
    #expect(model.canExport == false)
}

@Test func scopeCanNarrowButNotBroaden() async {
    let model = CalendarCollectorModel(dependencies: .fixture())
    await model.loadRequest(CalendarFixtures.request())
    await model.setEffectiveStart(CalendarFixtures.requestedStart.addingDays(-1))
    #expect(model.validationError == .scopeBroadening)
}
```

- [ ] **Step 2: Run feature tests to verify failure**

```bash
swift test --package-path Packages/CalendarCollectorFeature
```

Expected: FAIL because the model and stages are absent.

- [ ] **Step 3: Implement the explicit state machine**

```swift
public enum CalendarCollectorStage: Equatable, Sendable {
    case idle
    case requestReview
    case permissionDisclosure
    case permissionRequest
    case calendarSelection
    case exportReview
    case authenticating
    case collecting
    case completed
    case partial
    case unavailable
}
```

The model is `@MainActor @Observable`. It owns only DTO state and protocol dependencies. It never imports EventKit.

- [ ] **Step 4: Implement the mandatory disclosure text**

The permission screen must visibly include this statement without collapsing it behind a help link:

```text
macOS does not offer read-only Calendar permission. It will grant this app full Calendar access, which technically includes the ability to create, edit, and delete events. This collector is built and qualified to read only. It contains no Calendar write actions and exports only the calendars and dates you approve below.
```

Require a checked acknowledgement before requesting full access.

- [ ] **Step 5: Implement calendar selection and window narrowing**

Use a normal `WindowGroup` and a native macOS form/list. Group calendars by source title, display type and read-only/modifiable metadata, allow subset selection, and show the exact effective start/end. The user may move start later or end earlier only.

The final review shows:

- selected calendar count;
- exact local and UTC window;
- attendee/organizer, notes, URLs, alarms, and location disclosure;
- local snapshot root;
- record cap;
- the need for Touch ID, Apple Watch, or account-password authentication.

- [ ] **Step 6: Run feature tests and build the test host**

```bash
swift test --package-path Packages/CalendarCollectorFeature
APP_TARGET=CalendarCollectorTestHost ./script/build_and_run.sh --verify
```

Expected: tests pass and test-host process launches without a Calendar TCC prompt.

- [ ] **Step 7: Commit**

```bash
git add Packages/CalendarCollectorFeature Apps/CalendarCollector \
  Apps/CalendarCollectorTestHost
git commit -m "feat(calendar): add visible full-access scope workflow"
```

---

### Task 11: Require Fresh User Presence and Create the Calendar Signing Key

**Files:**
- Create: `Apps/CalendarCollector/Services/CalendarUserPresenceService.swift`
- Create: `Apps/CalendarCollector/Services/CalendarSigningKeyStore.swift`
- Create: `Apps/CalendarCollector/Services/CalendarCodeIdentityService.swift`
- Test: `Tests/CalendarCollectorTests/CalendarUserPresenceServiceTests.swift`
- Test: `Tests/CalendarCollectorTests/CalendarSigningKeyStoreTests.swift`

**Interfaces:**
- Produces single-use `AuthorizedCalendarRun`, Calendar-specific Secure Enclave key identity, DER signatures, and code identity claim.

- [ ] **Step 1: Write failing authorization-consumption tests**

```swift
@Test func grantCanBeConsumedOnlyOnce() async throws {
    let clock = TestClock()
    let service = CalendarUserPresenceService(contextFactory: .alwaysSucceeds, clock: clock)
    let grant = try await service.authorize(
        frozenRequest: CalendarFixtures.frozenRequest(),
        requestDigest: "a",
        effectiveScopeDigest: "b"
    )
    try grant.consume(runId: CalendarFixtures.runID, requestDigest: "a", effectiveScopeDigest: "b")
    #expect(throws: CalendarAuthorizationError.alreadyConsumed) {
        try grant.consume(runId: CalendarFixtures.runID, requestDigest: "a", effectiveScopeDigest: "b")
    }
}

@Test func digestChangeInvalidatesGrant() async throws {
    let grant = try await CalendarFixtures.authorizedGrant()
    #expect(throws: CalendarAuthorizationError.digestMismatch) {
        try grant.consume(runId: CalendarFixtures.runID, requestDigest: "changed", effectiveScopeDigest: "b")
    }
}
```

- [ ] **Step 2: Run tests to verify failure**

```bash
./script/test_apps.sh --only CalendarCollectorTests
```

Expected: FAIL because the Calendar grant service is absent.

- [ ] **Step 3: Implement fresh `LAContext` behavior**

Create a new context per authorization, set `touchIDAuthenticationAllowableReuseDuration = 0`, evaluate `.deviceOwnerAuthentication`, retain the context only inside the main-actor grant, expire after 60 seconds, and invalidate on backgrounding/failure.

The localized reason names the calendar count and date range without listing calendar titles.

- [ ] **Step 4: Write failing Calendar key-isolation tests**

```swift
@Test func calendarAndContactsServicesDiffer() {
    #expect(CalendarSigningKeyStore.serviceName ==
            "com.jordanschwartz.gbrain.coldstart.calendar.snapshot-signing")
    #expect(CalendarSigningKeyStore.serviceName != ContactsQualificationConstants.signingServiceName)
}

@Test func publicKeyUsesX963AndSignatureUsesDER() async throws {
    let store = SoftwareCalendarSigningKeyStore.forTests()
    let identity = try await store.identity()
    #expect(identity.publicKeyX963.count == 65)
    let signature = try await store.sign(Data("manifest".utf8), authorization: CalendarFixtures.grant())
    #expect(P256.Signing.ECDSASignature(derRepresentation: signature) != nil)
}
```

- [ ] **Step 5: Implement Secure Enclave-backed production key**

Use the exact service/account/accessibility/access-control settings from the contract. Expose public key, fingerprint, and sign only. There is no production software-key fallback.

- [ ] **Step 6: Run tests and inspect source boundary**

```bash
./script/test_apps.sh --only CalendarCollectorTests
./script/scan_calendar_forbidden_apis.sh
```

Expected: pass; no Contacts key service or exported private key API appears.

- [ ] **Step 7: Commit**

```bash
git add Apps/CalendarCollector/Services Tests/CalendarCollectorTests
git commit -m "feat(calendar): bind exports to user presence and separate signing key"
```

---

### Task 12: Assemble and Sign Atomic Calendar Snapshots

**Files:**
- Create: `Apps/CalendarCollector/Services/CalendarSnapshotExporter.swift`
- Create: `Tests/CalendarCollectorTests/CalendarSnapshotExporterTests.swift`
- Create: `Tests/CalendarCollectorTests/CalendarSnapshotFailureTests.swift`

**Interfaces:**
- Consumes frozen scope, authorization, catalog/events, signing key, code identity, and authorized root.
- Produces the exact eight-file signed Calendar snapshot with correct complete/partial/unavailable semantics.

- [ ] **Step 1: Write failing complete-snapshot test**

```swift
@Test func writesCompleteLastAndSignsExactManifestBytes() async throws {
    let fs = RecordingFileSystem()
    let exporter = CalendarSnapshotExporter(dependencies: .fixture(fileSystem: fs))
    let result = try await exporter.export(CalendarFixtures.completeExportInput())

    #expect(fs.atomicRenameOrder.last == "COMPLETE")
    #expect(result.status == .complete)
    let manifestBytes = try fs.bytes(named: "private-manifest.json")
    let signature = try fs.bytes(named: "snapshot.sig")
    #expect(CalendarFixtures.publicKey.isValidSignature(signature, for: manifestBytes))
}
```

- [ ] **Step 2: Run tests to verify failure**

```bash
./script/test_apps.sh --only CalendarCollectorTests
```

Expected: FAIL because exporter is absent.

- [ ] **Step 3: Implement orchestration in exact security order**

```swift
@MainActor
func export(_ input: CalendarExportInput) async throws -> CalendarExportResult {
    try input.authorization.consume(
        runId: input.frozenRequest.request.runId,
        requestDigest: input.requestDigest,
        effectiveScopeDigest: input.effectiveScopeDigest
    )
    let root = try await input.root.startAccessing()
    defer { root.stopAccessing() }

    let catalog = try await input.reader.listCatalog()
    let raw = try await input.reader.readEvents(frozenScope: input.frozenRequest.effectiveScope)
    let mapped = CalendarExportMapper.map(raw: raw, catalog: catalog)
    return try await writeAndSign(mapped, input: input)
}
```

The real implementation reuses the atomic file writer and NDJSON writer from `SnapshotProtocol`; it never writes a caller-selected descendant name.

- [ ] **Step 4: Write partial/unavailable/cancellation tests**

```swift
@Test func storeChangeProducesPartialSnapshot() async throws {
    let input = CalendarFixtures.exportInput(storeChangedDuringRead: true)
    let result = try await CalendarSnapshotExporter(dependencies: .fixture()).export(input)
    #expect(result.status == .partial)
    #expect(result.manifest.coverage.eventStoreChangedDuringRead)
}

@Test func cancellationCreatesNoCompletedDirectory() async {
    let fs = RecordingFileSystem()
    await #expect(throws: CancellationError.self) {
        try await CalendarSnapshotExporter(dependencies: .cancelled(fileSystem: fs))
            .export(CalendarFixtures.exportInput())
    }
    #expect(!fs.contains("COMPLETE"))
}
```

- [ ] **Step 5: Test tamper-relevant file set and byte-stable reruns**

Two identical inputs with fixed qualification timestamps/test key produce byte-identical catalog/events and identical content hashes. Signatures may differ under ECDSA randomness; records must not.

- [ ] **Step 6: Run tests and commit**

```bash
./script/test_apps.sh --only CalendarCollectorTests
swift test --package-path Packages/CalendarSnapshotProtocol
swift test --package-path Packages/CalendarDomain

git add Apps/CalendarCollector/Services/CalendarSnapshotExporter.swift \
  Tests/CalendarCollectorTests
git commit -m "feat(calendar): write atomic signed Calendar snapshots"
```

---

### Task 13: Migrate Validator Trust to Multiple Domains and Enroll Calendar

**Files:**
- Modify: `Packages/SnapshotValidatorKit/Sources/SnapshotValidatorKit/CollectorTrustRecord.swift`
- Create: `Packages/SnapshotValidatorKit/Sources/SnapshotValidatorKit/TrustStoreMigration.swift`
- Modify: `Apps/SnapshotValidator/Services/ValidatorTrustStore.swift`
- Modify: `Apps/SnapshotValidator/Models/SnapshotValidatorModel.swift`
- Modify: `Apps/SnapshotValidator/Views/EnrollmentReviewView.swift`
- Create tests under `Packages/SnapshotValidatorKit/Tests` and `Tests/SnapshotValidatorTests/Calendar`.
- Modify schemas: enrollment and validation receipt.

**Interfaces:**
- Produces version-2 multi-domain trust records and visible Calendar enrollment without changing Contacts key/code identity.

- [ ] **Step 1: Write failing Contacts trust-migration test**

```swift
@Test func migratesContactsV1WithoutChangingTrustMaterial() throws {
    let old = ValidatorFixtures.contactsTrustV1()
    let migrated = try TrustStoreMigration.migrate(old)
    #expect(migrated.schemaVersion == 2)
    #expect(migrated.domainIdentifier == "contacts")
    #expect(migrated.publicKeyX963Base64 == old.publicKeyX963Base64)
    #expect(migrated.expectedCodeIdentity == old.expectedCodeIdentity)
}
```

- [ ] **Step 2: Run validator tests to verify failure**

```bash
swift test --package-path Packages/SnapshotValidatorKit \
  --filter TrustStoreMigrationTests
```

Expected: FAIL because multi-domain migration is absent.

- [ ] **Step 3: Implement deterministic backup and migration**

Before replacing the trust store, atomically write a backup inside the validator container. Migration never enrolls a new key or changes code identity. A failed migration leaves the original file intact.

- [ ] **Step 4: Write failing Calendar enrollment-isolation tests**

```swift
@Test func sameFingerprintDifferentDomainDoesNotSelectContactsTrust() throws {
    let contacts = ValidatorFixtures.trust(domain: "contacts", fingerprint: "abc")
    let calendar = ValidatorFixtures.trust(domain: "calendar", fingerprint: "abc")
    let store = MultiDomainTrustStore(records: [contacts, calendar])
    #expect(try store.record(domain: "calendar", fingerprint: "abc") == calendar)
}
```

- [ ] **Step 5: Extend visible enrollment UI**

The validator displays domain `Calendar`, bundle ID, Team ID, designated requirement, CDHash, executable and entitlements hashes, and Calendar key fingerprint. It requires a fresh device-owner authentication before storing the trust record and a security-scoped bookmark to the exact selected Calendar app.

- [ ] **Step 6: Run Contacts and Calendar trust tests**

```bash
swift test --package-path Packages/SnapshotValidatorKit
./script/test_apps.sh --only SnapshotValidatorTests
```

Expected: all Contacts tests still pass and new Calendar tests pass.

- [ ] **Step 7: Commit**

```bash
git add Packages/SnapshotValidatorKit Apps/SnapshotValidator \
  Tests/SnapshotValidatorTests Schemas/collector-enrollment-v1.schema.json \
  Schemas/validation-receipt-v1.schema.json
git commit -m "feat(validator): add isolated Calendar trust enrollment"
```

---

### Task 14: Verify Calendar Snapshots Before Decoding Any Event

**Files:**
- Create: `Packages/SnapshotValidatorKit/Sources/SnapshotValidatorKit/CalendarSnapshotVerifier.swift`
- Create: `Packages/SnapshotValidatorKit/Sources/SnapshotValidatorKit/UntrustedSnapshotRoutingHint.swift`
- Modify: `Apps/SnapshotValidator/Services/SnapshotValidationService.swift`
- Modify: `Apps/SnapshotValidator/Views/ValidationResultView.swift`
- Test: `Packages/SnapshotValidatorKit/Tests/SnapshotValidatorKitTests/CalendarSnapshotVerifierTests.swift`
- Test: `Tests/SnapshotValidatorTests/Calendar/CalendarValidationServiceTests.swift`

**Interfaces:**
- Produces strict Calendar code-identity/signature/path/hash/schema verification, Calendar record decoding after trust, and a signed validator receipt.

- [ ] **Step 1: Write failing security-order test**

```swift
@Test func doesNotDecodeEventsBeforeSignaturePasses() throws {
    let decoder = RecordingCalendarRecordDecoder()
    let verifier = CalendarSnapshotVerifier(
        trust: ValidatorFixtures.calendarTrust(),
        recordDecoder: decoder
    )
    #expect(throws: SnapshotVerificationError.invalidSignature) {
        try verifier.verify(ValidatorFixtures.tamperedCalendarSnapshot())
    }
    #expect(decoder.decodeCallCount == 0)
}
```

- [ ] **Step 2: Run tests to verify failure**

```bash
swift test --package-path Packages/SnapshotValidatorKit \
  --filter CalendarSnapshotVerifierTests
```

Expected: FAIL because Calendar verifier is absent.

- [ ] **Step 3: Implement exact verification order**

Implement contract §17 literally. The routing hint is an untrusted key-selection hint only. Reinspect the enrolled Calendar app on every validation, then verify signature and strict domain-specific models.

- [ ] **Step 4: Add path and file-set attack tests**

Test and reject:

```text
missing COMPLETE
wrong COMPLETE digest
wrong Calendar key
Contacts key used on Calendar manifest
undeclared file
missing declared file
symlink
hard link
subdirectory
wrong owner
wrong mode
oversized event file
float in signed Calendar event
unknown schema field
manifest domain mismatch
stale app bookmark
updated/re-signed Calendar app
```

- [ ] **Step 5: Add Calendar receipt and partial eligibility test**

The signed validator receipt records Calendar domain, manifest digest, status, verification result, collector code identity, and whether the snapshot is eligible for later import. `partial`, `unavailable`, and `error` snapshots validate structurally but are not eligible by default.

- [ ] **Step 6: Run retained Contacts regression**

```bash
./script/test_apps.sh --only SnapshotValidatorTests
./script/verify_calendar_nonregression.sh
```

Expected: retained Gate B snapshot still verifies against the unchanged Contacts app and key.

- [ ] **Step 7: Commit**

```bash
git add Packages/SnapshotValidatorKit Apps/SnapshotValidator \
  Tests/SnapshotValidatorTests script/verify_calendar_nonregression.sh
git commit -m "feat(validator): verify signed Calendar snapshots"
```

---

### Task 15: Test the Complete Visible Calendar Flow Through a Separate Test Host

**Files:**
- Create: `Apps/CalendarCollectorTestHost/App/CalendarCollectorTestHostApp.swift`
- Create: `Tests/CalendarCollectorUITests/CalendarCollectorFlowUITests.swift`
- Create: `Tests/CalendarCollectorUITests/CalendarCollectorAccessibilityTests.swift`
- Create: `Tests/CalendarCollectorTests/CalendarCollectorSeamTests.swift`

**Interfaces:**
- Produces end-to-end request → disclosure → scope → auth → fake read → signed snapshot UI evidence without production bypasses.

- [ ] **Step 1: Write failing UI flow test**

```swift
func testCannotExportBeforeDisclosureScopeAndAuthentication() throws {
    let app = XCUIApplication()
    app.launch()

    app.buttons["Load Fictional Request"].click()
    XCTAssertTrue(app.staticTexts["macOS does not offer read-only Calendar permission."].exists)
    XCTAssertFalse(app.buttons["Export Snapshot"].isEnabled)

    app.checkBoxes["I understand macOS grants full Calendar access"].click()
    app.buttons["Continue"].click()
    app.tables["Calendar Scope"].cells.firstMatch.click()
    app.buttons["Review Export"].click()
    XCTAssertTrue(app.staticTexts["Device-owner authentication is required"].exists)
}
```

- [ ] **Step 2: Run UI test to verify failure**

```bash
./script/test_apps.sh --only CalendarCollectorUITests
```

Expected: FAIL because the test host and accessibility identifiers are incomplete.

- [ ] **Step 3: Implement fake-only compiled dependencies**

The test host initializer supplies:

- fictional request;
- fake `.fullAccess` authorization;
- fictional catalog/events;
- fake single-use user-presence grant;
- software test key under a test-only service;
- temporary authorized root.

No runtime flag or environment variable activates these in CalendarCollector.

- [ ] **Step 4: Add seam tests for every stage**

Test:

```text
unknown request rejected
full-access disclosure required
permission denial unavailable
scope narrowing frozen
scope mutation invalidates authentication
fresh event store resolves exact frozen calendars
three segments queried
store change partial
boundary duplicates collapsed
mapping failure partial
signing failure no COMPLETE
validator success visible
```

- [ ] **Step 5: Run UI and seam tests**

```bash
./script/test_apps.sh --only CalendarCollectorUITests
./script/test_apps.sh --only CalendarCollectorTests
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add Apps/CalendarCollectorTestHost Tests/CalendarCollectorUITests \
  Tests/CalendarCollectorTests
git commit -m "test(calendar): cover the complete visible export seam"
```

---

### Task 16: Enforce Read-Only APIs, Exact Entitlements, and Release-Build Boundaries

**Files:**
- Create: `script/scan_calendar_forbidden_apis.sh`
- Create: `script/verify_calendar_release.sh`
- Modify: `script/inspect_entitlements.sh`
- Test: `Tests/ScriptFixtures/CalendarForbidden/*.swift`
- Test: `Tests/ScriptFixtures/CalendarAllowed/*.swift`

**Interfaces:**
- Produces static source/binary evidence and Calendar-only Release verification without rebuilding Contacts.

- [ ] **Step 1: Write failing scanner fixture tests**

Create forbidden fixtures containing `eventStore.save`, `eventStore.remove`, `EKEvent(eventStore:)`, `setValue`, `NSAppleScript`, and `URLSession`. Create allowed fixtures containing `events(matching:)`, `removeDuplicates`, `CalendarEventStoreActor`, and `EventKit` read projection.

Run:

```bash
./script/scan_calendar_forbidden_apis.sh --self-test
```

Expected: FAIL because scanner is absent.

- [ ] **Step 2: Implement source-aware forbidden checks**

Use exact token/selector patterns from the scaffolding appendix. Do not use a raw `grep remove(` rule that rejects unrelated pure code. Scan only Calendar production roots.

- [ ] **Step 3: Extend exact entitlement assertions**

For Calendar app, decode entitlements and compare exact key/value set. For validator, confirm no Calendar entitlement. Fail on any extra entitlement.

```bash
codesign -dvvv --entitlements :- "$CALENDAR_APP" 2>calendar-entitlements.plist
plutil -convert json -o - calendar-entitlements.plist
```

- [ ] **Step 4: Add binary selector and linkage scan**

Inspect main and nested Mach-O files. Reject EventKit mutation selectors, EventKitUI, Contacts, network frameworks, subprocess symbols, Apple Events, and unexpected executables.

- [ ] **Step 5: Run Calendar Release verification**

```bash
bash -n script/*.sh
shellcheck script/*.sh
./script/verify_calendar_release.sh
```

Expected: Calendar and Validator Release builds pass; Contacts app is not built or replaced.

- [ ] **Step 6: Commit**

```bash
git add script Tests/ScriptFixtures
git commit -m "security(calendar): enforce read-only release boundaries"
```

---

### Task 17: Add Fictional Calendar Fixtures, Source Comparator, CI, Documentation, and Attribution

**Files:**
- Create every `Qualification/Calendar` file in the scaffolding appendix.
- Create: `script/canonicalize_ics.py`
- Create: `script/qualify_calendar.sh`
- Modify: `.github/workflows/ci.yml`
- Modify: `README.md`, `SECURITY.md`, `NOTICE`, `UPSTREAM.md`
- Modify: `script/check_docs_and_attribution.sh`
- Test: `Tests/Python/test_canonicalize_ics.py`

**Interfaces:**
- Produces deterministic fictional Gate C setup, independent semantic source comparison, pinned CI checks, and complete provenance.

- [ ] **Step 1: Write failing ICS canonicalizer tests**

```python
def test_folded_lines_and_property_order_canonicalize_identically(tmp_path):
    first = tmp_path / "first.ics"
    second = tmp_path / "second.ics"
    first.write_text(FOLDED_ICS, encoding="utf-8")
    second.write_text(REORDERED_ICS, encoding="utf-8")
    assert canonicalize(first) == canonicalize(second)


def test_semantic_event_change_is_detected(tmp_path):
    before = tmp_path / "before.ics"
    after = tmp_path / "after.ics"
    before.write_text(EVENT_WITH_ONE_START, encoding="utf-8")
    after.write_text(EVENT_WITH_DIFFERENT_START, encoding="utf-8")
    assert canonicalize(before) != canonicalize(after)
```

- [ ] **Step 2: Run tests to verify failure**

```bash
python3 -m unittest Tests.Python.test_canonicalize_ics -v
```

Expected: FAIL because canonicalizer is absent.

- [ ] **Step 3: Implement bounded nonexecuting ICS canonicalization**

Use only Python standard library. Limit input to 64 MiB, line length to 4 MiB after unfolding, nesting to VCALENDAR/VEVENT/VALARM, and reject malformed nesting. Preserve all VEVENT semantic properties; exclude only the explicit file-envelope allowlist documented in source and tests.

- [ ] **Step 4: Create the fictional ICS and manual fixture register**

Every person, address, location, organization, calendar, URL, and note is fictional. Use `example.com` addresses and clearly fictional titles. Document manual Calendar.app import, detached occurrence edit, and event move steps.

- [ ] **Step 5: Extend CI without claiming Gate C**

Add Calendar fixture validation, package tests, Calendar app/test-host tests, validator tests, forbidden scan, and docs/attribution check using the existing full-SHA-pinned action. CI never requests real Calendar access.

- [ ] **Step 6: Update documentation and upstream evidence**

Document full-access truth, synthetic-only status, separate Calendar identity/key, build commands, no mutation code, EventKit identifier limitations, and Gate C. Record exact upstream revisions and copied/adapted functions.

- [ ] **Step 7: Run all source-level checks**

```bash
python3 -m unittest Tests.Python.test_canonicalize_ics -v
python3 script/validate_fixtures.py Fixtures/Calendar
./script/test_packages.sh
./script/test_apps.sh --only CalendarCollectorTests
./script/test_apps.sh --only CalendarCollectorUITests
./script/test_apps.sh --only SnapshotValidatorTests
./script/scan_calendar_forbidden_apis.sh
./script/check_docs_and_attribution.sh
```

Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add Qualification/Calendar Fixtures/Calendar script/canonicalize_ics.py \
  script/qualify_calendar.sh Tests/Python .github README.md SECURITY.md \
  NOTICE UPSTREAM.md
git commit -m "docs(calendar): add synthetic Gate C qualification workflow"
```

---

### Task 18: Run Final Signed-Build Gate C Qualification

**Files:**
- Create from template: `Qualification/Calendar/gate-c-report-<date>.md`
- Create private local evidence directory outside Git/sync.
- Modify report only after evidence is captured.

**Interfaces:**
- Produces a PASS or FAIL Gate C decision for one exact Calendar Collector, validator, signing lineage, macOS build, and fictional source set.

- [ ] **Step 1: Prepare the dedicated fictional macOS test user**

Confirm:

```text
No personal Apple Account is signed in.
Only the fictional qualification calendars are visible.
FileVault state is recorded.
The snapshot root is local, owner-only, outside Git and sync services.
The qualified Contacts app/artifacts remain retained and unchanged.
```

Import `fictional-gate-c.ics` through Calendar.app, create the second moved-event calendar, detach one recurrence occurrence, and move the specified event exactly as documented.

- [ ] **Step 2: Export independent semantic before-state**

Through Calendar.app, export both fictional calendars into `Qualification/Calendar/source-before/`, then run:

```bash
python3 script/canonicalize_ics.py \
  Qualification/Calendar/source-before \
  > "$PRIVATE_EVIDENCE/calendar-before.canonical.ics"
shasum -a 256 "$PRIVATE_EVIDENCE/calendar-before.canonical.ics"
```

Record digest in the report draft.

- [ ] **Step 3: Build the exact Release apps and inspect them before launch**

```bash
./script/verify_calendar_release.sh

CALENDAR_APP="$PWD/build/CalendarReleaseDerivedData/Build/Products/Release/CalendarCollector.app"
VALIDATOR_APP="$PWD/build/CalendarReleaseDerivedData/Build/Products/Release/SnapshotValidator.app"

codesign -dvvv --entitlements :- "$CALENDAR_APP"
codesign -dvvv --entitlements :- "$VALIDATOR_APP"
shasum -a 256 "$CALENDAR_APP/Contents/MacOS/CalendarCollector"
shasum -a 256 "$VALIDATOR_APP/Contents/MacOS/SnapshotValidator"
```

Stop if any entitlement, identity, scan, build, or test differs from the plan.

- [ ] **Step 4: Enroll Calendar visibly in the validator**

Open `SnapshotValidator.app`, authenticate as device owner, select the exact built Calendar app, review bundle/Team/designated requirement/CDHash/executable/entitlements hashes and Calendar key fingerprint, then enroll.

Do not modify the Contacts trust record. Immediately run the retained Contacts snapshot regression and attach the result.

- [ ] **Step 5: Run the visible Calendar export with tracing**

Open the exact bounded fictional request in Calendar Collector. Verify the full-access disclosure, select the fictional calendars, retain the 90-day window, select the private root, authenticate, and export while `qualify_calendar.sh` captures filesystem/process/network evidence.

Expected snapshot status: `complete`. If partial, unavailable, error, or no snapshot, Gate C fails until the cause is understood and the full qualification restarts with a fresh authentication.

- [ ] **Step 6: Validate the signed snapshot**

Use the visible validator to select and validate the Calendar snapshot. Confirm:

```text
trusted Calendar key
current Calendar app code identity matches enrollment
signature valid
COMPLETE valid
fixed file set
all hashes and sizes valid
schemas valid
status complete
store-change count zero
three segments
no failed records
no truncation
```

Attach the validator receipt digest and signature fingerprint.

- [ ] **Step 7: Export and compare independent semantic after-state**

Export the fictional calendars again through Calendar.app and run:

```bash
python3 script/canonicalize_ics.py \
  Qualification/Calendar/source-after \
  > "$PRIVATE_EVIDENCE/calendar-after.canonical.ics"

cmp "$PRIVATE_EVIDENCE/calendar-before.canonical.ics" \
    "$PRIVATE_EVIDENCE/calendar-after.canonical.ics"
```

Expected: `cmp` exits `0`. Any difference fails the gate pending investigation.

- [ ] **Step 8: Run a second identical export for deterministic records**

Repeat scope review and fresh device-owner authentication. Compare canonical catalog/event NDJSON from the two runs:

```bash
cmp "$RUN_ONE/calendar-catalog.ndjson" "$RUN_TWO/calendar-catalog.ndjson"
cmp "$RUN_ONE/calendar-events.ndjson" "$RUN_TWO/calendar-events.ndjson"
```

Expected: both exit `0`. Run IDs, timestamps, manifests, and ECDSA signatures may differ; normalized record bytes must not.

- [ ] **Step 9: Execute the failure matrix on fictional data**

Verify separately:

```text
permission denied
write-only/full-access mismatch
LocalAuthentication cancel/fail/expiry/reuse
scope change after authentication
missing calendar after freeze
store-change notification
record limit
oversized event
interrupted write
tampered event file
wrong Calendar key
Contacts key presented for Calendar
declared/undeclared file mismatch
symlink/hard-link/subdirectory/wrong-mode path attacks
unknown schema field
Calendar app update/re-sign after enrollment
```

Each case must fail in the expected state without a misleading complete snapshot.

- [ ] **Step 10: Complete the Gate C report and decide**

Fill every report row with evidence. Mark `PASS` only if all acceptance checks succeed on the exact final signed builds. Otherwise mark `FAIL`, identify the first blocker, and keep real Calendar admission closed.

- [ ] **Step 11: Commit only nonpersonal qualification documentation**

```bash
git add Qualification/Calendar/gate-c-report-*.md
git commit -m "test(calendar): record synthetic Gate C qualification"
```

Do not commit raw Calendar snapshots, exported ICS files containing anything beyond the checked-in fictional fixture, trust-store material, private keys, or private local paths.

---

## Final Self-Review Checklist

Before implementation handoff, the executor confirms:

```text
All 18 tasks are present and ordered.
The Calendar plan never modifies Contacts production sources or key material.
Calendar uses its own protocol/domain/feature packages and app identity.
EventKit full access is disclosed honestly.
There is no nonexistent “limited Calendar” state in implementation tests.
The EventKit store is created fresh after authorization and retained inside one actor.
No EventKit object crosses an actor/package boundary.
The 90-day request can narrow but not broaden.
Segments are contiguous, UTC, half-open, and bounded.
Occurrence date, detached state, all-day local dates, recurrence selectors, and participants are represented exactly.
Store changes and conflicting duplicates cannot produce a complete snapshot.
No floating-point values enter signed Calendar structures.
Calendar has a separate Secure Enclave key and trust record.
Validator re-inspects the Calendar app on every validation.
Contacts signed-snapshot regression is required.
CI cannot claim Gate C.
Gate C uses only fictional Calendar data and final signed builds.
No Calendar-to-GBrain import or real-data admission is authorized.
```

## Execution Handoff

Recommended execution is subagent-driven: one fresh implementation worker per task, then a specification-compliance review and code/security-quality review before advancing. The entire plan may also be executed inline with `superpowers:executing-plans`, but task boundaries and Gate C must remain unchanged.