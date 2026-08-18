# Contacts Collector Scaffolding and Schema Appendix

**Plan:** `docs/superpowers/plans/2026-08-18-contacts-collector.md`  
**Normative contract:** `docs/superpowers/plans/2026-08-18-contacts-collector-contract.md`  
**Status:** Required execution appendix

This appendix supplies exact package manifests, Xcode target boundaries, script contracts, schema inventory, and documentation outputs. It contains no illustrative invalid commands. The task plan, contract, and this appendix together form the Contacts implementation plan.

## 1. Required repository layout

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
│   ├── XcodeGen.lock.json
│   └── GitHubActions.lock.json
├── Schemas/
│   ├── collector-request-v1.schema.json
│   ├── collector-enrollment-v1.schema.json
│   ├── contacts-record-v1.schema.json
│   ├── snapshot-manifest-v2.schema.json
│   ├── public-receipt-v1.schema.json
│   └── validation-receipt-v1.schema.json
├── Packages/
│   ├── SnapshotProtocol/
│   ├── ContactsDomain/
│   ├── ContactsCollectorFeature/
│   └── SnapshotValidatorKit/
├── Apps/
│   ├── ContactsCollector/
│   ├── ContactsCollectorTestHost/
│   └── SnapshotValidator/
├── Tests/
│   ├── ContactsCollectorTests/
│   ├── SnapshotValidatorTests/
│   └── ContactsCollectorUITests/
├── Fixtures/
│   ├── Requests/
│   ├── Contacts/
│   ├── Snapshots/
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
│   ├── validate_fixtures.py
│   ├── verify_project_shape.sh
│   ├── scan_forbidden_apis.sh
│   ├── inspect_entitlements.sh
│   ├── check_docs_and_attribution.sh
│   ├── resolve_github_action_lock.sh
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

## 2. Exact Swift package manifests

### 2.1 `Packages/SnapshotProtocol/Package.swift`

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

### 2.2 `Packages/ContactsDomain/Package.swift`

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

### 2.3 `Packages/ContactsCollectorFeature/Package.swift`

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

### 2.4 `Packages/SnapshotValidatorKit/Package.swift`

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

## 3. Base build configuration

`Config/Base.xcconfig`:

```xcconfig
#include? "Local.xcconfig"

MACOSX_DEPLOYMENT_TARGET = 15.0
SWIFT_VERSION = 6.0
SWIFT_STRICT_CONCURRENCY = complete
CLANG_ENABLE_MODULES = YES
CODE_SIGN_STYLE = Automatic
DEVELOPMENT_TEAM = $(GBRAIN_DEVELOPMENT_TEAM)
ENABLE_HARDENED_RUNTIME = YES
GENERATE_INFOPLIST_FILE = NO
MARKETING_VERSION = 0.1.0
CURRENT_PROJECT_VERSION = 1
```

`Config/Debug.xcconfig`:

```xcconfig
#include "Base.xcconfig"
SWIFT_OPTIMIZATION_LEVEL = -Onone
DEBUG_INFORMATION_FORMAT = dwarf
```

`Config/Release.xcconfig`:

```xcconfig
#include "Base.xcconfig"
SWIFT_OPTIMIZATION_LEVEL = -O
DEBUG_INFORMATION_FORMAT = dwarf-with-dsym
ENABLE_TESTABILITY = NO
CODE_SIGN_INJECT_BASE_ENTITLEMENTS = NO
```

`Config/Local.xcconfig.example`:

```xcconfig
GBRAIN_DEVELOPMENT_TEAM = ABCDE12345
```

## 4. Production property lists and entitlements

### 4.1 Contacts collector entitlements

`Apps/ContactsCollector/Resources/ContactsCollector.entitlements`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.app-sandbox</key>
  <true/>
  <key>com.apple.security.personal-information.addressbook</key>
  <true/>
  <key>com.apple.security.files.user-selected.read-write</key>
  <true/>
</dict>
</plist>
```

`Apps/ContactsCollector/Resources/Info.plist` includes:

```xml
<key>CFBundleDisplayName</key>
<string>GBrain Contacts Collector</string>
<key>NSContactsUsageDescription</key>
<string>GBrain Contacts Collector reads only the contact containers you approve to create a local cold-start snapshot. It does not edit Contacts.</string>
<key>LSMinimumSystemVersion</key>
<string>15.0</string>
<key>NSPrincipalClass</key>
<string>NSApplication</string>
```

### 4.2 Validator entitlements

`Apps/SnapshotValidator/Resources/SnapshotValidator.entitlements`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.app-sandbox</key>
  <true/>
  <key>com.apple.security.files.user-selected.read-only</key>
  <true/>
</dict>
</plist>
```

