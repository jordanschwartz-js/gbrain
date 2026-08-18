# Apple Cold Start Gate D Normative Contract

**Plan:** `docs/superpowers/plans/2026-08-18-apple-cold-start-gate-d.md`  
**Scaffolding appendix:** `docs/superpowers/plans/2026-08-18-apple-cold-start-gate-d-scaffolding.md`  
**Spec:** `docs/superpowers/specs/2026-08-18-cold-start-apple-reader-design.md`  
**Status:** Required companion to the Gate D implementation plan

This contract defines the signed-validator handoff, GBrain trust root, snapshot verification order, deterministic Contacts and Calendar parsing, isolated source repository, staging and review protocol, idempotent apply behavior, receipts, cleanup, and Gate D evidence. The executor must read this contract, the scaffolding appendix, the task plan, the Contacts contract, the Calendar contract, and the Calendar final-review addendum before changing either implementation repository.

## 1. Stage and preconditions

Gate D is the third approved implementation stage:

```text
Contacts Gate B
→ Calendar Gate C
→ Signed Snapshot Validator handoff
→ deterministic GBrain Adapter
→ Gate D
→ Mail feasibility Gate M0
```

Work begins only when all of these private local inputs exist:

```text
GATE_B_COLLECTOR_APP
GATE_B_SNAPSHOT
GATE_B_REPORT
GATE_B_VALIDATOR_TRUST_EXPORT
GATE_C_COLLECTOR_APP
GATE_C_SNAPSHOT
GATE_C_REPORT
GATE_C_VALIDATOR_TRUST_EXPORT
GATE_C_VALIDATOR_APP
COLLECTORS_GATE_C_COMMIT
```

The Gate B and Gate C reports must say `PASS`. `COLLECTORS_GATE_C_COMMIT` is the exact commit from `jordanschwartz-js/cold-start-apple-collectors` used to build the qualified Calendar Collector and updated validator. Every path and digest is recorded in an ignored local precondition receipt before code work starts.

Gate D does not:

- change or re-sign either qualified collector;
- grant Contacts, Calendar, Reminders, Mail, Messages, Apple Events, or Full Disk Access to GBrain;
- admit real Contacts or Calendar data;
- implement Mail, Messages, live sync, background collection, or LLM enrichment;
- update the historical `agent/cold-start-apple` branch;
- federate the Apple source into default search;
- propagate source deletions.

## 2. Two-repository ownership

### 2.1 Collectors repository

`jordanschwartz-js/cold-start-apple-collectors` owns:

- `SnapshotValidator.app`;
- collector trust records in the validator Keychain;
- collector snapshot verification;
- the validator receipt-signing key;
- validator enrollment export;
- validation handoff export;
- validation and handoff schemas;
- retained Contacts and Calendar validation regression.

It does not write GBrain Markdown, touch the GBrain database, register GBrain sources, or decide entity slugs.

### 2.2 GBrain repository

`jordanschwartz-js/gbrain` owns:

- the local CLI-only `apple-cold-start` command group;
- validator trust enrollment for GBrain;
- independent validator app code-identity inspection;
- validation handoff and snapshot re-verification;
- strict Contacts and Calendar decoders;
- identity reconciliation;
- deterministic Markdown staging;
- review and human approval;
- Git apply and GBrain source sync;
- operational receipts and cleanup.

The Gate D command is local-only and is not added to the MCP operation registry, HTTP surface, Minions, scheduler, or agent tool catalog.

## 3. Threat model and trust statement

Gate D protects against:

1. a forged, unsigned, altered, incomplete, or wrong-key validation handoff;
2. a validator app that changed after GBrain enrollment;
3. snapshot modification after validator review but before GBrain parsing;
4. symlink, hard-link, path traversal, ownership, mode, sparse-file, and oversized-file attacks;
5. source strings that try to change paths, frontmatter, Markdown structure, commands, approval state, or cleanup scope;
6. ambiguous Contacts or Calendar identity changes;
7. a changed staging plan after human approval;
8. source repository drift between stage and apply;
9. repeated apply, interrupted sync, and cleanup retries;
10. an LLM or agent attempting to bypass the review gate through a noninteractive flag.

Gate D does not claim protection when an attacker can replace the GBrain binary, modify GBrain's owner-only validator trust file, replace the operating system or Security framework, or control the unlocked owner account. That boundary matches the parent architecture. File permissions, app reinspection, signatures, and exact approval digests still reduce accidental or opportunistic failures inside that boundary.

## 4. Validator app change boundary

Gate D may change `SnapshotValidator.app` only to add:

- a validator enrollment export;
- a signed validation handoff export;
- user-selected read-write access for the export destination;
- the corresponding visible UI, schemas, tests, and qualification evidence.

The validator keeps the same fixed bundle identifier:

```text
com.jordanschwartz.gbrain.coldstart.validator
```

Its production entitlements become exactly:

```xml
<key>com.apple.security.app-sandbox</key>
<true/>
<key>com.apple.security.files.user-selected.read-write</key>
<true/>
```

It has no personal-information, network client/server, Apple Events, automation, app-group, Keychain-group, or temporary-exception entitlement.

