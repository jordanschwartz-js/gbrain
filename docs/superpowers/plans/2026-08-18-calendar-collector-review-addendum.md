# Calendar Collector Self-Review Corrections

**Primary plan:** `docs/superpowers/plans/2026-08-18-calendar-collector.md`  
**Normative contract:** `docs/superpowers/plans/2026-08-18-calendar-collector-contract.md`  
**Scaffolding appendix:** `docs/superpowers/plans/2026-08-18-calendar-collector-scaffolding.md`  
**Status:** Required, highest-precedence implementation addendum

This addendum records corrections found during the final evidence and type-consistency review. It has precedence over the other Calendar plan documents where they differ. The executor must apply every correction below before beginning Task 1.

## 1. Participant schedule status is removed

The public EventKit API exposes the `EKParticipantScheduleStatus` enum, but the current documented `EKParticipant` public properties are:

- `isCurrentUser`;
- `name`;
- `participantRole`;
- `participantStatus`;
- `participantType`;
- `url`;
- `contactPredicate`.

The existence of an enum is not evidence of a public readable property. V1 must not use KVC, private selectors, Objective-C runtime probing, or undocumented properties to recover it.

Replace the contract type with:

```swift
public struct CalendarParticipantRecord: Codable, Equatable, Comparable, Sendable {
    public let name: String?
    public let url: String
    public let isCurrentUser: Bool
    public let role: CalendarEnumValue
    public let status: CalendarEnumValue
    public let type: CalendarEnumValue
}
```

Required changes:

- remove `scheduleStatus` from `CalendarParticipantRecord`;
- remove it from `calendar-event-v1.schema.json`;
- remove it from mapper fixtures, tests, wire examples, and Gate C expected output;
- preserve `EKParticipantScheduleStatus` nowhere in V1;
- keep the forbidden private-runtime rule so it cannot be reintroduced through KVC.

## 2. Structured locations require an explicit CoreLocation build dependency

`EKStructuredLocation.geoLocation` uses Core Location types. Add to the production target:

```yaml
      - sdk: CoreLocation.framework
```

Rules:

- `import CoreLocation` is allowed only in `Apps/CalendarCollector/Services/CalendarEventMapper.swift` or a dedicated `EventKitLocationProjection.swift` beside it;
- no Calendar package imports CoreLocation;
- no Location Services entitlement or usage description is added;
- the collector never requests current location, starts a location manager, geocodes, reverse-geocodes, monitors regions, or reaches the network;
- the source and binary scanners reject `CLLocationManager`, `CLGeocoder`, `MKMapItem`, `MapKit`, and location authorization selectors;
- reading a stored event coordinate is mapped immediately to scaled integers and the `CLLocation` object never leaves the EventKit actor.

Color conversion is also made deterministic and best effort:

1. convert `EKCalendar.cgColor` to sRGB with `CGColorSpace(name: CGColorSpace.sRGB)`;
2. require four RGBA components after conversion;
3. round each component to `0...255`;
4. emit lowercase eight-digit `rrggbbaa`;
5. return `nil` if conversion fails.

Color remains nonidentity metadata.

## 3. Add source-account fencing to event reconciliation

`calendarItemExternalIdentifier + occurrenceAnchor + sourceType` is insufficient because the same invitation or server UID can exist in more than one account.

Add:

```swift
public struct CalendarSourceAccountHintPayload: Codable, Equatable, Sendable {
    public let normalizedSourceTitle: String
    public let sourceTypeRawValue: Int
}
```

Add `sourceAccountHint: String` to both `CalendarSourceContext` and `CalendarStrongFingerprintPayload`.

Compute it as:

```text
SHA256(canonical CalendarSourceAccountHintPayload)
```

Normalization is Unicode compatibility normalization, trim, whitespace collapse, and locale-independent lowercase. Preserve the original source title separately.

Reconciliation order becomes:

1. exact observed locator;
2. unique external identifier + occurrence anchor + exact source identifier;
3. unique external identifier + occurrence anchor + source-account hint;
4. unique strong fingerprint, which now includes source-account hint;
5. no candidate means new;
6. multiple candidates or contradiction means ambiguity.

Rules:

- source title or hint alone never merges events;
- duplicate source-account hints make step 3 ambiguous rather than first-match;
- a moved event inside one source can alias automatically when unique;
- a full-sync source-ID change can alias only when the source-account hint and event evidence are unique;
- events copied into two accounts remain separate;
- update Calendar reconciliation fixtures and schema accordingly.

## 4. Extend the forbidden EventKit read-path checks

The implementation collects series occurrences only through bounded predicates. Add these source-level forbidden calls in production Calendar roots:

```text
event(withIdentifier:
calendarItem(withIdentifier:
calendarItems(withExternalIdentifier:
EKEventStore(sources:
init(sources:
refreshSourcesIfNecessary
.refresh()
```

Purpose:

- identifier lookup returns only the first occurrence for repeating events;
- source-scoped stores would silently change delegate-source coverage;
- refresh/reset-style calls weaken the frozen-read model.

`calendar(withIdentifier:)` remains allowed solely to re-resolve frozen approved calendars immediately after authentication. Tests verify it is not used to broaden scope.

Add binary checks for the corresponding Objective-C selectors where they are distinguishable. Do not use a broad `refresh` string check that rejects unrelated SwiftUI or validator code.

## 5. Gate B preconditions require the validator trust export

Task 1 must require all four private local inputs:

```bash
: "${GATE_B_SNAPSHOT:?set GATE_B_SNAPSHOT}"
: "${GATE_B_COLLECTOR_APP:?set GATE_B_COLLECTOR_APP}"
: "${GATE_B_REPORT:?set GATE_B_REPORT}"
: "${GATE_B_VALIDATOR_TRUST_EXPORT:?set GATE_B_VALIDATOR_TRUST_EXPORT}"
```

Verify the trust export exists and record its digest in ignored local evidence. It contains no private key and is never committed.

`script/verify_calendar_nonregression.sh` consumes the exact same four inputs. A retained Contacts snapshot regression is not valid if the validator silently recreates or replaces Contacts trust.

## 6. Define multi-domain validator receipt version 2

Calendar validation must not rely on the Contacts-only `CollectorDomain` enum.

Add inside `SnapshotValidatorKit`:

```swift
public enum ValidatedCollectorDomain: String, Codable, Sendable {
    case contacts
    case calendar
}

public struct ValidationReceiptV2: Codable, Equatable, Sendable {
    public let schemaVersion: Int
    public let domain: ValidatedCollectorDomain
    public let manifestSha256: String
    public let collectorKeyFingerprint: String
    public let collectorCodeIdentity: CodeIdentityClaim
    public let snapshotStatus: SnapshotStatus
    public let verificationResult: String
    public let importEligible: Bool
    public let validatorVersion: String
    public let validatorCodeIdentity: CodeIdentityClaim
    public let validatedAt: String
}
```

Rules:

- schema version exactly `2`;
- old Contacts validation receipts remain readable for audit;
- new validations, including Contacts regressions run by the updated validator, write V2 receipts;
- migration never rewrites an old signed receipt;
- `partial`, `unavailable`, `error`, and `cancelled` snapshots have `importEligible = false`;
- update `validation-receipt-v1.schema.json` by preserving it and add `validation-receipt-v2.schema.json`; do not mutate the meaning of a version-1 schema in place.

The scaffolding appendix instruction to “extend” the V1 validation-receipt schema is superseded by this versioned addition.

## 7. Ignore generated qualification evidence and source exports

Add these exact patterns before Task 17:

```gitignore
Qualification/Calendar/source-before/*
Qualification/Calendar/source-after/*
Qualification/Calendar/private-evidence/
Qualification/Calendar/*.local.env
Qualification/Calendar/gate-c-report-draft-*.md
```

Retain `.gitkeep` files only where empty directories must exist.

Also ignore the normal private snapshot inbox and Xcode build evidence if they can occur under the worktree:

```gitignore
build/
.private-calendar-snapshots/
```

The checked-in fictional ICS fixture remains tracked. Calendar.app exports, raw snapshots, trust exports, security-scoped bookmarks, and private local paths never enter Git.

## 8. Worktree ignore precondition is explicit

Before `git worktree add`, run:

```bash
if ! git check-ignore -q .worktrees; then
  printf '\n.worktrees/\n' >> .gitignore
  git add .gitignore
  git commit -m "chore: ignore project worktrees"
fi
```

Then create the worktree. Do not continue after a failed ignore check and do not place a worktree inside an unignored path.

## 9. Alarm classification precedence is fixed

Map alarms deterministically:

1. `structuredLocation != nil` → `.location`;
2. else `absoluteDate != nil` → `.absolute`;
3. else → `.relative`.

For a location alarm, preserve structured location, proximity, and the relative offset milliseconds EventKit exposes. For an absolute alarm, preserve absolute date and leave relative offset/location/proximity nil. For a relative alarm, preserve relative offset and leave absolute date/location/proximity nil.

`CalendarAlarmKind.unknown` is removed because these three public shapes exhaust the V1 mapping. A contradictory projection is a mapping error rather than an invented unknown alarm.

Update schema, fixtures, and tests.

## 10. Source-store change observation uses the public notification only

Use the public `EKEventStoreChangedNotification` / Swift notification equivalent. Do not call `refresh()` on retained events after a notification. Once a notification occurs:

- stop accepting further records;
- release all EventKit objects with the actor/run;
- write a partial snapshot only from already mapped immutable DTOs;
- set `eventStoreChangedDuringRead = true`;
- require a completely new scope review and user authentication for a retry.

Gate C requires zero store-change notifications.

## 11. Final self-review additions

Add these checks to the primary plan’s final checklist:

```text
CoreLocation is linked only for stored structured-location projection and no location authority is requested.
CalendarParticipantRecord contains no undocumented schedule-status field.
Source-account hints fence external-ID and strong-fingerprint reconciliation.
Identifier lookup APIs, source-scoped stores, and EventKit refresh calls are forbidden.
Gate B non-regression has the retained validator trust export.
Validator writes version-2 domain-aware receipts without rewriting V1 receipts.
Generated ICS exports, snapshots, trust data, and private evidence are Git-ignored.
Alarm kind and field invariants are deterministic.
```

## 12. Evidence basis

- Apple documents that `EKParticipant` publicly exposes role, attendance status, type, URL, name, current-user state, and contact predicate; it does not document a participant schedule-status getter.
- Apple documents `EKStructuredLocation` as carrying a potential geocoordinate, which uses Core Location value types.
- Apple documents that identifier lookup returns only the first occurrence of a repeating event.
- Apple documents that `EKEventStoreChangedNotification` invalidates previously fetched EventKit objects.

No private API is authorized to fill a public-API gap.