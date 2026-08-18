# Contacts Collector Scaffolding and Schema Appendix

**Plan:** `docs/superpowers/plans/2026-08-18-contacts-collector.md`  
**Contract:** `docs/superpowers/plans/2026-08-18-contacts-collector-contract.md`  
**Status:** Required execution appendix

This appendix supplies exact package manifests, test-target boundaries, helper-script contracts, checked-in wire schemas, and documentation deliverables that the task plan names but does not repeat in full. The three files together are one implementation plan.

## 1. Additional Required Paths

Add these paths to the implementation repository map:

```text
Schemas/
├── collector-request-v1.schema.json
├── collector-enrollment-v1.schema.json
├── contacts-record-v1.schema.json
├── snapshot-manifest-v2.schema.json
├── public-receipt-v1.schema.json
└── validation-receipt-v1.schema.json

script/
├── validate_fixtures.py
├── resolve_github_action_lock.sh
└── check_docs_and_attribution.sh

Tools/
└── GitHubActions.lock.json
```

The repository also contains nonempty `README.md`, `LICENSE`, `NOTICE`, `SECURITY.md`, and `Qualification/Contacts/README.md` before Task 17 is complete.

## 2. Exact Swift Package Manifests

### 2.1 SnapshotProtocol

`Packages/SnapshotProtocol/Package.swift`:

```swift
// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "SnapshotProtocol",
    platforms: [.macOS(.v15)],
    products: [
        .library(name: "SnapshotProtocol", targets: ["SnapshotProtocol"]),
    ],
    targets: [
        .target(name: "SnapshotProtocol"),
        .testTarget(
            name: "SnapshotProtocolTests",
            dependencies: ["SnapshotProtocol"],
            resources: [.copy("Fixtures")]
        ),
    ]
)
```

### 2.2 ContactsDomain

`Packages/ContactsDomain/Package.swift`:

```swift
// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "ContactsDomain",
    platforms: [.macOS(.v15)],
    products: [
        .library(name: "ContactsDomain", targets: ["ContactsDomain"]),
    ],
    dependencies: [
        .package(path: "../SnapshotProtocol"),
    ],
    targets: [
        .target(
            name: "ContactsDomain",
            dependencies: [
                .product(name: "SnapshotProtocol", package: "SnapshotProtocol"),
            ]
        ),
        .testTarget(
            name: "ContactsDomainTests",
            dependencies: [
                "ContactsDomain",
                .product(name: "SnapshotProtocol", package: "SnapshotProtocol"),
            ]
        ),
    ]
)
```

### 2.3 ContactsCollectorFeature

`Packages/ContactsCollectorFeature/Package.swift`:

```swift
// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "ContactsCollectorFeature",
    platforms: [.macOS(.v15)],
    products: [
        .library(name: "ContactsCollectorFeature", targets: ["ContactsCollectorFeature"]),
    ],
    dependencies: [
        .package(path: "../SnapshotProtocol"),
        .package(path: "../ContactsDomain"),
    ],
    targets: [
        .target(
            name: "ContactsCollectorFeature",
            dependencies: [
                .product(name: "SnapshotProtocol", package: "SnapshotProtocol"),
                .product(name: "ContactsDomain", package: "ContactsDomain"),
            ]
        ),
        .testTarget(
            name: "ContactsCollectorFeatureTests",
            dependencies: ["ContactsCollectorFeature"]
        ),
    ]
)
```

The feature target imports SwiftUI and Foundation only. It does not import Contacts, Security, CryptoKit, LocalAuthentication, or AppKit.

### 2.4 SnapshotValidatorKit

`Packages/SnapshotValidatorKit/Package.swift`:

```swift
// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "SnapshotValidatorKit",
    platforms: [.macOS(.v15)],
    products: [
        .library(name: "SnapshotValidatorKit", targets: ["SnapshotValidatorKit"]),
    ],
    dependencies: [
        .package(path: "../SnapshotProtocol"),
        .package(path: "../ContactsDomain"),
    ],
    targets: [
        .target(
            name: "SnapshotValidatorKit",
            dependencies: [
                .product(name: "SnapshotProtocol", package: "SnapshotProtocol"),
                .product(name: "ContactsDomain", package: "ContactsDomain"),
            ]
        ),
        .testTarget(
            name: "SnapshotValidatorKitTests",
            dependencies: ["SnapshotValidatorKit"],
            resources: [.copy("Fixtures")]
        ),
    ]
)
```