Changing the validator entitlement changes its code identity. Gate D therefore requires:

- a fresh final Release build;
- retained Gate B Contacts snapshot validation;
- retained Gate C Calendar snapshot validation;
- retained collector trust migration without silent recreation;
- fresh validator enrollment into GBrain;
- final code-identity and entitlement receipts.

## 5. Validator receipt key and formats

Gate D reuses the existing validator receipt-signing key:

```text
service: com.jordanschwartz.gbrain.coldstart.validator.receipt-signing
account: p256-secure-enclave-v1
accessibility: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
synchronizable: false
access group: none
algorithm: ECDSA P-256 with SHA-256
public key: ANSI X9.63 uncompressed, 65 bytes
signature encoding: ASN.1 DER
```

There is no production software-key fallback. Reinstall or key loss creates a new fingerprint and requires GBrain re-enrollment.

Canonical JSON is the same version already qualified for collector and validator receipts:

- UTF-8, no BOM;
- sorted keys;
- no insignificant whitespace;
- forward slashes unescaped;
- no floating-point numbers in signed objects;
- UTC RFC 3339 timestamps with exactly three fractional digits;
- lowercase UUID strings and SHA-256 hex;
- no newline on signed JSON;
- one newline on each `COMPLETE` file.

## 6. Validator enrollment export

Create this Swift model inside `SnapshotValidatorKit`:

```swift
public struct ValidatorEnrollmentDocumentV1: Codable, Equatable, Sendable {
    public let schemaVersion: Int
    public let codeIdentityAlgorithm: String
    public let publicKeyX963Base64: String
    public let keyFingerprint: String
    public let codeIdentity: CodeIdentityClaim
    public let validatorVersion: String
    public let signatureAlgorithm: String
    public let issuedAt: String
}
```

Fixed values:

```text
schemaVersion = 1
codeIdentityAlgorithm = macos-signing-v1
signatureAlgorithm = ecdsa-p256-sha256-der
```

The visible export requires a fresh `LAPolicy.deviceOwnerAuthentication` result with reuse duration `0`. It writes to a user-selected local owner-only directory:

```text
validator-enrollment.json
validator-enrollment.sig
COMPLETE
```

Rules:

1. `validator-enrollment.json` is canonical JSON.
2. `validator-enrollment.sig` is raw DER over the exact JSON bytes.
3. `COMPLETE` is exactly the JSON SHA-256 plus newline.
4. Files are mode `0600`, the directory is `0700`, and creation refuses symlinks, hard links, existing protocol files, Git ancestors, sync roots, and nonlocal volumes.
5. The private key is never exported.
6. No collector trust record is included.
7. Export cancellation writes no completed directory.

## 7. Code identity algorithm `macos-signing-v1`

Swift and TypeScript implementations must produce the same `CodeIdentityClaim` fields.

The algorithm is:

1. verify the app with the platform Security API or `codesign --verify --strict`;
2. read the bundle identifier;
3. read the Team Identifier;
4. render the designated requirement using Apple's canonical requirement string;
5. read the primary CDHash as lowercase hex;
6. SHA-256 the exact main executable bytes;
7. read the signed entitlements dictionary, convert it to canonical JSON using sorted object keys and recursively preserved scalar/array values, then SHA-256 those bytes;
8. read marketing version and build number from the signed bundle Info.plist.

The TypeScript implementation invokes only absolute platform tools with `execFile`, never a shell:

```text
/usr/bin/codesign --verify --strict --verbose=4 <app>
/usr/bin/codesign -dvvv --entitlements :- <app>
/usr/bin/codesign -dr - <app>
/usr/bin/plutil -convert json -o - -
```

It independently hashes the main executable. Parsing failure, multiple identifiers, missing Team ID, invalid signature, malformed entitlements, or field disagreement fails closed.

## 8. Signed validation handoff

Create this model inside `SnapshotValidatorKit`:

```swift
public struct ValidationHandoffV1: Codable, Equatable, Sendable {
    public let schemaVersion: Int
    public let validationPolicyVersion: Int
    public let domain: ValidatedCollectorDomain
    public let runId: UUID
    public let requestDigest: String
    public let effectiveScopeDigest: String
    public let manifestSha256: String
    public let manifestSchemaVersion: Int
    public let domainSchemaVersion: Int
    public let collectorKeyFingerprint: String
    public let collectorCodeIdentity: CodeIdentityClaim
    public let snapshotStatus: SnapshotStatus
    public let importEligible: Bool
    public let contentFiles: [SnapshotContentFile]
    public let hashesFileSha256: String
    public let validationReceiptSha256: String
    public let validationReceiptSignatureSha256: String
    public let validatorVersion: String
    public let validatorCodeIdentity: CodeIdentityClaim
    public let validatorKeyFingerprint: String
    public let validatedAt: String
    public let exportedAt: String
}
```

Fixed values:

```text
schemaVersion = 1
validationPolicyVersion = 1
```

A handoff can be exported only after the validator has successfully completed its existing full snapshot-validation pipeline in the current app session. `snapshotStatus` must be `complete`, and `ValidationReceiptV2.importEligible` must be `true`. Partial, unavailable, error, cancelled, stale-trust, or warning-blocked snapshots receive no Gate D handoff.