Validator `Info.plist` includes the display name, `LSMinimumSystemVersion = 15.0`, and `NSPrincipalClass = NSApplication`; it contains no Contacts usage description.

## 5. XcodeGen project contract

`project.yml` declares four local packages and these targets:

```yaml
name: ColdStartAppleCollectors
options:
  bundleIdPrefix: com.jordanschwartz.gbrain.coldstart
  deploymentTarget:
    macOS: "15.0"
  createIntermediateGroups: true
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
    sources:
      - Apps/ContactsCollector
    info:
      path: Apps/ContactsCollector/Resources/Info.plist
    entitlements:
      path: Apps/ContactsCollector/Resources/ContactsCollector.entitlements
    settings:
      base:
        PRODUCT_BUNDLE_IDENTIFIER: com.jordanschwartz.gbrain.coldstart.contacts
        PRODUCT_NAME: ContactsCollector
        CODE_SIGN_ENTITLEMENTS: Apps/ContactsCollector/Resources/ContactsCollector.entitlements
    dependencies:
      - package: SnapshotProtocol
      - package: ContactsDomain
      - package: ContactsCollectorFeature

  ContactsCollectorTestHost:
    type: application
    platform: macOS
    sources:
      - Apps/ContactsCollectorTestHost
    info:
      path: Apps/ContactsCollectorTestHost/Resources/Info.plist
    settings:
      base:
        PRODUCT_BUNDLE_IDENTIFIER: com.jordanschwartz.gbrain.coldstart.contacts.testhost
        PRODUCT_NAME: ContactsCollectorTestHost
        CODE_SIGN_STYLE: Manual
        CODE_SIGN_IDENTITY: "-"
        DEVELOPMENT_TEAM: ""
        ENABLE_HARDENED_RUNTIME: NO
    dependencies:
      - package: SnapshotProtocol
      - package: ContactsDomain
      - package: ContactsCollectorFeature

  SnapshotValidator:
    type: application
    platform: macOS
    sources:
      - Apps/SnapshotValidator
    info:
      path: Apps/SnapshotValidator/Resources/Info.plist
    entitlements:
      path: Apps/SnapshotValidator/Resources/SnapshotValidator.entitlements
    settings:
      base:
        PRODUCT_BUNDLE_IDENTIFIER: com.jordanschwartz.gbrain.coldstart.validator
        PRODUCT_NAME: SnapshotValidator
        CODE_SIGN_ENTITLEMENTS: Apps/SnapshotValidator/Resources/SnapshotValidator.entitlements
    dependencies:
      - package: SnapshotProtocol
      - package: ContactsDomain
      - package: SnapshotValidatorKit

  ContactsCollectorTests:
    type: bundle.unit-test
    platform: macOS
    sources:
      - Tests/ContactsCollectorTests
    dependencies:
      - target: ContactsCollector
      - package: SnapshotProtocol
      - package: ContactsDomain
      - package: ContactsCollectorFeature

  SnapshotValidatorTests:
    type: bundle.unit-test
    platform: macOS
    sources:
      - Tests/SnapshotValidatorTests
    dependencies:
      - target: SnapshotValidator
      - package: SnapshotProtocol
      - package: ContactsDomain
      - package: SnapshotValidatorKit

  ContactsCollectorUITests:
    type: bundle.ui-testing
    platform: macOS
    sources:
      - Tests/ContactsCollectorUITests
    dependencies:
      - target: ContactsCollectorTestHost

schemes:
  ContactsCollector:
    build:
      targets:
        ContactsCollector: all
        ContactsCollectorTests: [test]
    test:
      targets:
        - ContactsCollectorTests

  ContactsCollectorTestHost:
    build:
      targets:
        ContactsCollectorTestHost: all
        ContactsCollectorUITests: [test]
    test:
      targets:
        - ContactsCollectorUITests

  SnapshotValidator:
    build:
      targets:
        SnapshotValidator: all
        SnapshotValidatorTests: [test]
    test:
      targets:
        - SnapshotValidatorTests
```