`SnapshotValidatorKit` may depend on `ContactsDomain` solely to decode and verify the already authenticated `ContactRecord` schema. It still imports no Contacts.framework.

## 3. Required Xcode Test Targets

Append these targets to `project.yml`:

```yaml
  ContactsCollectorTests:
    type: bundle.unit-test
    platform: macOS
    sources: [Tests/ContactsCollectorTests]
    settings:
      base:
        PRODUCT_BUNDLE_IDENTIFIER: com.jordanschwartz.gbrain.coldstart.contacts.tests
        TEST_HOST: "$(BUILT_PRODUCTS_DIR)/ContactsCollector.app/Contents/MacOS/ContactsCollector"
        BUNDLE_LOADER: "$(TEST_HOST)"
    dependencies:
      - target: ContactsCollector
      - package: SnapshotProtocol
      - package: ContactsDomain
      - package: ContactsCollectorFeature

  SnapshotValidatorTests:
    type: bundle.unit-test
    platform: macOS
    sources: [Tests/SnapshotValidatorTests]
    settings:
      base:
        PRODUCT_BUNDLE_IDENTIFIER: com.jordanschwartz.gbrain.coldstart.validator.tests
        TEST_HOST: "$(BUILT_PRODUCTS_DIR)/SnapshotValidator.app/Contents/MacOS/SnapshotValidator"
        BUNDLE_LOADER: "$(TEST_HOST)"
    dependencies:
      - target: SnapshotValidator
      - package: SnapshotProtocol
      - package: ContactsDomain
      - package: SnapshotValidatorKit

  ContactsCollectorUITests:
    type: bundle.ui-testing
    platform: macOS
    sources: [Tests/ContactsCollectorUITests]
    settings:
      base:
        PRODUCT_BUNDLE_IDENTIFIER: com.jordanschwartz.gbrain.coldstart.contacts.uitests
        TEST_TARGET_NAME: ContactsCollectorTestHost
    dependencies:
      - target: ContactsCollectorTestHost
```

Create explicit schemes:

```yaml
schemes:
  ContactsCollector:
    build:
      targets:
        ContactsCollector: all
        ContactsCollectorTests: [test]
    test:
      targets: [ContactsCollectorTests]
  ContactsCollectorTestHost:
    build:
      targets:
        ContactsCollectorTestHost: all
        ContactsCollectorUITests: [test]
    test:
      targets: [ContactsCollectorUITests]
  SnapshotValidator:
    build:
      targets:
        SnapshotValidator: all
        SnapshotValidatorTests: [test]
    test:
      targets: [SnapshotValidatorTests]
```

After generation, `xcodebuild -list` must show all three schemes. The generated project is committed, and `generate_project.sh --check` regenerates to a temporary directory and compares `project.pbxproj` deterministically.

## 4. Exact Helper-Script Contracts

### 4.1 `script/generate_project.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
XCODEGEN="$($ROOT/script/bootstrap_xcodegen.sh)"

case "${1:-generate}" in
  generate)
    "$XCODEGEN" generate --spec "$ROOT/project.yml" --project "$ROOT"
    ;;
  --check|check)
    TMP="$(mktemp -d)"
    trap 'rm -rf "$TMP"' EXIT
    cp -R "$ROOT/project.yml" "$ROOT/Config" "$ROOT/Apps" "$ROOT/Packages" "$ROOT/Tests" "$TMP/"
    "$XCODEGEN" generate --spec "$TMP/project.yml" --project "$TMP"
    diff -ru "$ROOT/ColdStartAppleCollectors.xcodeproj" "$TMP/ColdStartAppleCollectors.xcodeproj"
    ;;
  *)
    echo "usage: $0 [generate|--check]" >&2
    exit 2
    ;;