The user must explicitly press **Export for GBrain** and choose the enrolled handoff root. Handoff export does not automatically run after validation and has no CLI, URL, XPC, daemon, or background trigger.

The handoff directory is:

```text
<handoff-root>/<manifest-sha256>/
├── validation-receipt-v2.json
├── validation-receipt-v2.sig
├── validation-handoff.json
├── validation-handoff.sig
└── COMPLETE
```

Rules:

1. receipt files are exact copies of the signed validator-sandbox receipt;
2. the handoff records both receipt digests;
3. `validation-handoff.sig` signs the exact canonical handoff JSON bytes;
4. `COMPLETE` is the handoff JSON digest plus newline;
5. `contentFiles` is copied from the already verified collector manifest and sorted by filename;
6. no title, name, email, phone, attendee, note, location, URL, raw local identifier, or record body enters the handoff;
7. a handoff never copies snapshot content;
8. export writes to temporary names, fsyncs, atomically renames, and writes `COMPLETE` last;
9. an existing handoff directory is never overwritten.

## 9. Validator handoff file limits

```text
validator-enrollment.json       1 MiB
validator-enrollment.sig      256 bytes maximum
validation-receipt-v2.json      1 MiB
validation-receipt-v2.sig     256 bytes maximum
validation-handoff.json         1 MiB
validation-handoff.sig        256 bytes maximum
COMPLETE                       exactly 65 bytes
```

All protocol directories and files must be owned by the current user, directories mode `0700`, files mode `0600`, regular files only, link count `1`, and no nested entries beyond the fixed set.

## 10. GBrain local paths

Gate D adds these paths under `gbrainPath('apple-cold-start')`:

```text
~/.gbrain/apple-cold-start/
├── trust/
│   └── validator-v1.json
├── inbox/
│   ├── snapshots/
│   └── handoffs/
├── source/
├── runs/
│   └── <verification-id>/
│       ├── verification-v1.json
│       ├── stage-plan-v1.json
│       ├── review.md
│       ├── approval-v1.json
│       ├── apply-receipt-v1.json
│       ├── cleanup-receipt-v1.json
│       └── worktree/
└── locks/
```

Parent and run directories are `0700`; state files are `0600`. GBrain refuses symlinks at every ancestor it owns. `GBRAIN_HOME` remains supported for isolated tests.

The inbox paths are created by GBrain. The user grants collector and validator access to the appropriate subfolder through their visible file panels. GBrain does not grant TCC or sandbox access programmatically.

## 11. GBrain validator trust record

Create this TypeScript interface:

```ts
export interface ValidatorTrustRecordV1 {
  schemaVersion: 1;
  codeIdentityAlgorithm: 'macos-signing-v1';
  validatorAppPath: string;
  publicKeyX963Base64: string;
  keyFingerprint: string;
  expectedCodeIdentity: CodeIdentityClaim;
  enrollmentDocumentSha256: string;
  enrolledAt: string;
  gbrainVersion: string;
}
```

The trust file is owner-only local operational state. It is never placed in a brain repo, source repo, report, log, sync folder, or Git commit.

Enrollment command:

```text
gbrain apple-cold-start trust enroll-validator \
  --app <absolute SnapshotValidator.app path> \
  --enrollment <absolute enrollment directory>
```

Enrollment behavior:

1. macOS only;
2. require a TTY;
3. refuse symlinked app or enrollment paths;
4. verify fixed enrollment files, modes, owner, sizes, `COMPLETE`, and self-signature;
5. independently inspect the selected app using `macos-signing-v1`;
6. require exact equality with the signed enrollment claim;
7. display bundle ID, Team ID, CDHash, executable hash, entitlements hash, and key fingerprint;
8. prompt the owner to type `ENROLL <first-12-fingerprint-characters>`;
9. write the trust record atomically with mode `0600`;
10. refuse noninteractive enrollment and expose no `--yes`, environment, config, or hidden bypass.

Changing the app path, key, code identity, or trust file requires the same enrollment flow again.

## 12. Signature verification in Bun

GBrain converts the enrolled 65-byte X9.63 key into a Node-compatible JWK:

```ts
export function p256PublicKeyFromX963(bytes: Uint8Array): KeyObject {
  if (bytes.length !== 65 || bytes[0] !== 0x04) {
    throw new AppleTrustError('invalid_p256_public_key');
  }
  const x = Buffer.from(bytes.subarray(1, 33)).toString('base64url');
  const y = Buffer.from(bytes.subarray(33, 65)).toString('base64url');
  return createPublicKey({
    key: { kty: 'EC', crv: 'P-256', x, y },
    format: 'jwk',
  });
}
```

Signature verification uses Node `crypto.verify('sha256', bytes, key, derSignature)`. Golden Swift/Bun cross-language vectors are checked into both repositories and must pass before Gate D qualification.

## 13. Verification command and identity

Command:

```text
gbrain apple-cold-start verify \
  --snapshot <absolute collector domain directory> \
  --handoff <absolute validation handoff directory> \
  --request <absolute original request file> \
  [--json]
```

