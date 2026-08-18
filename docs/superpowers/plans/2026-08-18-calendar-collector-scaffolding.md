# Calendar Collector Scaffolding and Schema Appendix

**Plan:** `docs/superpowers/plans/2026-08-18-calendar-collector.md`  
**Contract:** `docs/superpowers/plans/2026-08-18-calendar-collector-contract.md`  
**Spec:** `docs/superpowers/specs/2026-08-18-cold-start-apple-reader-design.md`  
**Status:** Required execution appendix

This appendix supplies exact repository additions, package manifests, Xcode targets, schema inventory, script contracts, forbidden-API checks, documentation, and Gate C artifacts. It assumes the Contacts implementation repository already exists and Gate B has passed.

## 1. Required repository additions

Add these paths to `jordanschwartz-js/cold-start-apple-collectors`:

```text
Packages/
├── CalendarSnapshotProtocol/
│   ├── Package.swift
│   ├── Sources/CalendarSnapshotProtocol/
│   │   ├── CalendarCollectorRequest.swift
│   │   ├── StrictCalendarRequestDecoder.swift
│   │   ├── CalendarSnapshotModels.swift
│   │   ├── CalendarSnapshotPaths.swift
│   │   └── CalendarSnapshotFileSet.swift
│   └── Tests/CalendarSnapshotProtocolTests/
│       └── Fixtures/
├── CalendarDomain/
│   ├── Package.swift
│   ├── Sources/CalendarDomain/
│   │   ├── CalendarCatalogModels.swift
│   │   ├── CalendarEventModels.swift
│   │   ├── CalendarRecurrenceModels.swift
│   │   ├── CalendarParticipantModels.swift
│   │   ├── CalendarWindowSegmenter.swift
│   │   ├── CalendarEventOrdering.swift
│   │   ├── CalendarEventHasher.swift
│   │   ├── CalendarEventDeduplicator.swift
│   │   └── CalendarEventReconciler.swift
│   └── Tests/CalendarDomainTests/
└── CalendarCollectorFeature/
    ├── Package.swift
    ├── Sources/CalendarCollectorFeature/
    │   ├── CalendarCollectorStage.swift
    │   ├── CalendarCollectorModel.swift
    │   ├── CalendarCollectorDependencies.swift
    │   └── Views/
    │       ├── CalendarRequestReviewView.swift
    │       ├── CalendarPermissionDisclosureView.swift
    │       ├── CalendarScopeSelectionView.swift
    │       ├── CalendarExportReviewView.swift
    │       ├── CalendarExportProgressView.swift
    │       └── CalendarExportResultView.swift
    └── Tests/CalendarCollectorFeatureTests/

Apps/
├── CalendarCollector/
│   ├── App/CalendarCollectorApp.swift
│   ├── Services/
│   │   ├── CalendarAuthorizationService.swift
│   │   ├── CalendarEventStoreActor.swift
│   │   ├── CalendarCatalogMapper.swift
│   │   ├── CalendarEventMapper.swift
│   │   ├── CalendarSnapshotRootService.swift
│   │   ├── CalendarUserPresenceService.swift
│   │   ├── CalendarSigningKeyStore.swift
│   │   ├── CalendarCodeIdentityService.swift
│   │   └── CalendarSnapshotExporter.swift
│   └── Resources/
│       ├── Info.plist
│       └── CalendarCollector.entitlements
└── CalendarCollectorTestHost/
    ├── App/CalendarCollectorTestHostApp.swift
    └── Resources/Info.plist

Tests/
├── CalendarCollectorTests/
├── CalendarCollectorUITests/
└── SnapshotValidatorTests/Calendar/

Schemas/
├── calendar-collector-request-v1.schema.json
├── calendar-catalog-v1.schema.json
├── calendar-event-v1.schema.json
├── calendar-snapshot-manifest-v2.schema.json
└── calendar-public-receipt-v1.schema.json

Fixtures/
└── Calendar/
    ├── Requests/
    ├── Catalog/
    ├── Events/
    ├── Crypto/
    ├── Validator/
    └── Reconciliation/

Qualification/Calendar/
├── README.md
├── synthetic-fixture-register.md
├── gate-c-checklist.md
├── report-template.md
├── source-before/
├── source-after/
└── Fixtures/
    └── fictional-gate-c.ics

script/
├── verify_calendar_release.sh
├── verify_calendar_nonregression.sh
├── scan_calendar_forbidden_apis.sh
├── canonicalize_ics.py
└── qualify_calendar.sh
```