esac
```

If XcodeGen emits user-specific project data, exclude that data from the committed project and from the comparison rather than normalizing it after generation.

### 4.2 `script/test_packages.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
packages=(SnapshotProtocol ContactsDomain ContactsCollectorFeature SnapshotValidatorKit)
for package in "${packages[@]}"; do
  echo "==> $package"
  swift test --package-path "$ROOT/Packages/$package" --parallel
 done
```

Remove the leading space before `done` when writing the file; shellcheck must pass.

### 4.3 `script/test_apps.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DERIVED="$ROOT/build/DerivedData"
ONLY=""
if [[ "${1:-}" == "--only" ]]; then
  ONLY="${2:?missing test target after --only}"
fi

run_scheme() {
  local scheme="$1"
  shift
  local args=(
    -project "$ROOT/ColdStartAppleCollectors.xcodeproj"
    -scheme "$scheme"
    -configuration Debug
    -derivedDataPath "$DERIVED"
    -destination 'platform=macOS,arch=arm64'
    test
  )
  if [[ -n "$ONLY" ]]; then
    args+=("-only-testing:$ONLY")
  fi
  xcodebuild "${args[@]}" "$@"
}

if [[ -z "$ONLY" || "$ONLY" == ContactsCollectorTests ]]; then
  run_scheme ContactsCollector
fi
if [[ -z "$ONLY" || "$ONLY" == SnapshotValidatorTests ]]; then
  run_scheme SnapshotValidator
fi
if [[ -z "$ONLY" || "$ONLY" == ContactsCollectorUITests ]]; then
  run_scheme ContactsCollectorTestHost
fi
```

### 4.4 `script/build_and_run.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail
MODE="${1:-run}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${APP_TARGET:-ContactsCollector}"
case "$TARGET" in
  ContactsCollector|SnapshotValidator) ;;
  *) echo "unsupported APP_TARGET: $TARGET" >&2; exit 2 ;;
esac

DERIVED="$ROOT/build/DerivedData"
pkill -x "$TARGET" >/dev/null 2>&1 || true
xcodebuild \
  -project "$ROOT/ColdStartAppleCollectors.xcodeproj" \
  -scheme "$TARGET" \
  -configuration Debug \
  -derivedDataPath "$DERIVED" \
  -destination 'platform=macOS,arch=arm64' \
  build
APP="$DERIVED/Build/Products/Debug/$TARGET.app"
BIN="$APP/Contents/MacOS/$TARGET"

case "$MODE" in
  run) /usr/bin/open -n "$APP" ;;
  --debug|debug) lldb -- "$BIN" ;;
  --logs|logs)
    /usr/bin/open -n "$APP"
    /usr/bin/log stream --info --style compact --predicate "process == \"$TARGET\""
    ;;
  --telemetry|telemetry)
    /usr/bin/open -n "$APP"
    /usr/bin/log stream --info --style compact --predicate "subsystem == \"com.jordanschwartz.gbrain.coldstart.${TARGET == ContactsCollector ? contacts : validator}\""
    ;;
  --verify|verify)
    /usr/bin/open -n "$APP"
    sleep 1
    pgrep -x "$TARGET" >/dev/null
    ;;
  *) echo "usage: $0 [run|--debug|--logs|--telemetry|--verify]" >&2; exit 2 ;;
esac
```

The shell expression inside the telemetry predicate is illustrative and is not valid Bash. Implement it with an explicit `if` before the `case`:

```bash
if [[ "$TARGET" == ContactsCollector ]]; then
  SUBSYSTEM="com.jordanschwartz.gbrain.coldstart.contacts"
else
  SUBSYSTEM="com.jordanschwartz.gbrain.coldstart.validator"
fi
```

Then use `$SUBSYSTEM` in the telemetry case. The committed script must pass `bash -n` and shellcheck.

### 4.5 `script/verify_release.sh`

This script runs exactly:

```bash
#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DERIVED="$ROOT/build/ReleaseDerivedData"