The deterministic verification ID is:

```text
SHA256(
  "apple-cold-start-verification-v1\0" ||
  handoffSha256 || "\0" ||
  manifestSha256 || "\0" ||
  requestFileSha256
)
```

The request file is operational context, not the preimage of the collector's frozen request digest. Gates B and C already qualified the collectors' internal request-freezing and no-broadening behavior. Gate D therefore verifies:

- request schema, domain, and run ID;
- request upper bounds against signed coverage where the domain exposes them;
- exact equality of `requestDigest` and `effectiveScopeDigest` between the signed collector manifest and signed validator handoff;
- the opaque authenticated digests are preserved in every downstream receipt.

Gate D does not falsely claim that GBrain can recompute a frozen collector digest from the original request file alone.

## 14. Verification order in GBrain

Before decoding one source record, GBrain:

1. loads the owner-only validator trust record;
2. re-inspects the enrolled validator app and requires exact code-identity equality;
3. opens the fixed handoff files with `O_NOFOLLOW` and verifies ownership, modes, link counts, sizes, no nested entries, `COMPLETE`, and handoff signature;
4. verifies the embedded validator code identity and key fingerprint;
5. verifies the exact V2 receipt bytes and signature;
6. requires the handoff receipt digests to match those files;
7. requires V2 domain, manifest digest, collector identity, status, `verificationResult`, and `importEligible` to agree with the handoff;
8. strictly parses the original request and checks domain/run ID/upper bounds;
9. opens the collector snapshot directory and fixed files without following links;
10. hashes exact private-manifest bytes and requires `manifestSha256`;
11. parses the manifest only after the handoff signature is trusted;
12. requires manifest domain, request digest, effective-scope digest, collector identity, schema versions, status, content-file table, and hash-list digest to agree with the handoff;
13. verifies collector `COMPLETE`, fixed paths, owner, modes, link counts, sizes, and no undeclared entries;
14. hashes every content file and the hash list in a first pass;
15. requires exact byte lengths and hashes;
16. rewinds the same open file descriptors, parses in a second pass, and computes a second hash;
17. discards every parsed object unless the second hash equals the first trusted hash and final `fstat` identity/size/mtime values remain consistent;
18. validates exact schemas, ordering, per-record content hashes, counts, and complete-status semantics;
19. writes `verification-v1.json` atomically;
20. emits only non-sensitive IDs, counts, domains, and hashes.

The collector signature itself is not reverified by GBrain because collector trust remains validator-owned. GBrain trusts the enrolled validator's signed handoff and independently proves that the bytes it parses are the same bytes the validator attested.

## 15. Safe file API

Create a Darwin-only safe-file layer with these interfaces:

```ts
export interface SafeOpenedFile {
  fd: number;
  path: string;
  size: number;
  mode: number;
  uid: number;
  inode: bigint;
  device: bigint;
  mtimeNs: bigint;
}

export function openRegularOwnerFile(
  absolutePath: string,
  expectedMode: number,
  maximumBytes: number,
): SafeOpenedFile;

export function hashFileDescriptorTwice(
  file: SafeOpenedFile,
  parseSecondPass: (fd: number) => Promise<void>,
): Promise<string>;
```

Use `lstat`, `openSync(O_RDONLY | O_NOFOLLOW)`, `fstat`, owner UID equality, exact regular-file type, exact mode, link count `1`, and size caps. Directory traversal uses fixed filenames only. No path from a snapshot record becomes a filesystem path.

Sparse files are rejected when `SEEK_HOLE` support proves a hole exists. When the platform cannot report holes, Gate D reads and hashes every byte under the size cap and records the limitation.

## 16. Verified snapshot state

```ts
export interface VerifiedCollectorSnapshotV1 {
  schemaVersion: 1;
  verificationId: string;
  domain: 'contacts' | 'calendar';
  runId: string;
  requestFileSha256: string;
  requestDigest: string;
  effectiveScopeDigest: string;
  handoffSha256: string;
  manifestSha256: string;
  manifestSchemaVersion: number;
  domainSchemaVersion: number;
  collectorKeyFingerprint: string;
  collectorCodeIdentity: CodeIdentityClaim;
  validatorKeyFingerprint: string;
  validatorCodeIdentity: CodeIdentityClaim;
  contentFiles: SnapshotContentFile[];
  snapshotPath: string;
  handoffPath: string;
  requestPath: string;
  recordCount: number;
  verifiedAt: string;
  adapterVersion: string;
}
```

Private absolute paths remain only in this owner-only state file. Public CLI JSON omits them unless `--include-private-paths` is explicitly invoked from a TTY; Gate D qualification does not use that flag.

## 17. Collector schema lock

Gate D vendors the exact Contacts and Calendar JSON schemas from `COLLECTORS_GATE_C_COMMIT` under:

```text
schemas/apple-cold-start/collectors/<commit>/
```

`collectors-schema-lock-v1.json` records:

```ts
export interface CollectorsSchemaLockV1 {
  schemaVersion: 1;
  repository: 'jordanschwartz-js/cold-start-apple-collectors';
  commit: string;
  files: Array<{ path: string; sha256: string; byteLength: number }>;
  contactsDomainSchemaVersion: 1;
  calendarDomainSchemaVersion: 1;
  handoffSchemaVersion: 1;
  validationReceiptSchemaVersion: 2;
}
```

CI and Gate D refuse an unrecorded collector commit, changed schema bytes, unknown schema version, or permissive decoder fallback.

## 18. No LLM in Gate D core

Contacts and Calendar Gate D mapping is deterministic. Production Gate D code imports no OpenAI, Anthropic, model router, shell-agent, MCP, or Minions module.

Source content is treated as untrusted data and can affect only escaped text fields inside predetermined Markdown templates. A later semantic-enrichment worker requires a separate design and cannot be smuggled into this plan as an implementation detail.

## 19. Apple source repository

Gate D uses one dedicated source repository so Contacts, Calendar, attendee links, and back-links can be committed atomically:

```text
source id: apple-cold-start
source path: ~/.gbrain/apple-cold-start/source
federated: false
syncEnabled: true
strategy: markdown
Git remote: none
branch: main
```

Command:

```text
gbrain apple-cold-start source init [--path <absolute path>] [--json]
```

Initialization:

1. requires a local, nonsynced, non-Git-ancestor path with owner-only permissions;
2. initializes Git with branch `main` when absent;
3. refuses an existing remote;
4. creates `README.md`, `.gitattributes`, `.gbrain-source`, `.raw/`, and `.apple-state/` structure;
5. creates one initial commit;
6. registers or verifies the `apple-cold-start` source row;
7. requires exact local path and `federated=false` when the row already exists;
8. refuses source-path overlap using the existing GBrain source rule;
9. never federates automatically.

The source repo is private local knowledge storage. Hidden `.raw` and `.apple-state` directories are Git-tracked but skipped by GBrain's file walker.

## 20. Source repository layout

```text
apple-cold-start/
├── README.md
├── .gitattributes
├── .gbrain-source
├── people/
├── companies/
├── daily/calendar/
│   ├── calendar-log.md
│   └── YYYY/
│       ├── YYYY-MM.md
│       └── YYYY-MM-DD.md
├── imports/
│   ├── contacts/
│   └── calendar/
├── .raw/snapshots/
│   ├── contacts/<manifest-sha256>/
│   └── calendar/<manifest-sha256>/
└── .apple-state/
    ├── schema-v1.json
    ├── contacts-identity-v1.json
    ├── calendar-identity-v1.json
    └── import-ledger-v1.json
```

No source deletion is propagated in V1. A record absent from a later snapshot is recorded as `missingForReview`; its page or event text is not deleted automatically.

## 21. Identity state and ownership

### 21.1 Contacts

```ts
export interface ContactIdentityEntryV1 {
  durableRecordId: string;
  slug: string;
  pageType: 'person' | 'company';
  rawLocators: Array<{ containerIdentifier: string; contactIdentifier: string }>;
  strongEmails: string[];
  strongPhones: string[];
  sourceContentHash: string;
  observedAliases: string[];
  managedTruthBlockSha256: string;
  managedTimelineBlockSha256: string | null;
  lastManifestSha256: string;
}
```

The adapter preserves the collector's conservative match order and contradiction rules. A changed raw locator creates an alias transition only when the match is unique. Name and organization alone never match records.

### 21.2 Calendar

```ts
export interface CalendarIdentityEntryV1 {
  durableEventId: string;
  observedLocator: Record<string, unknown>;
  externalIdentifier: string | null;
  occurrenceAnchor: string;
  sourceIdentifier: string;
  sourceAccountHint: string;
  strongFingerprint: string;
  pageLocalDate: string;
  sourceContentHash: string;
  observedAliases: string[];
  lastManifestSha256: string;
}
```

The adapter uses the Calendar final-review reconciliation order: exact locator; unique external identifier plus occurrence anchor plus exact source; unique external identifier plus occurrence anchor plus source-account hint; unique strong fingerprint; new; or ambiguity. No first-match behavior is permitted.

## 22. Stable slug algorithm

For a new durable Contacts identity:

1. choose formatted person name or organization title;
2. Unicode NFKD normalize;
3. remove combining marks;
4. locale-independent lowercase;
5. replace every non-ASCII alphanumeric run with `-`;
6. trim `-`;
7. cap the base at 56 characters;
8. use `contact-<first-12-durable-id>` when empty;
9. use `people/<base>` or `companies/<base>` when unique;
10. on collision with another identity or unmanaged file, append `-<first-8-durable-id>`.

Once assigned, the slug is never automatically renamed because the display name changed. The new name updates the page title while the identity map preserves the slug.

## 23. Managed Markdown blocks

Generated pages use exact markers:

```text
<!-- apple-cold-start:managed:v1:<kind>:<durable-id>:start -->
...
<!-- apple-cold-start:managed:v1:<kind>:<durable-id>:end -->
```

Rules:

- generated Contacts truth uses `kind=contact-truth`;
- generated Calendar links on a person page use `kind=calendar-timeline`;
- Calendar day/month/log sections use `kind=calendar-day`, `calendar-month`, or `calendar-log`;
- the identity state stores the last generated block hash;
- content outside managed blocks is preserved byte-for-byte;
- missing, duplicated, nested, reordered, or user-modified managed markers create an ambiguity and block automatic update;
- an unmanaged existing file is never overwritten;
- generated source strings cannot emit marker text or the GBrain timeline sentinel.

## 24. Injection-safe rendering

The renderer has three explicit functions:

```ts
export function yamlQuoted(value: string): string;
export function escapeMarkdownInline(value: string): string;
export function renderLiteralBlock(value: string): string;
```

Rules:

- frontmatter source strings are JSON-quoted YAML scalars;
- inline text escapes backslash, backtick, brackets, asterisk, underscore, angle brackets, hash, pipe, and Markdown link delimiters;
- multiline source text is rendered as a four-space-indented literal block with every physical line prefixed;
- NUL and forbidden control characters are rejected;
- source URLs, email addresses, and phone numbers render as escaped inline code, never executable links;
- no source value controls a filename, Git ref, command, environment variable, SQL, frontmatter key, HTML comment, or review decision.

Golden adversarial fixtures include YAML delimiters, timeline sentinels, HTML comments, Markdown links, wikilinks, shell fragments, SQL, Unicode controls, long lines, and embedded NUL.

## 25. Contacts Markdown mapping

Each accepted Contacts record produces one person or company page and one raw evidence entry.

Person page frontmatter is exactly ordered:

```yaml
---
type: person
title: <quoted title>
slug: people/<stable-slug>
tags: [apple-contacts]
source_kind: apple-contacts-snapshot
source_manifest_sha256: <manifest>
source_record_id: <durable-id>
source_content_hash: <content-hash>
identity_map_version: 1
---
```

Company pages use `type: company`, `companies/<stable-slug>`, and the same provenance fields.

Managed truth contains available name, nickname, organization, department, title, labeled emails, phones, postal addresses, URLs, birthday/dates, relations, social and instant-message handles, image-present boolean, and `notesStatus: excludedByDesign`. Every factual line ends with:

```text
[Source: Apple Contacts snapshot <first-12-manifest>, record <first-12-durable-id>, validated <YYYY-MM-DD>]
```

An organization-only contact becomes a company page. A person's organization becomes a link only when it uniquely matches an organization-only Contacts identity; otherwise it remains escaped text. An empty person/organization title is skipped with a private review reason.

## 26. Calendar Markdown mapping

Calendar records produce:

```text
daily/calendar/calendar-log.md
daily/calendar/YYYY/YYYY-MM.md
daily/calendar/YYYY/YYYY-MM-DD.md
```

Filing date:

- all-day event: `allDaySpan.startDate`;
- timed event: local start date in the recorded event time zone; when the record has no event time zone, use the collector-recorded system-current time zone context;
- never derive an all-day filing date from UTC alone.

Day pages sort event blocks by local start, all-day before timed at the same key, normalized title, then durable event ID. Each block preserves title, local/absolute span, all-day exclusive end, source calendar, location, structured location, status, availability, recurrence, organizer, attendees, alarms, URL, notes, detached state, and occurrence anchor where available.

Every event block ends with:

```text
[Source: Apple Calendar snapshot <first-12-manifest>, event <first-12-durable-id>, validated <YYYY-MM-DD>]
```

Month pages deterministically link day pages and report counts. `calendar-log.md` links months and records the imported window and manifest. No analytical summary or inferred pattern is generated in Gate D.

## 27. Attendee linking and back-links

An attendee URL using `mailto:` is normalized as a Contacts email. The adapter links an attendee only when exactly one Contacts identity has that strong email. Ambiguous or absent matches remain escaped text.

For each unique linked attendee, the adapter adds a managed timeline entry to that existing person page:

```text
- **YYYY-MM-DD** | Attended [[daily/calendar/YYYY/YYYY-MM-DD|<escaped event title>]]. [Source: Apple Calendar snapshot <manifest-prefix>, event <event-prefix>, validated <date>]
```

A Calendar-only person stub is created only when the same normalized attendee appears in at least three distinct imported events, has a nonempty public name or email, and matches no existing Contact identity. The stub is tagged `apple-calendar-stub` and cites all supporting event records. Several possible Contacts matches create an ambiguity and no stub.

Because Contacts and Calendar live in one source repo, day-page links and person-page back-links are committed in one staged Git tree.

## 28. Raw evidence preservation

After successful byte verification, stage exact copies of:

- collector private manifest;
- public receipt;
- records NDJSON;
- errors NDJSON;
- hash list;
- collector signature;
- collector `COMPLETE`;
- validator V2 receipt and signature;
- validation handoff and signature;
- handoff `COMPLETE`;
- original request file.

They go under `.raw/snapshots/<domain>/<manifest-sha256>/` using fixed filenames and verified hashes. GBrain does not index hidden directories. Copying uses temporary files, owner-only modes, fsync, atomic rename, and a post-copy hash check.

## 29. Deterministic staging plan

Command:

```text
gbrain apple-cold-start stage --verification <verification-id> [--json]
```

Staging:

1. requires initialized `apple-cold-start` source;
2. requires source repo `main` clean and with no remote;
3. records `baseCommit`;
4. creates `apple-stage/<plan-id>` in a worktree under the private run directory;
5. copies raw evidence;
6. loads prior hidden identity state;
7. strictly maps and reconciles records;
8. writes managed Markdown and updated hidden state;
9. validates every Markdown file with `parseMarkdown(..., {validate:true})`;
10. checks every managed block and citation;
11. runs `git diff --check`;
12. commits the staged tree with fixed author identity and deterministic author/committer date from the validator handoff;
13. writes the stage plan and review document.

Plan ID:

```text
SHA256(
  "apple-cold-start-stage-v1\0" ||
  verificationId || "\0" ||
  baseCommit || "\0" ||
  adapterSchemaVersion
)
```

The staging commit uses:

```text
author: GBrain Apple Cold Start <noreply@local>
message: apple-cold-start: stage <domain> <manifest-prefix>
author date: handoff exportedAt
committer date: handoff exportedAt
```

The same verified snapshot, source base commit, schemas, and adapter version produce the same tree, plan digest, and staged commit.

## 30. Stage plan model

```ts
export interface StageFileMutationV1 {
  path: string;
  action: 'create' | 'update';
  beforeSha256: string | null;
  afterSha256: string;
  byteLength: number;
  managedKinds: string[];
}

export interface StagePlanV1 {
  schemaVersion: 1;
  planId: string;
  verificationId: string;
  domain: 'contacts' | 'calendar';
  manifestSha256: string;
  sourceId: 'apple-cold-start';
  sourceRepoPath: string;
  baseCommit: string;
  stagedBranch: string;
  stagedCommit: string;
  collectorsSchemaCommit: string;
  adapterSchemaVersion: 1;
  contactsIdentityMapVersion: 1;
  calendarIdentityMapVersion: 1;
  createdPages: number;
  updatedPages: number;
  skippedRecords: number;
  ambiguityCount: number;
  rawEvidenceFiles: number;
  mutations: StageFileMutationV1[];
  samplePaths: string[];
  generatedAt: string;
  planDigest: string;
}
```

`planDigest` is SHA-256 of canonical plan JSON excluding `planDigest`. Mutations sort by path. A Gate D plan contains no delete action.

## 31. Review and approval

Commands:

```text
gbrain apple-cold-start review <plan-id> [--json|--diff]
gbrain apple-cold-start approve <plan-id>
```

`review` shows counts, hashes, base and staged commits, ambiguities, skipped records, all changed paths, and required samples:

- up to five Contacts pages;
- one organization-only Contact when present;
- one timed Calendar event;
- one all-day event;
- one recurring occurrence;
- one attendee-linked event;
- every ambiguity.

`approve`:

1. requires a TTY;
2. rehashes the stage plan and verifies the staged commit/tree;
3. displays the exact plan digest and summary;
4. prompts the owner to type `APPROVE <first-12-plan-digest>`;
5. writes `approval-v1.json` bound to plan digest, staged commit, base commit, source ID, and approval time;
6. exposes no `--yes`, environment, config, stdin-pipe, agent, or hidden bypass.

Tests inject a prompter through a test-only module boundary. Production command code has one interactive implementation.

## 32. Apply and resume semantics

Command:

```text
gbrain apple-cold-start apply <plan-id> [--json]
```

Apply acquires an owner-only filesystem lock and a dedicated GBrain DB advisory lock. It then:

1. loads and verifies the approval record;
2. rechecks plan digest, staged commit/tree, source path, and source ID;
3. requires source `main` HEAD to equal `baseCommit` and the working tree to be clean;
4. fast-forwards `main` to `stagedCommit` using `git merge --ff-only`;
5. calls `performSync` with source ID `apple-cold-start`, `noPull:true`, `noEmbed:true`, and `noExtract:true`;
6. explicitly runs link and timeline extraction for staged page slugs and fails loudly on extraction errors;
7. verifies expected page slugs exist in the source-scoped engine;
8. writes an apply receipt.

If the Git fast-forward succeeds but sync fails, receipt status is `commit_applied_sync_pending`. Rerunning `apply` verifies that `main` already equals `stagedCommit` and resumes sync without creating another commit or rewriting files.

If sync succeeds, status is `applied`. The command never resets a dirty repo, force-pushes, rewrites another branch, or deletes source content.

## 33. Apply receipt

```ts
export interface ApplyReceiptV1 {
  schemaVersion: 1;
  planId: string;
  planDigest: string;
  verificationId: string;
  domain: 'contacts' | 'calendar';
  manifestSha256: string;
  sourceId: 'apple-cold-start';
  sourceCommit: string;
  syncStatus: string;
  pagesVerified: string[];
  linksCreated: number;
  timelineEntriesCreated: number;
  status: 'commit_applied_sync_pending' | 'applied';
  appliedAt: string;
  gbrainVersion: string;
}
```

The receipt is owner-only operational state. The staged source repo also contains an immutable indexed import page at `imports/<domain>/<manifest-sha256>.md` describing the validated source, counts, schemas, and citations without private trust paths.