Modify, but do not delete or weaken:

```text
project.yml
script/build_and_run.sh
script/test_packages.sh
script/test_apps.sh
script/validate_fixtures.py
script/check_docs_and_attribution.sh
.github/workflows/ci.yml
README.md
SECURITY.md
NOTICE
UPSTREAM.md
Apps/SnapshotValidator/**
Packages/SnapshotValidatorKit/**
Schemas/collector-enrollment-v1.schema.json
Schemas/validation-receipt-v1.schema.json
```

Do not modify `Apps/ContactsCollector/**`, `Apps/ContactsCollectorTestHost/**`, Contacts schemas, or the retained Gate B artifact.

## 2. Exact Swift package manifests

### 2.1 CalendarSnapshotProtocol

`Packages/CalendarSnapshotProtocol/Package.swift`:

```swift
// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "CalendarSnapshotProtocol",
    platforms: [.macOS(.v15)],
    products: [
        .library(name: "CalendarSnapshotProtocol", targets: ["CalendarSnapshotProtocol"]),
    ],
    dependencies: [
        .package(path: "../SnapshotProtocol"),
    ],
    targets: [
        .target(
            name: "CalendarSnapshotProtocol",
            dependencies: [
                .product(name: "SnapshotProtocol", package: "SnapshotProtocol"),
            ]
        ),
        .testTarget(
            name: "CalendarSnapshotProtocolTests",
            dependencies: [
                "CalendarSnapshotProtocol",
                .product(name: "SnapshotProtocol", package: "SnapshotProtocol"),
            ],
            resources: [.copy("Fixtures")]
        ),
    ]
)
```

### 2.2 CalendarDomain

`Packages/CalendarDomain/Package.swift`:

```swift
// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "CalendarDomain",
    platforms: [.macOS(.v15)],
    products: [
        .library(name: "CalendarDomain", targets: ["CalendarDomain"]),
    ],
    dependencies: [
        .package(path: "../SnapshotProtocol"),
        .package(path: "../CalendarSnapshotProtocol"),
    ],
    targets: [
        .target(
            name: "CalendarDomain",
            dependencies: [
                .product(name: "SnapshotProtocol", package: "SnapshotProtocol"),
                .product(name: "CalendarSnapshotProtocol", package: "CalendarSnapshotProtocol"),
            ]
        ),
        .testTarget(
            name: "CalendarDomainTests",
            dependencies: ["CalendarDomain"]
        ),
    ]
)
```

### 2.3 CalendarCollectorFeature

`Packages/CalendarCollectorFeature/Package.swift`:

```swift
// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "CalendarCollectorFeature",
    platforms: [.macOS(.v15)],
    products: [
        .library(name: "CalendarCollectorFeature", targets: ["CalendarCollectorFeature"]),
    ],
    dependencies: [
        .package(path: "../SnapshotProtocol"),
        .package(path: "../CalendarSnapshotProtocol"),
        .package(path: "../CalendarDomain"),
    ],
    targets: [
        .target(
            name: "CalendarCollectorFeature",
            dependencies: [
                .product(name: "SnapshotProtocol", package: "SnapshotProtocol"),
                .product(name: "CalendarSnapshotProtocol", package: "CalendarSnapshotProtocol"),
                .product(name: "CalendarDomain", package: "CalendarDomain"),
            ]
        ),
        .testTarget(
            name: "CalendarCollectorFeatureTests",
            dependencies: ["CalendarCollectorFeature"]
        ),
    ]
)
```

### 2.4 SnapshotValidatorKit dependency extension

Add these dependencies and target products to the existing `SnapshotValidatorKit` manifest:

```swift
.package(path: "../CalendarSnapshotProtocol"),
.package(path: "../CalendarDomain"),
```

```swift
.product(name: "CalendarSnapshotProtocol", package: "CalendarSnapshotProtocol"),
.product(name: "CalendarDomain", package: "CalendarDomain"),
```

Do not remove its Contacts dependencies.

## 3. XcodeGen additions

Add packages:

```yaml
  CalendarSnapshotProtocol:
    path: Packages/CalendarSnapshotProtocol
  CalendarDomain:
    path: Packages/CalendarDomain
  CalendarCollectorFeature:
    path: Packages/CalendarCollectorFeature
```

Add production Calendar target:

```yaml
  CalendarCollector:
    type: application
    platform: macOS
    sources: [Apps/CalendarCollector]
    info:
      path: Apps/CalendarCollector/Resources/Info.plist
    entitlements:
      path: Apps/CalendarCollector/Resources/CalendarCollector.entitlements
    settings:
      base:
        PRODUCT_BUNDLE_IDENTIFIER: com.jordanschwartz.gbrain.coldstart.calendar
        PRODUCT_NAME: CalendarCollector
    dependencies:
      - package: SnapshotProtocol
      - package: CalendarSnapshotProtocol
      - package: CalendarDomain
      - package: CalendarCollectorFeature
      - sdk: EventKit.framework
      - sdk: LocalAuthentication.framework
      - sdk: Security.framework
```

Add ad-hoc-signed test host:

```yaml
  CalendarCollectorTestHost:
    type: application
    platform: macOS
    sources: [Apps/CalendarCollectorTestHost]
    info:
      path: Apps/CalendarCollectorTestHost/Resources/Info.plist
    settings:
      base:
        PRODUCT_BUNDLE_IDENTIFIER: com.jordanschwartz.gbrain.coldstart.calendar.testhost
        PRODUCT_NAME: CalendarCollectorTestHost
        CODE_SIGN_STYLE: Manual
        CODE_SIGN_IDENTITY: "-"
        DEVELOPMENT_TEAM: ""
        ENABLE_HARDENED_RUNTIME: NO
    dependencies:
      - package: SnapshotProtocol
      - package: CalendarSnapshotProtocol
      - package: CalendarDomain
      - package: CalendarCollectorFeature
```

Add tests:

```yaml
  CalendarCollectorTests:
    type: bundle.unit-test
    platform: macOS
    sources: [Tests/CalendarCollectorTests]
    settings:
      base:
        PRODUCT_BUNDLE_IDENTIFIER: com.jordanschwartz.gbrain.coldstart.calendar.tests
        TEST_HOST: "$(BUILT_PRODUCTS_DIR)/CalendarCollector.app/Contents/MacOS/CalendarCollector"
        BUNDLE_LOADER: "$(TEST_HOST)"
    dependencies:
      - target: CalendarCollector
      - package: SnapshotProtocol
      - package: CalendarSnapshotProtocol
      - package: CalendarDomain
      - package: CalendarCollectorFeature

  CalendarCollectorUITests:
    type: bundle.ui-testing
    platform: macOS
    sources: [Tests/CalendarCollectorUITests]
    settings:
      base:
        PRODUCT_BUNDLE_IDENTIFIER: com.jordanschwartz.gbrain.coldstart.calendar.uitests
        TEST_TARGET_NAME: CalendarCollectorTestHost
    dependencies:
      - target: CalendarCollectorTestHost
```

Extend `SnapshotValidator` dependencies with Calendar protocol/domain packages. Extend its unit-test target with `Tests/SnapshotValidatorTests/Calendar`.

Add schemes:

```yaml
  CalendarCollector:
    build:
      targets:
        CalendarCollector: all
        CalendarCollectorTests: [test]
    test:
      targets: [CalendarCollectorTests]
  CalendarCollectorTestHost:
    build:
      targets:
        CalendarCollectorTestHost: all
        CalendarCollectorUITests: [test]
    test:
      targets: [CalendarCollectorUITests]
```

The existing Contacts and Validator schemes remain unchanged except for Validator package dependencies.