"$ROOT/script/generate_project.sh" --check
"$ROOT/script/test_packages.sh"
"$ROOT/script/test_apps.sh"
"$ROOT/script/scan_forbidden_apis.sh"

for scheme in ContactsCollector SnapshotValidator; do
  xcodebuild \
    -project "$ROOT/ColdStartAppleCollectors.xcodeproj" \
    -scheme "$scheme" \
    -configuration Release \
    -derivedDataPath "$DERIVED" \
    -destination 'platform=macOS,arch=arm64' \
    clean build
 done

"$ROOT/script/inspect_entitlements.sh" \
  "$DERIVED/Build/Products/Release/ContactsCollector.app" \
  "$DERIVED/Build/Products/Release/SnapshotValidator.app"
"$ROOT/script/scan_forbidden_apis.sh" --binaries \
  "$DERIVED/Build/Products/Release/ContactsCollector.app" \
  "$DERIVED/Build/Products/Release/SnapshotValidator.app"
"$ROOT/script/check_docs_and_attribution.sh"
```

Remove leading spaces before `done` in the committed shell file and require `bash -n` plus shellcheck for every script.

## 5. Wire Schemas

The six schema files are human- and machine-reviewable contracts. They use JSON Schema Draft 2020-12 with `additionalProperties: false` at every object. They are not the only runtime validator; strict Swift decoding remains authoritative inside the apps.

### 5.1 Fixture validation without a runtime dependency

`script/validate_fixtures.py` is a narrow standard-library validator, not a generic JSON Schema implementation. It:

- loads every checked-in JSON fixture;
- verifies exact key sets and primitive/container types for the six known schemas;
- verifies integer ranges, lowercase SHA-256 fields, UUIDs, fixed enum values, X9.63 public-key Base64 length, and RFC 3339 millisecond timestamps;
- iterates every NDJSON line and rejects blank or unterminated lines;
- verifies canonical reserialization using sorted keys and compact separators;
- exits nonzero on the first mismatch with file and line number.

The Swift test suites independently decode the same fixtures and compare golden canonical bytes. A schema-file change without matching Swift fixtures/tests fails `check_docs_and_attribution.sh` by hash inventory.

### 5.2 Minimum request schema

`collector-request-v1.schema.json` requires exactly:

```json
{
  "schemaVersion": 1,
  "runId": "UUID string",
  "domain": "contacts",
  "requestedAt": "UTC RFC 3339 with milliseconds",
  "window": {"start": null, "end": null},
  "suggestedScopeIds": ["string"],
  "limits": {"maxRecords": "integer 1 through 100000"}
}
```

The actual schema file expresses these as JSON Schema types, enums, formats/patterns, minimum, maximum, required, and `additionalProperties: false`; the prose values above are not copied literally into fixture JSON.

### 5.3 Contacts record schema

`contacts-record-v1.schema.json` includes every field in the normative contract, requires `notesStatus` to equal `excludedByDesign`, prohibits image/note byte fields by `additionalProperties: false`, and requires lowercase 64-character `contentHash` and `snapshotRecordId`.

## 6. Forbidden-API Scan Contract

`script/scan_forbidden_apis.sh` scans these production roots only:

```text
Apps/ContactsCollector
Packages/ContactsCollectorFeature/Sources
Packages/ContactsDomain/Sources
Packages/SnapshotProtocol/Sources
```

It rejects exact source tokens:

```text
CNMutableContact
CNSaveRequest
CNMutableGroup
CNContactNoteKey
CNContactImageDataKey
CNContactThumbnailImageDataKey
NSAppleScript
NSUserAppleScriptTask
osascript
URLSession
NWConnection
NWListener
NSXPCConnection
Process
```

The script permits `CNContactImageDataAvailableKey` and `imageDataAvailable`. It rejects generic `Process` only in Swift production sources, not shell scripts, tests, docs, or fixtures.

Binary mode runs `nm -m`, `otool -L`, and `strings` on each main executable and every nested Mach-O file. It rejects mutation/script/network/test-host symbols and any nested executable not listed in an exact checked-in binary allowlist.

## 7. GitHub Actions Pinning Procedure

The workflow is not committed with floating action tags.

`script/resolve_github_action_lock.sh`:

1. queries the GitHub API for the commit currently referenced by the reviewed `actions/checkout` release tag selected during Task 16;
2. requires a full 40-character SHA;
3. writes repository, release tag, commit SHA, retrieval time, and API response SHA-256 to `Tools/GitHubActions.lock.json`;
4. requires a human review of the release page and resolved commit before the workflow commit;
5. on later runs, verifies the tag still resolves to the recorded commit and fails if it moved.

`.github/workflows/ci.yml` uses the full recorded commit SHA in `uses:`. CI runs on a macOS runner and performs:

```text
validate_fixtures.py
bootstrap_xcodegen.sh
 generate_project.sh --check
 test_packages.sh
 scan_forbidden_apis.sh
 check_docs_and_attribution.sh