After generation, `xcodebuild -list` must show all three schemes.

## 6. XcodeGen bootstrap

XcodeGen is development tooling only. Pin tag `2.46.0`; the first bootstrap resolves the tag to a full commit SHA and creates `Tools/XcodeGen.lock.json`. Later bootstraps fail if the tag resolves to a different SHA.

`script/bootstrap_xcodegen.sh` must:

1. clone `https://github.com/yonaskolb/XcodeGen.git` into ignored `.tools/xcodegen/source` when absent;
2. fetch only tag `2.46.0`;
3. resolve the peeled tag commit;
4. compare it with `resolvedCommit` in the lock file when the lock exists;
5. write the lock atomically when it does not exist;
6. build Release with SwiftPM;
7. print only the absolute path to the resulting `xcodegen` binary on stdout.

The lock has exact keys:

```json
{
  "repository": "https://github.com/yonaskolb/XcodeGen.git",
  "tag": "2.46.0",
  "resolvedCommit": "40-lowercase-hex-characters"
}
```

## 7. Valid helper scripts

### 7.1 `script/generate_project.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
XCODEGEN="$($ROOT/script/bootstrap_xcodegen.sh)"

case "${1:-generate}" in
  generate)
    "$XCODEGEN" generate --spec "$ROOT/project.yml" --project "$ROOT"
    ;;
  check|--check)
    TMP="$(mktemp -d)"
    trap 'rm -rf "$TMP"' EXIT
    rsync -a \
      --exclude '.git' \
      --exclude '.tools' \
      --exclude 'build' \
      --exclude 'ColdStartAppleCollectors.xcodeproj' \
      "$ROOT/" "$TMP/"
    "$XCODEGEN" generate --spec "$TMP/project.yml" --project "$TMP"
    diff -ru \
      "$ROOT/ColdStartAppleCollectors.xcodeproj" \
      "$TMP/ColdStartAppleCollectors.xcodeproj"
    ;;
  *)
    echo "usage: $0 [generate|--check]" >&2
    exit 2
    ;;
esac
```

### 7.2 `script/test_packages.sh`

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

### 7.3 `script/test_apps.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DERIVED="$ROOT/build/DerivedData"
ONLY="${2:-}"

if [[ "${1:-}" == "--only" && -z "$ONLY" ]]; then
  echo "usage: $0 [--only <test-target>]" >&2
  exit 2
fi

run_scheme() {
  local scheme="$1"
  local test_target="$2"
  local args=(
    -project "$ROOT/ColdStartAppleCollectors.xcodeproj"
    -scheme "$scheme"
    -configuration Debug
    -derivedDataPath "$DERIVED"
    -destination 'platform=macOS,arch=arm64'
    test
  )
  if [[ -n "$ONLY" ]]; then
    args+=("-only-testing:$test_target")
  fi
  xcodebuild "${args[@]}"
}

if [[ -z "$ONLY" || "$ONLY" == "ContactsCollectorTests" ]]; then
  run_scheme ContactsCollector ContactsCollectorTests
fi
if [[ -z "$ONLY" || "$ONLY" == "SnapshotValidatorTests" ]]; then
  run_scheme SnapshotValidator SnapshotValidatorTests
fi
if [[ -z "$ONLY" || "$ONLY" == "ContactsCollectorUITests" ]]; then
  run_scheme ContactsCollectorTestHost ContactsCollectorUITests
fi

if [[ -n "$ONLY" && \
      "$ONLY" != "ContactsCollectorTests" && \
      "$ONLY" != "SnapshotValidatorTests" && \
      "$ONLY" != "ContactsCollectorUITests" ]]; then
  echo "unknown test target: $ONLY" >&2
  exit 2
fi
```

### 7.4 `script/build_and_run.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail
MODE="${1:-run}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${APP_TARGET:-ContactsCollector}"