## 34. GBrain source status

Commands:

```text
gbrain apple-cold-start status [<verification-or-plan-id>] [--json]
gbrain apple-cold-start trust status [--json]
```

Status reports only state machine stage, domain, IDs, hashes, counts, source commit, sync status, retention state, and next allowed action. General output omits source values and absolute private paths.

## 35. Cleanup and retention

Commands:

```text
gbrain apple-cold-start retain <verification-id>
gbrain apple-cold-start cleanup [<verification-id>] [--older-than 7d] --dry-run
gbrain apple-cold-start cleanup [<verification-id>] [--older-than 7d] --confirm
```

Cleanup may remove only snapshot and handoff directories beneath the enrolled GBrain inbox roots and private staging worktrees/branches owned by the matching run. It never deletes Apple source data or the applied source repo.

Eligibility:

- immediately after an `applied` receipt; or
- after seven days from verified handoff export unless retained.

Before deletion, cleanup revalidates realpath containment, fixed run IDs, owner, modes, no symlinks, and recorded manifest/handoff hashes. `--dry-run` is the default when neither mode is supplied. `retain` writes owner-only state and blocks age-based cleanup until explicitly cleared through a future reviewed plan; Gate D has no unretain command.

## 36. Error and exit semantics

Stable error classes:

```text
AppleColdStartUsageError          exit 2
AppleTrustError                   exit 3
AppleValidationError              exit 4
AppleSnapshotError                exit 5
AppleIdentityAmbiguityError       exit 6
AppleReviewRequiredError          exit 7
AppleSourceDriftError             exit 8
AppleSyncPendingError             exit 9
AppleCleanupRefusedError          exit 10
```

`--json` emits one structured error envelope. No failure becomes an empty successful result. Ambiguities are review artifacts, not guessed matches.

## 37. Gate D synthetic fixtures

Gate D uses only the retained fictional Gate B and Gate C snapshots plus additional tampered copies.

Required cases:

- valid Contacts handoff and snapshot;
- valid Calendar handoff and snapshot;
- changed validator app;
- wrong validator key;
- altered handoff after signing;
- altered V2 receipt;
- altered collector manifest;
- post-validation records mutation;
- symlink, hard link, wrong owner/mode, extra file, oversized file, sparse file where supported;
- unknown collector schema commit;
- request run-ID/domain mismatch;
- malicious contact/event strings attempting YAML, Markdown, HTML-comment, timeline, shell, SQL, URL, and path injection;
- duplicate Contacts names;
- Contacts locator drift and strong-identifier contradiction;
- Calendar moved/full-sync locator drift;
- all-day DST boundary;
- recurring and detached occurrence;
- copied event across two accounts;
- ambiguous attendee identity;
- three-event Calendar-only attendee stub threshold;
- user edits outside a managed block;
- user edit inside a managed block;
- dirty source repo;
- base-commit drift after approval;
- stage-plan mutation after approval;
- repeated stage;
- repeated apply;
- sync failure after Git commit and successful resume;
- cleanup refusal outside enrolled roots;
- age cleanup and retain behavior.

## 38. Gate D acceptance

Gate D passes only when the final qualified validator and GBrain builds prove:

1. retained Contacts and Calendar snapshots still validate;
2. validator enrollment and handoff signatures verify across Swift and Bun;
3. GBrain re-inspects the validator app on every verification;
4. no source record is decoded before trusted handoff and byte verification;
5. post-validation mutation is detected;
6. deterministic staging produces the same tree, plan digest, and staged commit on rerun;
7. imported strings cannot change control flow, paths, Markdown structure, or approval;
8. managed-block rules preserve owner text and block managed-block drift;
9. human approval is TTY-only and bound to one plan digest;
10. apply is fast-forward-only, idempotent, and resumable after sync failure;
11. GBrain has no Apple grant, collector key, validator private key, network dependency, or LLM dependency;
12. the `apple-cold-start` source remains non-federated;
13. expected fictional pages, calendar files, links, and back-links exist after sync;
14. raw evidence is preserved in hidden source paths;
15. cleanup never touches Apple source data or paths outside enrolled inboxes;
16. no real Contacts or Calendar data is used.

A Gate D PASS applies only to the exact validator build, GBrain commit, collector schema-lock commit, retained fictional snapshots, macOS build, source-repo format, and evidence recorded in the report.

## 39. Decision locks

Changing any item requires design review:

- validator remains a separate visible app with no Apple personal-data grant;
- validator enrollment requires fresh device-owner authentication;
- GBrain re-inspects validator code identity on every verification;
- X9.63 P-256 keys and DER signatures;
- no GBrain collector trust duplication;
- no record decoding before trusted handoff and byte verification;
- one non-federated `apple-cold-start` source repo;
- no LLM in Gate D core;
- no source deletion propagation;
- managed-block preservation and ambiguity on drift;
- TTY-only exact-digest approval with no noninteractive bypass;
- fast-forward-only apply;
- no real data before Gate D and the separate domain admission decisions;
- Mail feasibility remains the next plan after Gate D.