```

It does not request Contacts permission, run LocalAuthentication, use Secure Enclave production keys, build an automatically signed qualification app, or claim Gate B.

## 8. Documentation Deliverables

### 8.1 `LICENSE`

Use MIT License text with:

```text
Copyright (c) 2026 Jordan Schwartz and contributors
```

Preserve all upstream MIT notices in `NOTICE` and file headers for copied or substantially adapted code.

### 8.2 `README.md`

The README states at its beginning:

```text
Status: synthetic qualification only. Do not use with real Contacts data until a Gate B report for the exact collector build, signing identity, and macOS build is approved.
```

It documents build prerequisites, fixed bundle IDs, project generation, local signing config, test commands, read-only code boundary, and explicit non-goals. It does not include instructions for admitting real contacts.

### 8.3 `SECURITY.md`

Document the same-user confused-deputy threat, user-presence gate, signed-snapshot trust assumptions, lack of confidentiality after export, per-validation collector-app reinspection, excluded APIs, synthetic-data rule, and private vulnerability-reporting contact/process.

### 8.4 Qualification README

`Qualification/Contacts/README.md` explains that Gate B is a local owner qualification, not a public security certification, and that passing it authorizes only Contacts on the exact recorded build lineage.

## 9. Plan Coverage Matrix

| Approved-spec requirement | Implementing task/contract section |
|---|---|
| Separate visible Contacts app | Plan Tasks 1 and 8 |
| Separate validator without Contacts | Plan Tasks 1, 13, 14 |
| App Sandbox and exact entitlements | Plan Tasks 1 and 16 |
| No network or Apple Events | Plan Tasks 1, 16, 18 |
| Strict bounded request | Plan Task 2; Contract §5 |
| Visible scope review | Plan Task 8 |
| Fresh device-owner authentication | Plan Task 10; Contract §6 |
| Security-scoped local root | Plan Task 9 |
| Immutable raw source cards | Plan Tasks 5 and 6 |
| Raw/unified identity distinction | Plan Tasks 6 and 7; Contract §§7–8 |
| Notes/images excluded | Plan Tasks 6, 7, 16 |
| Conservative reconciliation | Plan Task 4; Contract §10 |
| Secure Enclave collector key | Plan Task 11; Contract §11 |
| Collector key/code enrollment | Plan Task 13; Contract §12 |
| Reinspect collector every validation | Contract §12 |
| Canonical signed snapshot | Plan Tasks 2, 3, 12; Contract §§3–4 |
| Signature/path/hash verification before parse | Plan Task 14; Contract §15 |
| Validator-signed receipt | Plan Task 14; Contract §13 |
| No production test bypass | Plan Tasks 8, 15, 16; Contract §16 |
| Synthetic-only Gate B | Plan Tasks 17 and 18 |
| Byte-stable rerun | Plan Tasks 7, 12, 18 |
| Semantic source before/after proof | Plan Task 18 |
| Upstream attribution | Plan Task 17; Appendix §8 |
| Checked-in schemas | Appendix §5 |
| No GBrain/other-domain implementation | Global constraints and deferred-work section |

No approved Contacts requirement is intentionally deferred beyond Gate B. GBrain ingestion remains a separate Gate D plan by design.