## 4. Info.plist and entitlements

`Apps/CalendarCollector/Resources/CalendarCollector.entitlements`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.app-sandbox</key>
    <true/>
    <key>com.apple.security.personal-information.calendars</key>
    <true/>
    <key>com.apple.security.files.user-selected.read-write</key>
    <true/>
</dict>
</plist>
```

`Info.plist` requirements:

```xml
<key>CFBundleDisplayName</key>
<string>GBrain Calendar Collector</string>
<key>LSMinimumSystemVersion</key>
<string>15.0</string>
<key>NSCalendarsFullAccessUsageDescription</key>
<string>GBrain Calendar Collector needs full Calendar access because macOS does not offer read-only Calendar permission. It reads only the calendars and date range you approve to create a local snapshot, and it does not create, edit, move, invite, or delete events.</string>
```

Do not include `NSCalendarsWriteOnlyAccessUsageDescription`, EventKitUI document types, URL schemes, background modes, network usage strings, or Contacts usage descriptions.

## 5. Schema files

All Calendar schemas use JSON Schema Draft 2020-12 and `additionalProperties: false` at every object.

### 5.1 Calendar request

`calendar-collector-request-v1.schema.json` requires:

- `schemaVersion` exactly `1`;
- UUID `runId`;
- `domain` exactly `calendar`;
- RFC 3339 `requestedAt`;
- required `window.start` and `window.end` strings;
- string array `suggestedScopeIds`;
- `limits.maxRecords` integer `1...100000`.

Runtime validation additionally enforces offset-bearing timestamps, start before end, and at most 90 UTC calendar days.

### 5.2 Catalog and event records

`calendar-catalog-v1.schema.json` encodes every catalog field in the normative contract and requires lowercase 64-character `contentHash`.

`calendar-event-v1.schema.json`:

- requires every nonoptional field in `CalendarEventRecord`;
- prohibits floating-point numbers;
- represents coordinates and offsets as integers;
- requires lowercase 64-character `snapshotRecordId`, `strongFingerprint`, and `contentHash`;
- caps source strings only through runtime byte-size validation, not schema truncation;
- permits unknown enum names only as string `unknown` paired with preserved integer raw values.

### 5.3 Manifest and receipt

`calendar-snapshot-manifest-v2.schema.json` and `calendar-public-receipt-v1.schema.json` implement the exact models from the contract. The public receipt schema has no source-derived title, identifier, attendee, location, note, or URL field.

### 5.4 Enrollment and validator receipt

Extend the existing enrollment and validation-receipt schemas so domain identifier permits `contacts` and `calendar`. Keep strict decoding and all existing Contacts test vectors.

### 5.5 Fixture validator

Extend `script/validate_fixtures.py` with exact Calendar key/type/enum checks. It must:

- validate all Calendar JSON fixtures;
- validate each NDJSON line;
- reject noncanonical ordering/encoding;
- reject floats in signed Calendar files;
- verify integer coordinate and offset bounds;
- verify recurrence arrays and end-kind invariants;
- verify all-day end date is strictly after start date;
- verify complete manifest content table and fixed filenames;
- preserve all Contacts fixture validations.

## 6. Build and test script changes

### 6.1 `script/build_and_run.sh`

Extend `APP_TARGET` allowlist to:

```bash
case "$TARGET" in
  ContactsCollector|CalendarCollector|SnapshotValidator) ;;
  *) echo "unsupported APP_TARGET: $TARGET" >&2; exit 2 ;;
esac
```

Use explicit subsystem selection:

```bash
case "$TARGET" in
  ContactsCollector) SUBSYSTEM="com.jordanschwartz.gbrain.coldstart.contacts" ;;
  CalendarCollector) SUBSYSTEM="com.jordanschwartz.gbrain.coldstart.calendar" ;;
  SnapshotValidator) SUBSYSTEM="com.jordanschwartz.gbrain.coldstart.validator" ;;