case "$TARGET" in
  ContactsCollector)
    SUBSYSTEM="com.jordanschwartz.gbrain.coldstart.contacts"
    ;;
  SnapshotValidator)
    SUBSYSTEM="com.jordanschwartz.gbrain.coldstart.validator"
    ;;
  *)
    echo "unsupported APP_TARGET: $TARGET" >&2
    exit 2
    ;;
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
  run)
    /usr/bin/open -n "$APP"
    ;;
  debug|--debug)
    lldb -- "$BIN"
    ;;
  logs|--logs)
    /usr/bin/open -n "$APP"
    /usr/bin/log stream --info --style compact --predicate "process == \"$TARGET\""
    ;;
  telemetry|--telemetry)
    /usr/bin/open -n "$APP"
    /usr/bin/log stream --info --style compact --predicate "subsystem == \"$SUBSYSTEM\""
    ;;
  verify|--verify)
    /usr/bin/open -n "$APP"
    sleep 1
    pgrep -x "$TARGET" >/dev/null
    ;;
  *)
    echo "usage: $0 [run|--debug|--logs|--telemetry|--verify]" >&2
    exit 2
    ;;
esac
```

`.codex/environments/environment.toml`:

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

### 7.5 `script/verify_release.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DERIVED="$ROOT/build/ReleaseDerivedData"

"$ROOT/script/generate_project.sh" --check
"$ROOT/script/validate_fixtures.py"
"$ROOT/script/test_packages.sh"
"$ROOT/script/test_apps.sh"
"$ROOT/script/verify_project_shape.sh"
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

Every shell script must pass both `bash -n` and ShellCheck. ShellCheck is a local development prerequisite and is not shipped.

## 8. Forbidden API contract

`script/scan_forbidden_apis.sh` scans production Swift sources under:

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

`CNContactImageDataAvailableKey` and `imageDataAvailable` are permitted. `Process` is rejected only in production Swift, not shell scripts, tests, fixtures, or documentation.

Binary mode inspects the main executable and every nested Mach-O file with `nm -m`, `otool -L`, and `strings`. It rejects Contacts mutation symbols, script execution, network client/server symbols, test-host names, and any nested executable outside a checked-in exact allowlist.

## 9. Entitlement verification

`script/inspect_entitlements.sh` runs:

```bash
codesign -dvvv --entitlements :- <app>
spctl -a -vv <app>
```

It parses the signed entitlements and requires exact sets:

```text
ContactsCollector:
  com.apple.security.app-sandbox = true
  com.apple.security.personal-information.addressbook = true
  com.apple.security.files.user-selected.read-write = true

SnapshotValidator:
  com.apple.security.app-sandbox = true
  com.apple.security.files.user-selected.read-only = true
```

It rejects network client/server, Apple Events, application groups, explicit Keychain groups, Contacts notes, calendar, location, camera, microphone, Photos, Bluetooth, USB, and `get-task-allow` in Release.

## 10. JSON schema inventory

All schema files use JSON Schema Draft 2020-12. Every object declares `additionalProperties: false`.

### `collector-request-v1.schema.json`

Required exact fields:

```text
schemaVersion = 1
runId = UUID
 domain = contacts
requestedAt = UTC RFC 3339 with milliseconds
window.start = null
window.end = null
suggestedScopeIds = array of strings
limits.maxRecords = integer 1...100000
```

### `collector-enrollment-v1.schema.json`

Required exact fields mirror `CollectorEnrollmentDocument`, including a 65-byte X9.63 public key encoded as unpadded Base64 and an exact `CodeIdentityClaim`.

### `contacts-record-v1.schema.json`

Required exact fields are the flattened `ContactRecordPayload` fields plus `contentHash`. It requires:

```text
schemaVersion = 1
identityMapVersion = 1
snapshotRecordId = lowercase SHA-256
contentHash = lowercase SHA-256
notesStatus = excludedByDesign
```

It has no note-content, image-data, mutable-state, or arbitrary metadata field.

### `snapshot-manifest-v2.schema.json`

Required exact fields mirror `SnapshotManifest`, with:

```text
schemaVersion = 2
domainSchemaVersion = 1
collector = contacts
signatureAlgorithm = ecdsa-p256-sha256-der
```

### `public-receipt-v1.schema.json`

Required exact fields mirror `PublicReceipt`. It has no source-derived string or raw identifier field.

### `validation-receipt-v1.schema.json`

Required exact fields mirror `ValidationReceipt` in the normative contract.

## 11. Fixture validation

`script/validate_fixtures.py` uses only Python's standard library. It is a project-specific validator, not a general JSON Schema engine. It:

- loads every JSON fixture;
- verifies exact key sets and primitive/container types for the six schemas;
- validates integer ranges, enum values, UUIDs, lowercase SHA-256, X9.63 Base64 length, and millisecond RFC 3339 timestamps;
- verifies every NDJSON line is nonblank, newline-terminated, and canonical;
- recalculates contact `contentHash` values;
- recalculates manifest/content hashes for snapshot fixtures;
- exits nonzero with file and line on the first mismatch.

Swift package tests decode the same fixtures and compare checked-in golden canonical bytes and signatures.

## 12. CI action pinning

The workflow must not use a floating action tag.

`script/resolve_github_action_lock.sh`:

1. resolves the reviewed `actions/checkout` release tag through the GitHub API;
2. requires a full 40-character commit SHA;
3. writes repository, reviewed release tag, resolved SHA, retrieval timestamp, and API-response SHA-256 to `Tools/GitHubActions.lock.json`;
4. fails on later runs if the tag resolves differently;
5. requires human review before committing the workflow.

`.github/workflows/ci.yml` uses the exact resolved SHA and runs on macOS:

```text
validate_fixtures.py
bootstrap_xcodegen.sh
generate_project.sh --check
test_packages.sh
scan_forbidden_apis.sh
check_docs_and_attribution.sh
```

CI does not request Contacts permission, evaluate LocalAuthentication, create production Secure Enclave keys, automatically sign qualification apps, or claim Gate B.

## 13. Documentation outputs

### `LICENSE`

MIT License with:

```text
Copyright (c) 2026 Jordan Schwartz and contributors
```

### `NOTICE`

Lists every copied or substantially adapted upstream file with repository, revision, original path, copyright notice, license, and local path.

### `UPSTREAM.md`

Pins the reviewed Apple PIM revision and records each imported idea/file, local modifications, excluded mutation surface, and future subsystem-review procedure. It forbids generic upstream merges.

### `README.md`

Begins with:

```text
Status: synthetic qualification only. Do not use with real Contacts data until a Gate B report for the exact collector build, signing identity, and macOS build is approved.
```

It documents prerequisites, bundle IDs, project generation, local signing configuration, build/test commands, the read-only code boundary, and non-goals. It contains no real-data admission instructions.

### `SECURITY.md`

Documents the same-user confused-deputy threat, device-owner authentication, signed-snapshot assumptions, lack of confidentiality after export, per-validation collector-app reinspection, excluded APIs, synthetic-data rule, and private vulnerability-reporting process.

### `Qualification/Contacts/README.md`

States that Gate B is local owner qualification, not public certification, and authorizes only Contacts on the exact build/signing/macOS lineage recorded in the approved report.

## 14. Coverage matrix

| Approved requirement | Plan location |
|---|---|
| separate visible Contacts app | Tasks 1 and 8 |
| separate validator without Contacts | Tasks 1, 13, and 14 |
| exact sandbox entitlements | Tasks 1 and 16; Appendix §§4 and 9 |
| strict bounded request | Task 2; Contract §6 |
| visible scope review | Task 8 |
| fresh device-owner authentication | Task 10; Contract §7 |
| local security-scoped root | Task 9; Contract §14 |
| immutable raw source cards | Tasks 5 and 6; Contract §9 |
| raw/unified identity distinction | Tasks 6 and 7; Contract §§8–10 |
| notes/image bytes excluded | Tasks 6, 7, and 16 |
| conservative reconciliation | Task 4; Contract §10 |
| Secure Enclave collector key | Task 11; Contract §12 |
| collector key/code enrollment | Task 13; Contract §15 |
| collector app reinspected each validation | Task 14; Contract §16 |
| canonical signed snapshot | Tasks 2, 3, and 12; Contract §§3–4 and 13 |
| verify signature/path/hash before parsing | Task 14; Contract §§16 and 18 |
| validator-signed receipt | Task 14; Contract §17 |
| no production test bypass | Tasks 8, 15, and 16; Contract §20 |
| checked-in schemas and fixtures | Tasks 2, 4, 7, 12, and 14; Appendix §§10–11 |
| synthetic-only Gate B | Tasks 17 and 18; Contract §21 |
| byte-stable rerun | Tasks 7, 12, and 18 |
| semantic source before/after proof | Task 18 |
| upstream attribution | Task 17; Appendix §13 |
| no other Apple domains or GBrain ingestion | Global constraints |

No approved Contacts requirement is deferred beyond Gate B. Calendar, Mail, Messages, and GBrain ingestion remain separate plans by design.