esac
```

Default Run action remains Contacts unless the user sets `APP_TARGET`. Add a second Codex action named `Run Calendar Collector` with command:

```toml
command = "APP_TARGET=CalendarCollector ./script/build_and_run.sh"
```

### 6.2 `script/test_packages.sh`

Append packages in dependency order:

```bash
packages=(
  SnapshotProtocol
  ContactsDomain
  CalendarSnapshotProtocol
  CalendarDomain
  ContactsCollectorFeature
  CalendarCollectorFeature
  SnapshotValidatorKit
)
```

### 6.3 `script/test_apps.sh`

Accept these exact values after `--only`:

```text
ContactsCollectorTests
ContactsCollectorUITests
CalendarCollectorTests
CalendarCollectorUITests
SnapshotValidatorTests
```

Run Calendar app tests through `CalendarCollector` and Calendar UI tests through `CalendarCollectorTestHost`.

### 6.4 Calendar release verification

Create `script/verify_calendar_release.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DERIVED="$ROOT/build/CalendarReleaseDerivedData"

"$ROOT/script/generate_project.sh" --check
"$ROOT/script/test_packages.sh"
"$ROOT/script/test_apps.sh" --only CalendarCollectorTests
"$ROOT/script/test_apps.sh" --only CalendarCollectorUITests
"$ROOT/script/test_apps.sh" --only SnapshotValidatorTests
"$ROOT/script/validate_fixtures.py"
"$ROOT/script/scan_calendar_forbidden_apis.sh"

for scheme in CalendarCollector SnapshotValidator; do
  xcodebuild \
    -project "$ROOT/ColdStartAppleCollectors.xcodeproj" \
    -scheme "$scheme" \
    -configuration Release \
    -derivedDataPath "$DERIVED" \
    -destination 'platform=macOS,arch=arm64' \
    clean build
done

"$ROOT/script/inspect_entitlements.sh" \
  "$DERIVED/Build/Products/Release/CalendarCollector.app" \
  "$DERIVED/Build/Products/Release/SnapshotValidator.app"
"$ROOT/script/scan_calendar_forbidden_apis.sh" --binaries \
  "$DERIVED/Build/Products/Release/CalendarCollector.app" \
  "$DERIVED/Build/Products/Release/SnapshotValidator.app"
"$ROOT/script/verify_calendar_nonregression.sh"
"$ROOT/script/check_docs_and_attribution.sh"
```

The script intentionally does not build or replace the qualified Contacts Collector app.

### 6.5 Contacts non-regression

`script/verify_calendar_nonregression.sh` requires:

```text
GATE_B_SNAPSHOT
GATE_B_COLLECTOR_APP
GATE_B_VALIDATOR_TRUST_EXPORT
```

It runs the updated validator against the retained signed Contacts snapshot and exact enrolled Contacts app identity, then verifies the new validation outcome matches the retained Gate B expected receipt. It never rotates or re-enrolls the Contacts key.

CI uses fictional signed Contacts fixtures; the final Gate C local run uses the retained real Gate B qualification artifacts.

## 7. Forbidden-API checks

`script/scan_calendar_forbidden_apis.sh` scans production Calendar roots only:

```text
Apps/CalendarCollector
Packages/CalendarSnapshotProtocol/Sources
Packages/CalendarDomain/Sources
Packages/CalendarCollectorFeature/Sources
```

Reject exact source tokens or selector patterns:

```text
EKEvent(eventStore:
EKCalendar(for:
EKEventEditViewController
EKCalendarChooser
requestWriteOnlyAccessToEvents
requestAccess(to:
save(
saveCalendar(
remove(
removeCalendar(
commit(
reset(
rollback(
setValue(
mutableCopy
NSAppleScript
NSUserAppleScriptTask
osascript
Process
URLSession
NWConnection
NWListener
NSXPCConnection
```

The scanner must distinguish `removeDuplicates` and unrelated words from forbidden EventKit selectors. Implement token/AST-aware checks where a plain substring would create false positives.

Also reject imports:

```text
EventKitUI
Contacts
ContactsUI
Network
```

`EventKit` is allowed only under `Apps/CalendarCollector/Services` and the app entrypoint; it is forbidden in Calendar packages.

Binary mode inspects every nested Mach-O with `nm -m`, `otool -L`, and `strings`. Reject mutation selectors, EventKitUI linkage, Calendar Apple Events, networking, subprocess APIs, hidden test-host services, or unlisted nested executables.

Forbidden mutation selectors include:

```text
saveEvent:span:
removeEvent:span:
saveCalendar:
removeCalendar:
requestWriteOnlyAccessToEvents
commit:
reset
rollback
setAttendees:
_addNewAttendeesToRecentsIfNeeded
```

## 8. Validator routing and trust migration tests

Add checked-in tests for:

- version-1 Contacts trust record migration to version 2;
- Contacts key and code identity unchanged after migration;
- separate Calendar enrollment under domain `calendar`;
- same fingerprint under a different domain rejected as the wrong trust record;
- untrusted routing hint cannot bypass signature verification;
- manifest domain mismatch rejected;
- Calendar collector app code identity re-inspected on every validation;
- stale Calendar app bookmark rejected;
- Calendar app update/re-sign requires re-enrollment;
- Contacts signed fixtures remain valid;
- Calendar catalog/events are decoded only after cryptographic and file verification.

## 9. Qualification fixtures and semantic source comparison

### 9.1 Fictional ICS seed

`Qualification/Calendar/Fixtures/fictional-gate-c.ics` contains only fictional values under `example.com` and includes:

- a timed event with explicit time zone;
- an all-day event crossing a DST transition;
- a zero-duration event;
- a long event spanning a 31-day segment boundary;
- a weekly recurring series with at least four occurrences;
- recurrence examples using days of week, negative day of month, month, week of year, day of year, set position, date end, and count end;
- notes, URL, location, alarms, and fictional attendee/organizer values.

The fixture does not contain real addresses, coordinates, organizations, calendars, or people.

The qualification operator imports it through Calendar.app into a dedicated local calendar named `GBrain Calendar Qualification`. A second fictional calendar, `GBrain Calendar Qualification Moved`, is created manually. The operator edits one recurrence occurrence and moves one event through Calendar.app to exercise detached and move behavior.

### 9.2 Source before/after exports

Before running the collector, export both qualification calendars through Calendar.app into `Qualification/Calendar/source-before/`. After the run, export them again into `source-after/`.

`script/canonicalize_ics.py`:

- unfolds folded ICS lines;
- normalizes CRLF/LF;
- parses VCALENDAR and VEVENT blocks without executing values;
- sorts VEVENT blocks by UID, RECURRENCE-ID, DTSTART, and full canonical bytes;
- sorts properties while preserving repeated-property values;
- preserves all VEVENT semantic properties including UID, DTSTART, DTEND, RRULE, EXDATE, RECURRENCE-ID, attendees, organizer, alarms, notes, URLs, locations, sequence, status, and last-modified values;
- excludes only file-envelope properties proven by fixture tests to be regenerated by Calendar export, listed explicitly in source;
- writes canonical UTF-8 text;
- fails if an unknown property is encountered in an excluded envelope position.

Gate C compares canonical before and after exports byte-for-byte. Any difference requires investigation and a failed gate unless independently shown to predate the collector run.

### 9.3 Process evidence

`script/qualify_calendar.sh` records:

- final app and validator hashes/signatures/entitlements;
- macOS build, Xcode, Swift, and architecture;
- `fs_usage` filtered to CalendarCollector writes;
- process and dynamic-library inventory;
- network-socket observation during the run;
- TCC permission state before and after;
- LocalAuthentication test outcomes;
- snapshot hashes and validator receipt;
- canonical before/after ICS comparison;
- retained Contacts validation regression;
- byte-stable second Calendar run records.

The script never creates, edits, moves, or deletes Calendar data. Fixture creation and source export remain explicit Calendar.app user actions.

## 10. Gate C report files

`Qualification/Calendar/report-template.md` requires:

```text
Decision: PASS | FAIL
Calendar Collector commit
Calendar Collector executable SHA-256
Calendar Collector CDHash and designated requirement
Calendar collector key fingerprint
Validator commit and executable SHA-256
Validator receipt-key fingerprint
macOS version and build
Xcode and Swift versions
Calendar authorization state
Effective calendar count and 90-day window
Segment count
Raw, deduplicated, failed, and returned event counts
Store-change notification count
Before/after ICS canonical digests
Forbidden-source and binary-scan results
Entitlement comparison
Network observation result
LocalAuthentication matrix
Signature/tamper/path/schema matrix
Contacts non-regression result
Rerun determinism result
Known limitations
Approver and approval timestamp
```

Gate C passes only when every required row has attached evidence and no unresolved exception.

## 11. Documentation and attribution

Update `README.md` with:

- Calendar remains synthetic-only until Gate C passes;
- exact full-access disclosure;
- separate Calendar bundle and key identity;
- no EventKit mutation code;
- build/test commands;
- how to launch Calendar and Validator apps visibly;
- no instructions to use real calendars before Gate C.

Update `SECURITY.md` with:

- full-access capability versus read-only code boundary;
- same-user deputy risk;
- LocalAuthentication and signed-snapshot assumptions;
- event-store changes and identifier drift;
- no confidentiality after export;
- separate domain trust and key rotation;
- private vulnerability-reporting process.

Update `UPSTREAM.md` and `NOTICE` with exact reviewed revisions and every Apple PIM, PyApple, or Orchard Calendar file/function copied or substantially adapted. Preserve MIT notices in file headers.

## 12. CI extension

CI performs only source/package/synthetic validation:

```text
validate_fixtures.py
bootstrap_xcodegen.sh
generate_project.sh --check
test_packages.sh
test_apps.sh --only CalendarCollectorTests
test_apps.sh --only CalendarCollectorUITests
test_apps.sh --only SnapshotValidatorTests
scan_calendar_forbidden_apis.sh
check_docs_and_attribution.sh
```

The workflow uses the existing full-SHA-pinned GitHub action lock. It does not request Calendar permission, run real LocalAuthentication, access Secure Enclave production keys, import ICS into Calendar.app, or claim Gate C.

## 13. Plan coverage matrix

| Approved Calendar requirement | Implementing task/section |
|---|---|
| Separate visible Calendar app | Primary plan Tasks 1 and 10 |
| Fixed Calendar bundle/entitlements | Contract §4; appendix §§3–4 |
| Honest full-access disclosure | Primary plan Tasks 7 and 10 |
| No EventKit mutations | Primary plan Tasks 6, 15, 17; appendix §7 |
| Fresh full-access EventKit store | Contract §8; primary plan Task 6 |
| Strict 90-day request | Contract §7; primary plan Task 2 |
| User may narrow, never broaden | Contract §7; primary plan Tasks 2 and 10 |
| 31-day UTC segmentation | Contract §9; primary plan Task 4 |
| Boundary overlap/deduplication | Contract §§9 and 13; primary plan Task 4 |
| Event-store change fails closed | Contract §§8, 13, 15; primary plan Tasks 6 and 12 |
| All-day local-date semantics | Contract §11.2; primary plan Task 7 |
| Recurrence completeness | Contract §11.3; primary plan Task 7 |
| Detached occurrence identity | Contract §§11 and 14; primary plan Tasks 5 and 7 |
| Full-sync/move reconciliation | Contract §14; primary plan Task 5 |
| Attendees without Contacts access | Contract §11.4; primary plan Task 7 |
| Separate Calendar signing key | Contract §§4–5; primary plan Task 11 |
| Domain-specific snapshot | Contract §16; primary plan Task 12 |
| Multi-domain validator | Contract §17; primary plan Tasks 13–14 |
| Contacts build/key untouched | Contract §1; primary plan global constraints |
| Retained Contacts regression | Appendix §§6.5, 8, 9; primary plan Tasks 14 and 17 |
| Final signed synthetic Gate C | Contract §19; primary plan Task 17 |
| Source before/after proof | Appendix §9; primary plan Task 16–17 |
| No GBrain/other domains | Primary plan global constraints |

No Calendar requirement is deferred beyond Gate C. Calendar-to-GBrain normalization remains a separate Gate D plan by design.