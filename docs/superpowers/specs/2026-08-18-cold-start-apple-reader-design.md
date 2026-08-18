# Cold Start Apple Collection Architecture

**Date:** 2026-08-18  
**Status:** Revised after adversarial review; awaiting approval; implementation not started  
**Scope:** Local Apple data collection for `skills/cold-start-apple/SKILL.md`

## Executive verdict

The original design had the right high-level instincts but was not safe or precise enough to implement as written.

It correctly required local-only collection, no Apple mutations, explicit coverage, deterministic reruns, and a separate native boundary. However, it combined too much authority in one reusable headless helper, treated unstable Apple identifiers as more durable than Apple documents them to be, and promoted two private-database integrations to first-class V1 components before proving their compatibility boundaries.

This revision changes the architecture rather than merely adding warnings:

1. **Reject the reusable headless TCC helper.** A permanently authorized helper that any same-user process can invoke is a confused-deputy boundary. Apple PIM's current helper forwards caller-supplied CLI arguments and output paths to privileged child tools. That is useful general-purpose infrastructure, but it is the wrong trust model for a sensitive one-time import.
2. **Split permissions by collector.** Contacts, Calendar, and Mail no longer share one process or code-signing identity. Mail's Full Disk Access is isolated from Contacts and Calendar.
3. **Require visible scope review plus macOS user-presence authentication for every export.** A click is insufficient when an agent may have UI automation. Immediately before collection, the app must authenticate the device owner through LocalAuthentication with no authentication-reuse window.
4. **Cryptographically sign completed snapshots.** Plain SHA-256 files detect corruption but do not authenticate who produced a snapshot. GBrain accepts only snapshots signed by an enrolled collector key and matching the approved request digest.
5. **Narrow the first shippable milestone to supported Apple frameworks.** Contacts and Calendar form the core release. Mail remains a separately qualified private-schema module. Messages remains a user-managed external file export until its Full Disk Access, process-argument privacy, output-format, and GPL boundaries are separately accepted.
6. **Treat source identifiers as local locators, not permanent identities.** Every domain carries an identity-map version, reconciliation evidence, and fail-closed ambiguity handling.
7. **Replace a normal Apple PIM fork with a minimal derivative repository.** Upstream lineage remains explicit, but unrelated write, MCP, SMTP, OpenClaw, and mail-channel code never enters the production tree.

The selected design is therefore a **split, user-present, signed snapshot system**, not an always-available Apple connector.

## Review outcome

| Prior design claim | Skeptical finding | Revised decision |
|---|---|---|
| One signed helper app can safely own all Apple permissions | A reusable helper is callable by other same-user processes and concentrates Contacts, Calendar, and Full Disk Access | Separate visible collectors; no unattended production helper |
| A visible confirmation button proves human approval | An agent with Accessibility or computer-control capability may activate ordinary UI | Require `LAPolicy.deviceOwnerAuthentication` immediately before each export, with authentication reuse disabled |
| Hashes make the exported snapshot trustworthy | An attacker who can edit the snapshot can edit its hash file too | Sign the canonical manifest and file digests with an enrolled app-private key |
| The reader is read-only because it exposes no write commands | EventKit has no read-only authorization level; Calendar full access permits reads and writes. Contacts and Calendar sandbox entitlements are also read-write capabilities | State the real boundary: read-write OS grant, but immutable/read-only code surface, separate target, sandbox, no write APIs, user presence, and runtime qualification |
| `eventIdentifier` plus occurrence start is a durable calendar identity | Apple says a full sync can invalidate `calendarItemIdentifier`, and moving an event can change `eventIdentifier` | Preserve all local locators plus recurrence metadata and reconcile only on a unique strong fingerprint |
| A Contacts identifier is a durable person key | Unified contacts are temporary views; a unified fetch may return a different identifier, and identifiers are device-local | Enumerate raw source cards, preserve container context, record unified views as locators, and maintain an explicit alias map |
| Contacts notes can be included when available | `CNContactNoteKey` requires a restricted entitlement on macOS 13+ and public distribution requires Apple approval | Exclude contact notes from V1 |
| Mail is a normal V1 reader | Envelope Index, Accounts store, mailbox URLs, Gmail labels, and `.emlx` paths are private implementation details; Apple PIM still has a material account-selection issue open | Separate experimental Mail collector with exact schema allowlist and no fallback |
| We should build our own Messages reader for V1 | The schema and typedstream surface are large and changing, while `imessage-exporter` already tracks current Messages formats | Messages is user-managed file import first; do not copy or link GPL code |
| A GitHub fork is the cleanest production base | A normal fork retains a large unrelated write-capable tree and makes accidental upstream merges easier | New minimal repository with selected MIT-derived files, file-level attribution, and an upstream comparison manifest |

## Evidence basis and limits

### Authoritative Apple platform facts

The design relies on these Apple-documented facts:

- EventKit cannot request read-only Calendar or Reminders access. Reading requires full access, which also permits creating, editing, and deleting data.
- Sandboxed macOS Calendar and Address Book entitlements provide read-write access to those stores.
- `calendarItemIdentifier` can be lost after a full calendar sync.
- `eventIdentifier` most likely changes when an event moves calendars.
- Event lookup by identifier returns the first occurrence, so a recurring series cannot be modeled by identifier alone.
- A unified contact is a temporary in-memory view of linked raw contacts. A unified fetch can return a different identifier from the identifier supplied, and contact identifiers are only unique on the current device.
- Contacts notes require `com.apple.developer.contacts.notes` on macOS 13 and later.
- App Sandbox limits file and network authority, and security-scoped bookmarks can preserve access to a user-selected export directory for the same signing identity.
- `LAPolicy.deviceOwnerAuthentication` can require Touch ID, Apple Watch, or the macOS account password and returns only an authentication result to the app.
- Apple supports launch constraints that restrict which signed parent can launch a helper. Those constraints are relevant to a future unattended helper, but do not make one necessary for V1.
- Apple advises against using `codesign --deep` when signing complex products.

### Inspected upstream evidence

The review inspected the following upstream revisions as evidence, not as trusted dependencies:

| Project | Revision inspected | What it establishes |
|---|---|---|
| `omarshahine/apple-pim` | `18b8f91a48e537567151553bcb720eb2ee84d770` | Native Contacts/EventKit readers, read-only Mail SQLite path, `.emlx` parsing, TCC helper design, and the breadth of the write-capable surface being removed |
| `54yyyu/pyapple-mcp` | `9844fa276474434be92b0ac16be6b43a7bd135f0` | Chat-scoped Messages reads, explicit unavailable/partial outcomes, recurrence handling, coverage semantics, and evidence that correct handlers can still be neutralized by front-end seams |
| `krmj22/macos-mcp` | `5b1561b00894b2f48aed7a46d6e105ae9556e23d` | Independent support for SQLite-based Mail/Messages reads, Gmail label handling, and private-schema tradeoffs |
| `l22-io/orchard-mcp` | `0de0967a1d298286f0101aec230ea86aaada8404` | Bounded operations, native Contacts/EventKit patterns, output budgets, and visible app-oriented packaging |
| `ReagentX/imessage-exporter` | `d372aa97e52d5987d0c8bb1dd4a1a37024b24d00` | Broad current Messages-format coverage and a maintained read-only export path; GPL-3.0 boundary |

### Evidence limitations

- No collector has been built or run for this project yet.
- Upstream performance measurements and live-store observations are source-reported unless independently reproduced during qualification.
- Apple does not document the Mail Envelope Index, Accounts database schema, `.emlx` location rules, or Messages `chat.db` schema as public application APIs.
- We have not yet proved whether the Mail collector can retain App Sandbox and still read the required local Mail files.
- We have not yet qualified an `imessage-exporter` release, its Full Disk Access attribution, or an output parser.
- We have not yet implemented or enrolled collector signing keys.
- This document is a design decision, not evidence that read-only behavior, compatibility, snapshot authenticity, or data completeness has been achieved.

## Product boundary

`cold-start-apple` remains a point-in-time adapter to the existing GBrain cold-start workflow. It does not become a general Apple automation product.

The existing product behavior remains authoritative:

- explicit consent before each source phase;
- all approved contacts;
- the last 90 days of approved calendars;
- smart sampling of recent Mail rather than bulk body ingestion;
- user-selected Messages participants and date range;
- existing significance, filtering, enrichment, review, and provenance rules;
- deterministic local source repositories and normal GBrain Markdown as durable knowledge;
- no deletion propagation in snapshot V1;
- no live sync, daemon, watcher, scheduler, or background service.

## Threat model

### In scope

1. **Same-user agent or application without Apple grants.** A prompt-injected agent, editor plugin, shell process, or other local application may try to use an already authorized collector as a deputy.
2. **UI automation.** An agent may be able to click ordinary buttons or type into collector UI through Accessibility or computer-control features.
3. **Snapshot tampering.** A process with access to the shared snapshot directory may alter records, manifests, or unkeyed hashes before GBrain imports them.
4. **Prompt injection in imported content.** Mail, Messages, contact fields, calendar notes, filenames, and document text are untrusted data.
5. **Accidental reintroduction of writes.** A future developer may import an upstream file, expose a new verb, or link mutation code without recognizing the boundary.
6. **Private-schema drift.** A macOS update, account type, or store rebuild may alter private Mail or Messages structures and produce a plausible but wrong answer.
7. **Partial local synchronization.** The Mac may not hold all server or device history.
8. **Identity drift and ambiguity.** Apple locators may change after unification, sync, move, or local store rebuild.
9. **Supply-chain drift.** An upstream branch, package release, prebuilt binary, or dependency may change after review.
10. **Privacy leakage.** Raw bodies, addresses, phone numbers, subjects, identifiers, command arguments, or participant filters may escape through logs, synced folders, Git, crash reports, shell history, process listings, or overlong retention.

### Out of scope

- root or administrator compromise;
- a compromised macOS kernel, Secure Enclave, Apple framework, or LocalAuthentication service;
- an unlocked physical attacker with full control of the user's account and password;
- a fully unsandboxed malicious process that can already read arbitrary files and replace the signed validator or its enrolled trust state;
- proving that the Mac's local Apple stores are complete replicas of iCloud or every Apple device.

TCC protects the source stores, but data exported to a normal user-readable folder no longer has the source store's TCC protection. V1 mitigates that residual risk with minimum scope, local-only storage, restrictive permissions, no synced folder, signed manifests, and short retention. It does not claim confidentiality from arbitrary same-user malware after export.

Snapshot signatures protect against tampering only while the attacker cannot replace the validator or its enrolled collector keys. They do not protect a deliberately compromised GBrain installation.

## Security and correctness invariants

The implementation is acceptable only if all of these properties are falsifiably true:

1. No production collector exports Apple data without a visible scope screen, a frozen effective request, and a successful fresh `LAPolicy.deviceOwnerAuthentication` result bound to that request.
2. Authentication reuse is disabled for export approval. A previous unlock or prior collector run cannot authorize a new export silently.
3. No production collector exposes a general CLI, raw SQL, generic script execution, arbitrary subprocess execution, arbitrary caller-controlled output path, URL-triggered export, or unattended IPC endpoint.
4. Contacts, Calendar, and Mail permissions belong to separate signed application targets.
5. The Contacts target contains no `CNMutableContact`, `CNSaveRequest`, contact group save, or Contacts Apple Event path.
6. The Calendar target contains no EventKit save, remove, commit, calendar mutation, attendee mutation, or Calendar Apple Event path.
7. The Mail target contains no Mail Automation/JXA fallback, SMTP, IMAP mutation, flag update, move, delete, reply, draft, attachment copy, or secrets code.
8. A failed, denied, unknown, ambiguous, truncated, unsupported, unauthenticated, or cancelled read never serializes as a successful empty result.
9. Unknown private schemas fail closed before returning records.
10. A source locator is never treated as a permanent identity without reconciliation evidence.
11. Imported content is never executed, interpolated into scripts, used as SQL syntax, or interpreted as collector configuration.
12. The collector writes only to its application container and the one user-selected snapshot root.
13. Production Contacts and Calendar targets have no network client or server entitlement and no application-level network feature.
14. GBrain receives no Contacts, Calendar, Mail Automation, or Full Disk Access grant.
15. Every finalized snapshot is signed by the producing collector over the canonical request digest, manifest, and file hashes.
16. GBrain verifies the enrolled collector key, signature, schema, hashes, request digest, and code-identity policy before parsing records.
17. GBrain ignores incomplete or unsigned runs.
18. Any LLM-based enrichment runs without tools, network, shell, collector authority, or direct GBrain write authority; it returns a schema-validated draft for deterministic review.
19. Real personal data is admitted separately by domain only after that domain's synthetic qualification gate passes.

## Options considered

### Option 1: One reusable headless Apple reader

This is the prior design: one signed helper app owns Contacts, Calendar, Mail, and Messages access and accepts command-line requests from GBrain.

**Why it is attractive:** one installation, one permission identity, direct automation, and a small GBrain integration surface.

**Why it is rejected:** the helper becomes a standing local data-exfiltration capability. The current Apple PIM helper demonstrates the risky shape directly: it accepts a CLI name, arbitrary forwarded arguments, and caller-selected output/error paths. Removing mutation verbs would reduce harm, but any same-user process could still use its persistent TCC and Full Disk Access to read protected data. The single process also couples supported framework access to fragile private database access and maximizes blast radius.

### Option 2: Separate user-present collectors with signed snapshots

Contacts, Calendar, and Mail use separate application targets. Each collector is visible, one-shot, scope-bounded, requires device-owner authentication, and signs its completed snapshot. Messages is a user-managed external file export step.

**Security effect:** sharply reduces ambient authority, resists ordinary UI automation, detects snapshot tampering, and prevents silent use by an agent. A Mail compromise does not inherit Contacts or Calendar access. Supported framework readers can ship without private-schema modules.

**Costs:** more targets, more first-use permission prompts, per-run authentication, key enrollment and rotation, a slightly less automated cold-start experience, and additional release/qualification work.

**Decision:** selected.

### Option 3: File exports only

The user manually exports Contacts, Calendar, Mail, and Messages using native or third-party tools, then GBrain ingests files.

**Security effect:** smallest custom privileged surface.

**Costs:** Apple does not offer equally complete, repeatable native exports for every domain, and the manual workflow is harder to resume, scope, authenticate, and reconcile.

**When it becomes preferable:** if the user does not accept persistent app permissions, LocalAuthentication on every run, collector-key enrollment, or if Mail's private-schema collector cannot pass qualification.

## Revised release boundary

The work is split into independently shippable and independently approved modules.

### Core release

1. **Contacts Collector** using Contacts.framework.
2. **Calendar Collector** using EventKit.
3. **Signed Snapshot Validator and GBrain Adapter** with no Apple grants.

### Qualified add-ons

4. **Mail Collector**, only after a separate private-schema feasibility and qualification gate.
5. **Messages File Adapter**, importing a user-supplied export from a separately managed pinned `imessage-exporter` installation.

Mail or Messages failure does not block the supported-framework core release.

## High-level architecture

```text
                         no Apple TCC / no FDA
GBrain cold-start  ─────────────────────────────────────┐
                                                       │
                     creates bounded request files      │
                     and reads completed snapshots      │
                                                       ▼
                                      Signed Snapshot Validator / Importer
                                      enrolled collector public keys
                                                       ▲
                                                       │ signed, hash-verified run folder
             ┌─────────────────────────────────────────┼────────────────────────┐
             │                                         │                        │
             │ scope UI + LocalAuth                    │ scope UI + LocalAuth    │ user-managed export
             ▼                                         ▼                        ▼
ContactsCollector.app                      CalendarCollector.app       imessage-exporter output
App Sandbox                                App Sandbox                  external GPL boundary
Contacts entitlement                       Calendar entitlement         no GBrain-owned FDA path
no network entitlement                     no network entitlement       pinned file format
             │                                         │                        │
             ▼                                         ▼                        ▼
      Contacts.framework                           EventKit                TXT snapshot

                                      separately qualified
                                               │
                                               ▼
                                      MailCollector.app
                                      isolated FDA identity
                                      scope UI + LocalAuth
                                      private schema allowlist
                                      no Mail Automation
```

The production design does not include a shared privileged daemon, LaunchAgent, background-only helper, HTTP server, MCP server, or long-running process.

## Repository strategy

Create a new minimal repository, tentatively:

```text
jordanschwartz-js/cold-start-apple-collectors
```

It contains only:

- the Contacts app target;
- the Calendar app target;
- the optional Mail app target behind its own build/release gate;
- the signed snapshot validator;
- shared request, manifest, signature, and record schemas that contain no Apple mutation or private-store code;
- unit, UI, integration, and qualification fixtures;
- `UPSTREAM.md`, `NOTICE`, and license files.

Do **not** make the production repository a normal feature-compatible GitHub fork of Apple PIM. Instead:

- record Apple PIM as an `upstream` comparison remote;
- import only selected reviewed files or functions;
- retain copyright notices and the MIT license in copied or substantially adapted files;
- document source revision, source path, local changes, and reason for inclusion in `UPSTREAM.md`;
- optionally maintain a separate private audit fork solely for upstream comparison.

An upstream update is reviewed by subsystem. No generic merge from Apple PIM main is allowed.

## Collector interaction model

### Request descriptor

GBrain may create a bounded request document and open it with the appropriate collector. The document is data, not authority.

Allowed request fields are limited to:

```json
{
  "schemaVersion": 1,
  "runId": "uuid",
  "domain": "contacts|calendar|mail",
  "requestedAt": "ISO-8601",
  "window": {
    "start": "ISO-8601 or null",
    "end": "ISO-8601 or null"
  },
  "suggestedScopeIds": ["opaque-local-id"],
  "limits": {
    "maxRecords": 100000
  }
}
```

The request format has no executable, command, SQL, script, URL, output path, environment variable, parser template, shell fragment, arbitrary predicate, or AppleScript field.

### Mandatory scope review and user presence

The collector must:

1. open visibly;
2. validate the request schema and reject unknown fields;
3. display the exact domain, effective date window, effective selected containers/calendars/accounts, estimated record count where available, and output root;
4. allow the user to narrow or cancel the scope;
5. request the relevant macOS privacy permission only in visible UI;
6. freeze the effective request in memory and compute its canonical digest;
7. create a fresh `LAContext`, set `touchIDAuthenticationAllowableReuseDuration` to `0`, and call `evaluatePolicy(.deviceOwnerAuthentication, localizedReason: ...)` with a reason that names the export scope;
8. bind the successful authentication result to that one in-memory request and run ID;
9. invalidate the authorization on cancellation, material request change, app background timeout, collector restart, or export failure;
10. require a new authentication for a retry or another domain;
11. write the effective scope, request digest, and authentication outcome class, but no biometric data, into the private manifest.

Opening a request never starts an export automatically. There is no production preference, environment variable, accessibility label, hidden shortcut, test hook, or command-line flag that disables user-presence authentication.

The collector never receives fingerprint, password, or Apple Watch data. LocalAuthentication returns only success or failure.

### Output root

Each sandboxed collector obtains the snapshot root from an `NSOpenPanel` or `NSSavePanel` and persists an app-scoped security-scoped bookmark. The collector generates all descendant paths itself.

The selected root must:

- be local;
- not be inside Git;
- not be inside iCloud Drive, Dropbox, OneDrive, Google Drive, or another detected sync root;
- have owner-only directory permissions;
- be explicitly reselected if the bookmark becomes stale or the signing identity changes.

The proposed local path is:

```text
~/.gbrain/apple-cold-start-inbox
```

The user selects it through the app on first use. GBrain may create it beforehand with mode `0700`, but it cannot grant the collector access to it without the user's file-panel action.

## Collector trust enrollment and snapshot signatures

### Why hashes are insufficient

`hashes.sha256` detects accidental corruption only. A process that can modify the snapshot directory can replace both a file and its unkeyed hash.

### Collector key

Each collector creates its own P-256 signing key on first approved setup:

- the private key is stored in the collector's app-private Keychain context and is never exported to GBrain;
- use a non-exportable Secure Enclave-backed key when supported and qualified;
- the public key and its fingerprint are displayed by the collector;
- enrollment requires device-owner authentication;
- the signed validator records the collector public key, bundle identifier, Team ID, and designated requirement in its local trust store;
- enrolling, replacing, or removing a key is a visible security action requiring device-owner authentication;
- reinstall/key loss creates a new key and requires explicit re-enrollment; it never silently replaces trust.

The implementation plan must choose the exact Security/CryptoKit representation and canonical encoding. The acceptance property is fixed: ordinary GBrain and agent processes cannot obtain the private signing key.

### Signed material

The collector signs a canonical digest covering:

- request digest;
- effective scope digest;
- run ID and domain;
- collector version and code identity;
- manifest schema and domain schema versions;
- every output filename, byte length, and SHA-256;
- status, coverage, counts, warnings, and error summary;
- start and completion timestamps.

The public key is not trusted merely because it appears inside the snapshot. The validator accepts only a separately enrolled key matching the collector identity policy.

### Validator behavior

Before parsing any record, the validator:

1. verifies its own expected build/installation policy;
2. loads the enrolled collector identity and public key;
3. validates the collector signature;
4. validates the request digest expected by GBrain;
5. validates file hashes and byte lengths;
6. rejects unknown schemas, duplicate filenames, path traversal, symlinks, hard links, sparse-file surprises, and files outside the run directory;
7. rejects completed snapshots that contain undeclared files;
8. records a validation receipt before allowing parsing.

A signature protects integrity and producer authenticity under the stated trust assumptions. It does not encrypt the snapshot.

## Snapshot protocol

Each domain writes an independent immutable run directory:

```text
<snapshot-root>/<run-id>/<domain>/
├── private-manifest.json
├── public-receipt.json
├── records.ndjson
├── errors.ndjson
├── hashes.sha256
├── snapshot.sig
└── COMPLETE
```

Rules:

- use `umask 077` semantics;
- directories are mode `0700`; files are mode `0600`;
- do not follow symlinks when creating or validating the run;
- write to temporary names and atomically rename finalized files;
- finalize all hashes and the signed canonical manifest before writing `COMPLETE`;
- write `COMPLETE` last;
- never append to a completed snapshot;
- GBrain ignores any directory without a valid `COMPLETE` marker, valid signature, expected request digest, and matching hashes;
- records use a domain schema version independent of the top-level manifest version;
- private manifests may contain local opaque identifiers;
- public receipts contain counts, code identity, signature-key fingerprint, hashes, windows, status, and hashed scope identifiers, but no names, addresses, phone numbers, subjects, bodies, or calendar titles.

### Common outcome model

```json
{
  "schemaVersion": 2,
  "domainSchemaVersion": 1,
  "collector": "contacts",
  "status": "complete|partial|unavailable|error|cancelled",
  "coverage": {},
  "returned": 0,
  "totalObserved": 0,
  "truncated": false,
  "warnings": [],
  "errors": []
}
```

`complete` means the collector exhausted the approved scope under a known schema and no result limit was hit. It does not mean the local Mac contains all iCloud or device history.

## Contacts Collector

### Permission boundary

Bundle identifier:

```text
com.jordanschwartz.gbrain.coldstart.contacts
```

The target uses:

- App Sandbox;
- Contacts entitlement;
- user-selected read-write file entitlement for the snapshot root;
- LocalAuthentication for each export;
- app-private snapshot-signing key;
- Hardened Runtime;
- no incoming or outgoing network entitlement;
- no Apple Events entitlement.

Apple grants Contacts read-write capability. The project's read-only claim therefore comes from the production code and target structure, not from a nonexistent read-only Contacts permission.

### Data acquisition

Use `CNContactStore` and immutable `CNContact` objects.

Enumerate approved containers explicitly:

1. list containers for user selection;
2. for each approved container, use a container predicate;
3. set `CNContactFetchRequest.unifyResults = false` to enumerate raw source cards;
4. preserve each raw contact identifier with its container identifier;
5. optionally fetch the unified view for each raw identifier for user-facing merged fields;
6. group linked cards within the run without discarding the raw source-card set.

### V1 fields

Preserve where available:

- raw contact identifier and container identifier;
- unified contact locator returned for the raw identifier;
- formatted name and name components;
- nickname;
- organization, department, and title;
- labeled emails and phones;
- labeled postal addresses;
- URLs;
- birthday and other labeled dates;
- relations and social/instant-message handles where available;
- person/organization type;
- image-present boolean.

V1 excludes:

- contact note content;
- contact image bytes;
- mutable contact objects;
- contact groups as a write target.

### Identity and reconciliation

A Contacts identifier is a device-local locator, not a universal permanent person identity.

For each logical record, preserve:

```text
identityMapVersion
sorted raw locators: containerIdentifier + rawContactIdentifier
unified locator observed in this run
strong normalized fingerprint: verified emails + normalized phones + name/org context
content hash
```

Rerun matching order:

1. exact raw locator set;
2. exact overlap of a raw locator with one prior record;
3. one unique strong fingerprint match;
4. otherwise create an ambiguity record for human review.

Never auto-merge by display name alone. Never silently replace an old locator with a new one without recording an alias transition.

### Contacts acceptance gate

Synthetic qualification must cover:

- ordinary contact;
- organization-only card;
- multiple emails and phones;
- birthday and labeled date;
- linked cards from two containers;
- duplicate display names;
- denied permission;
- LocalAuthentication success, cancellation, failure, and stale/reused context attempts;
- request change after authentication;
- snapshot tampering and wrong-key signature;
- a record with a note while the collector lacks the notes entitlement;
- identifier drift simulated in the reconciliation layer;
- interrupted export and rerun.

Pass only if no write API is linked or called, raw and unified identities remain distinguishable, counts reconcile, ambiguity fails closed, signatures validate, and an identical rerun produces byte-identical normalized records apart from approved receipt timestamps and signatures.

## Calendar Collector

### Permission boundary

Bundle identifier:

```text
com.jordanschwartz.gbrain.coldstart.calendar
```

The target uses:

- App Sandbox;
- Calendar entitlement;
- `NSCalendarsFullAccessUsageDescription` with an honest explanation that full access is required by Apple to read events;
- user-selected read-write file entitlement for the snapshot root;
- LocalAuthentication for each export;
- app-private snapshot-signing key;
- Hardened Runtime;
- no incoming or outgoing network entitlement;
- no Apple Events entitlement.

The UI must explicitly tell the user that macOS grants full Calendar access even though this collector implements only reads.

### Data acquisition

Use EventKit only. Do not use Calendar AppleScript, private attendee setters, or EventKit mutation calls.

The cold-start request is the last 90 days, but reads are internally divided into deterministic bounded segments, such as 31-day segments. Events spanning segment boundaries may appear more than once and must be deduplicated by the full observed locator tuple, not by title.

### V1 fields

Preserve:

- `calendarIdentifier` and calendar source metadata;
- `calendarItemIdentifier`;
- `calendarItemExternalIdentifier` when available;
- `eventIdentifier`;
- `occurrenceDate` when available;
- `isDetached`;
- start and end timestamps;
- event time zone;
- all-day local date components and local calendar/time-zone context;
- title, location, notes, URL;
- recurrence rule details;
- organizer and attendees where available;
- attendee status/role/type where available;
- event status and availability.

All-day events must preserve local date semantics. Converting an all-day event solely to UTC timestamps must not move it to an adjacent date in GBrain.

### Identity and reconciliation

No single EventKit identifier is durable enough to be the sole GBrain identity.

The exact observed locator includes:

```text
calendar source/account context
calendarIdentifier
calendarItemIdentifier
calendarItemExternalIdentifier when available
eventIdentifier
occurrenceDate for recurring items, otherwise start
isDetached
```

The recurrence anchor is `occurrenceDate` when EventKit provides it. A detached occurrence retains both its original occurrence date and modified start/end.

Rerun matching order:

1. exact observed locator;
2. unique external identifier plus occurrence anchor within the same source context;
3. unique strong fingerprint containing source context, recurrence anchor, all-day/date semantics, start/end or duration, normalized title, and organizer where available;
4. otherwise ambiguity review.

A full sync, calendar move, detached occurrence, or changed event must produce an explicit identity transition rather than a silent overwrite.

### Calendar acceptance gate

Synthetic qualification must cover:

- timed event;
- all-day event across a daylight-saving boundary;
- recurring series with at least three occurrences;
- detached/edited occurrence;
- event moved between calendars;
- attendee-linked event;
- event with notes, location, URL, and time zone;
- overlapping segment boundaries;
- denied and limited authorization states;
- LocalAuthentication success, cancellation, failure, and stale/reused context attempts;
- request change after authentication;
- snapshot tampering and wrong-key signature;
- simulated full-sync identifier loss;
- interrupted export and rerun.

Pass only if occurrences remain distinct, all-day dates remain correct, identifier changes reconcile deterministically or stop for review, the 90-day window reconciles, signatures validate, and no EventKit mutation symbol or call is present.

## Mail Collector: separate experimental module

Mail is not part of the first supported-framework release.

### Why it is separate

Mail requires Full Disk Access and depends on undocumented local structures:

- `~/Library/Mail/V*/MailData/Envelope Index`;
- mailbox URL conventions;
- Gmail's `labels` join table;
- Accounts database relationships;
- `.emlx` path resolution and payload format.

The Apple PIM account-resolution issue demonstrates the failure mode we must avoid: ambiguous local account identities can be swallowed by an `auto` fallback, and a duplicate Message-ID lookup can return the wrong local copy.

### Permission boundary

Proposed bundle identifier:

```text
com.jordanschwartz.gbrain.coldstart.mail
```

The Mail collector has its own visible application identity, LocalAuthentication gate, signing key, and no Contacts or Calendar entitlement.

The first Mail work item is a feasibility spike that answers whether the required reads can be qualified while App Sandbox remains enabled. The decision rule is fixed:

- if sandboxed access works with a narrowly user-selected Mail source and Full Disk Access, keep App Sandbox;
- if it does not, an unsandboxed exception requires a separate human security approval, Hardened Runtime, no network functionality, fixed source paths, user-presence authentication, signed snapshots, and stronger runtime tracing;
- if neither path can be qualified, Mail remains file-export-only.

The implementation must not silently disable App Sandbox to make the test pass.

### Schema gate

Before returning any message record, the collector computes and checks a compatibility fingerprint containing at least:

- macOS version and build;
- discovered Mail `V*` store version;
- normalized `sqlite_master` schema hash;
- required table and column set;
- `PRAGMA user_version` and other relevant pragmas;
- Accounts-store schema fingerprint if that store is consulted;
- `.emlx` location strategy version.

Only explicitly reviewed fingerprints are accepted. An unknown fingerprint returns `unavailable` with a private diagnostic and no records.

### Engine policy

- SQLite is opened with `SQLITE_OPEN_READONLY`.
- `PRAGMA query_only = 1` is set and verified.
- Metadata is read inside one read transaction.
- There is no `auto` engine.
- There is no JXA or Mail Automation fallback.
- Missing local `.emlx` data produces a metadata-only partial record.
- Display names and email addresses are never durable account identities.
- Stable account selection uses exact local account UUIDs derived from mailbox/store context.
- If the Accounts store cannot be mapped safely, human-readable names are omitted rather than guessed.

### Two-stage Mail flow

1. **Inventory run:** approved accounts/mailboxes, bounded dates, headers and metadata only.
2. **GBrain candidate selection:** existing cold-start rules identify sent, flagged, active, and person-linked candidates.
3. **User review and user presence:** the Mail collector displays the exact candidate count and scope and requires a fresh LocalAuthentication result.
4. **Body run:** fetch only approved bodies and headers from local `.emlx` files.

The collector does not decide what becomes durable knowledge.

### Mail identity and races

The exact snapshot locator may use the local store fingerprint plus Envelope Index row ID. That locator is not stable across an index rebuild.

Cross-run reconciliation uses only a unique combination of:

- stable local account UUID;
- physical/logical mailbox context;
- RFC Message-ID;
- sent/received date;
- sender/recipient envelope;
- local body or header hash when available.

Duplicate Message-IDs or several equally plausible local copies fail closed.

For every `.emlx` read, capture file identity, size, modification time, and hash before accepting the parse. If the file changes during the read, mark the record partial and retry only under a fresh user-authenticated run.

### Mail acceptance gate

Qualification uses a dedicated synthetic account or bounded synthetic mailbox and covers:

- direct received and sent messages;
- flagged metadata;
- multiple recipients;
- duplicate Message-ID copies;
- Gmail label membership fixture;
- local body present;
- metadata present but body unavailable;
- index rebuild simulation;
- unknown schema fingerprint;
- concurrent `.emlx` change;
- denied Full Disk Access;
- LocalAuthentication and signature failure paths;
- proof that no Mail Automation prompt occurs.

Mail cannot admit personal data until this separate gate passes on the exact macOS build, schema fingerprint, and collector build being used.

## Messages File Adapter

### V1 decision

Do not build a native Messages database parser in the first release, and do not make GBrain responsible for launching a Full Disk Access-capable Messages executable.

Messages starts as **user-managed file import**. A separately installed, immutable `imessage-exporter` release is the preferred source because it already handles a much broader and more current range of iMessage, SMS, MMS, RCS, group, reply, reaction, edited-message, attachment, and typedstream cases than the reviewed MCP implementations.

### Licensing boundary

`imessage-exporter` is GPL-3.0.

V1 may ingest output produced by a separately managed executable, but the project must not copy, link, vendor, or bundle its implementation into the MIT collector repository without a deliberate license review and acceptance of the resulting obligations. This document does not make a legal conclusion about every distribution arrangement.

### Full Disk Access and argument privacy

Gate X must establish the exact TCC responsible-process identity for the selected launch path. The project does not instruct the user to grant broad Full Disk Access to Terminal as an unreviewed default.

The current exporter interface places participant filters and paths in process arguments. Those values may appear briefly in process listings and may enter shell history. Before real-data admission, Gate X must choose and document one of these outcomes:

1. accept the short-lived argument exposure as a named residual risk and suppress shell history with a qualified workflow;
2. use a reviewed dedicated user-visible launch wrapper whose licensing and TCC behavior are accepted;
3. contribute or adopt an upstream filter-file/stdin interface;
4. keep Messages manual and out of the automated cold-start path.

No option is silently assumed safe.

### Qualified command shape

When the user elects the direct exporter path, the bounded command shape is:

```bash
imessage-exporter \
  --format txt \
  --copy-method disabled \
  --start-date <YYYY-MM-DD> \
  --end-date <YYYY-MM-DD> \
  --conversation-filter <approved participants> \
  --export-path <private run directory> \
  --no-progress
```

The exact release, executable path, SHA-256, version output, launch/TCC identity, command arguments or their private digest, scope hash, and output hashes are recorded.

### Output parser

The export is the canonical raw evidence input for V1. A GBrain parser is qualified against the exact pinned release and checked-in synthetic fixtures.

The parser must:

- preserve the raw transcript unchanged;
- report files and records it cannot parse;
- never fabricate missing participant, timestamp, reaction, or message text fields;
- preserve group-conversation boundaries;
- expose omitted-attachment and local-coverage facts from the export receipt;
- fail closed if the exporter format changes.

If the text format cannot support trustworthy structured normalization, GBrain imports the reviewed raw transcript as a conversation artifact rather than pretending it has message-level structure.

## iCloud Drive and local archives

No custom iCloud API or broad crawler is added to the Apple collectors.

The existing GBrain archive workflow operates only on explicit local paths selected by the user. iCloud Drive content must be fully local before ingestion, and the normal archive manifest/review gate applies.

The Apple collector does not recursively enumerate iCloud Drive, request iCloud credentials, or claim cloud completeness.

## Build, signing, TCC, and collector keys

### Xcode path

Contacts and Calendar collectors are normal macOS application targets built in Xcode with:

- fixed bundle identifiers;
- Automatic Signing;
- Apple Development signing for local owner qualification;
- Hardened Runtime;
- target-specific entitlements;
- embedded provisioning metadata where Xcode requires it;
- release configuration with debug/get-task-allow disabled.

Developer ID signing and notarization are considered only if the app is distributed outside the owner's development environment.

Do not use a shell script as `CFBundleExecutable`. Do not use `codesign --deep` to sign the product. Sign nested code in the correct inside-out order or let Xcode own the signing process.

### Code identity receipt

Every collector run records:

- bundle identifier;
- semantic version and build number;
- source commit;
- Team ID;
- designated requirement;
- CDHash/code-directory identity;
- entitlements actually present in the signed app;
- executable SHA-256;
- collector signing-key public fingerprint;
- provisioning profile identity where present;
- macOS version, build, and architecture.

Changing a bundle identifier, signing lineage, collector key, or enrolled designated requirement after qualification is a breaking trust migration and requires visible re-enrollment and requalification.

### No ambient headless mode

Production collectors have no command-line export mode. Test-only seams are compiled only into test builds and cannot be activated by an environment variable in a production binary.

A future unattended mode would require a separate design with authenticated IPC, Apple launch constraints or equivalent caller code-signing validation, replay protection, scope capabilities, audit, revocation, and a decision about whether user-presence authentication remains mandatory. It is not authorized by this document.

## No-network boundary

Contacts and Calendar collectors have no network client/server entitlements and no application-level network feature. They read local framework state; Apple system services may independently synchronize that state outside the collector's process, so receipts claim only the local state observed at collection time.

The Mail collector, if approved unsandboxed, must still contain no network feature, updater, telemetry, SMTP, IMAP client, HTTP client, or remote error reporting. Qualification includes runtime network observation rather than relying only on source inspection.

No collector automatically checks GitHub, downloads a binary, updates itself, or resolves a floating package version.

## GBrain integration and prompt-injection isolation

The GBrain side has no Apple grants and performs this deterministic sequence:

1. create a bounded request descriptor;
2. open the appropriate visible collector;
3. tell the user what permission, scope, and LocalAuthentication action will be requested;
4. wait for a completed snapshot rather than polling protected Apple stores;
5. verify collector enrollment, signature, request digest, code identity policy, `COMPLETE`, schemas, hashes, paths, and coverage;
6. parse records with deterministic parsers that do not execute content;
7. run existing filtering, deduplication, significance, entity linking, provenance, and sample review;
8. write only approved normalized Markdown to stable local GBrain sources;
9. record an import receipt and schedule raw-snapshot cleanup.

Imported content never enters the collector request or validator control plane.

When semantic extraction needs an LLM:

- each bounded record or thread is placed in an explicitly untrusted data field;
- the worker has no tools, shell, filesystem, network, collector access, or direct GBrain write access;
- the worker receives no secrets;
- output must validate against a narrow schema;
- the deterministic parent applies filtering and policy;
- proposed writes remain drafts until the normal sample/human review gate passes;
- source text cannot change phase order, permissions, scope, commands, paths, or acceptance criteria.

The collector never calls GBrain database operations itself.

## Error semantics

Every domain follows these rules:

1. **Unavailable is not empty.** Permission denial, missing local synchronization, schema mismatch, inaccessible store, invalid signature, untrusted key, or parser incompatibility produces `unavailable` or `error`.
2. **Partial is explicit.** Missing body files, unreadable content, result limits, changed source files, unsupported records, or incomplete segments survive into the receipt.
3. **Ambiguity stops automatic reconciliation.** The system never selects the first matching account, contact, calendar event, message copy, or chat.
4. **No semantic fallback.** A failed Mail SQLite read never becomes JXA. A failed structured Messages parse becomes a raw transcript, not invented structure.
5. **Limits are visible.** Returned count, observed count, segment/window, and continuation state are explicit.
6. **Cancellation is normal.** User or LocalAuthentication cancellation writes no completed snapshot and is not treated as a collector error.
7. **Trust changes are explicit.** Unknown or rotated collector keys never auto-enroll.

## Privacy and data lifecycle

- The snapshot root is local and excluded from sync services and Git.
- General logs contain no names, phone numbers, addresses, subjects, titles, notes, bodies, participant handles, raw local identifiers, request payloads, or authentication details.
- Private diagnostics remain in the run directory and inherit owner-only permissions.
- Crash reporting and telemetry are disabled.
- Clipboard use is prohibited.
- Raw attachment bytes are not copied in V1.
- `doctor` may warn when FileVault is disabled but does not alter system settings.
- GBrain deletes a raw snapshot after successful reviewed import or after seven days, whichever occurs first, unless the user explicitly retains it.
- Public receipts and normalized accepted Markdown may remain; private raw records and private identity maps follow the user's local backup policy.
- Cleanup is receipt-driven and never deletes Apple source data.
- Snapshot signatures provide integrity and provenance, not confidentiality.

## Qualification strategy

### Static build checks

For every release build:

- inspect the production action registry;
- scan source and linked symbols for forbidden framework APIs and mutation verbs;
- verify target entitlements with `codesign`;
- verify App Sandbox for Contacts and Calendar;
- verify no network entitlements;
- verify no generic `osascript`, shell, raw SQL input, or arbitrary subprocess surface;
- inspect dynamic libraries and embedded tools;
- verify LocalAuthentication cannot be bypassed or reused in production;
- verify the signing private key is not exportable through collector or GBrain APIs;
- verify no unreviewed upstream file or dependency drift;
- validate every JSON/NDJSON record against checked-in schemas;
- fail CI if attribution or `UPSTREAM.md` is stale.

Forbidden API checks are defense in depth, not proof by themselves. Runtime and end-to-end tests remain mandatory.

### Runtime read-only and user-presence evidence

For each domain:

- create only fictional deterministic source records;
- capture an independent semantic before-state;
- trace collector file writes and confirm they remain inside its container and selected output root;
- observe process/network activity;
- run the complete request-to-scope-UI-to-LocalAuthentication-to-signed-snapshot path;
- test click automation without successful device-owner authentication;
- test authentication cancellation, failure, timeout, reuse attempts, app restart, and material request changes;
- capture an independent semantic after-state;
- compare source records and user-visible state;
- inspect the final signed binary, not only a debug build;
- prove denial, cancellation, interruption, malformed-request, tampered-snapshot, wrong-key, and key-rotation behavior.

Filesystem metadata changes caused by Apple daemons or cache reads are not automatically source mutations. Acceptance is based on API-enforced read-only database opens where applicable, absence of write code, process-attributed tracing, and unchanged semantic records.

### Seam tests

The qualification suite tests the entire chain:

```text
request document
→ visible effective-scope UI
→ LocalAuthentication
→ framework/private-store reader
→ snapshot writer
→ collector signature
→ validator trust and hash checks
→ deterministic parser
→ isolated semantic worker if needed
→ normalized staging output
```

Handler-only tests are insufficient. PyApple's history includes a case where correct lower-level behavior shipped inert because both front ends forced a default. The project therefore tests every production seam and derives action lists from one authoritative schema rather than duplicating hand-maintained registries.

### Supply-chain checks

- pin exact source commits and package versions;
- verify downloaded release hashes before first use;
- never use `npx -y`, floating Git branches, unpinned Cargo installs, or automatic Homebrew upgrades in qualification;
- build from reviewed source where practical;
- record compiler/Xcode/Swift versions;
- regenerate and review upstream diffs before upgrading.

## Approval gates

### Gate A: Revised architecture approval

Pass when this design is accepted. No code or new repository is created before this gate.

### Gate B: Contacts Collector qualification

Pass only after static, UI, LocalAuthentication, permission, identity, signing, validator, privacy, and synthetic rerun tests pass on the final signed build.

### Gate C: Calendar Collector qualification

Pass only after recurrence, all-day, move/sync identity, full-access disclosure, segmentation, LocalAuthentication, signing, and synthetic rerun tests pass.

### Gate D: Core GBrain integration qualification

Pass only when signed snapshots validate and produce deterministic staging Markdown without granting GBrain Apple permissions or allowing imported content to control tools.

### Gate M0: Mail feasibility

Answer, with evidence, whether sandboxed collection is possible and which exact private schemas are present. This gate produces no personal-data importer.

### Gate M1: Mail synthetic qualification

Pass only on the exact OS/schema/build combination after all Mail-specific, LocalAuthentication, signature, and read-only evidence passes.

### Gate X0: Messages launch and privacy decision

Establish the exact exporter release, Full Disk Access attribution, process-argument exposure, shell-history handling, licensing/distribution boundary, and whether Messages remains manual file import.

### Gate X1: Messages parser qualification

Pass only after pinning the exporter artifact and qualifying the output parser on synthetic fixtures. X0 does not imply X1.

### Real-data admission

Approval is domain-specific. Passing Contacts does not authorize Calendar, Mail, or Messages data. No real personal data is admitted to a domain before its own gate passes.

## Changes required in `cold-start-apple`

After the corresponding collectors are qualified, update the existing draft skill to:

1. replace direct Apple PIM CLI installation with visible collector request/export steps;
2. remove command allowlists as the primary safety boundary;
3. require LocalAuthentication immediately before each collector export;
4. require signed snapshots and enrolled collector-key validation;
5. describe Calendar full access honestly rather than calling the OS permission read-only;
6. omit Contacts notes;
7. replace durable-ID claims with versioned locator/reconciliation behavior;
8. use separate Contacts and Calendar phases/app identities;
9. keep Mail disabled until Gate M1 passes for the exact local schema;
10. remove Mail `--engine auto` and every JXA fallback;
11. use stable local account UUID selection and fail closed on ambiguity;
12. keep Messages user-managed until Gate X0 chooses an accepted launch/privacy boundary;
13. preserve raw Messages transcripts and fail closed on parser drift;
14. add request digest, code identity, schema fingerprint, collector-key fingerprint, signature, output hashes, and coverage to Phase 0 receipts;
15. isolate any LLM enrichment from tools and direct writes;
16. preserve all existing consent, sampling, review, provenance, no-deletion, and stable-source-repository rules.

Do not implement these changes on the heavily diverged historical `agent/cold-start-apple` branch. Use a fresh branch from then-current GBrain `master` after the relevant collector contract is qualified.

## Implementation decomposition

This architecture is too large for one implementation plan. After approval, produce separate plans in this order:

1. **Contacts Collector plan** — repository skeleton, Xcode target, signing, sandbox, request UI, LocalAuthentication, key enrollment, signed snapshot protocol subset, identity model, synthetic fixtures, and Gate B.
2. **Calendar Collector plan** — separate target, full-access disclosure, segmented EventKit reader, recurrence identity, all-day semantics, LocalAuthentication, signed snapshots, and Gate C.
3. **Signed Snapshot Validator and GBrain Adapter plan** — trust enrollment, canonical signatures, hashes, path safety, incomplete-run handling, deterministic parsing, staging, receipts, isolated semantic workers, and Gate D.
4. **Mail feasibility plan** — no importer yet; establish sandbox/FDA behavior and schema inventory for Gate M0.
5. **Mail Collector plan** — only after M0 approval; exact allowlist, user presence, signed snapshots, two-stage inventory/body flow, and Gate M1.
6. **Messages X0 plan** — immutable exporter selection, TCC attribution, argument privacy, history suppression, licensing boundary, and manual-versus-wrapper decision.
7. **Messages parser plan** — only after X0 approval; fixtures, raw preservation, parser drift, and Gate X1.
8. **GBrain skill integration plan** — update `cold-start-apple` only for collectors whose gates have passed.

The next implementation plan, if this revision is approved, is **Contacts Collector only**.

## Decision locks

The following decisions require a new design review to change:

- no unattended privileged collector in V1;
- no export based only on an ordinary UI click;
- device-owner authentication for every collector export, with no reuse window;
- signed snapshots and explicit collector-key enrollment;
- no single application identity with Contacts, Calendar, and Full Disk Access;
- no Contacts notes in V1;
- no Mail Automation/JXA fallback;
- no unknown private Mail schema;
- no custom native Messages parser in the first release;
- no GBrain-owned unattended Messages/FDA launch path before Gate X0;
- no bundled GPL Messages implementation without a license decision;
- no automatic merge from Apple PIM upstream;
- no real personal data before per-domain synthetic qualification.

## Evidence references

### Apple documentation

- [Accessing the event store](https://developer.apple.com/documentation/eventkit/accessing-the-event-store)
- [App Sandbox](https://developer.apple.com/documentation/security/app-sandbox)
- [Protecting user data with App Sandbox](https://developer.apple.com/documentation/security/protecting-user-data-with-app-sandbox)
- [`calendarItemIdentifier`](https://developer.apple.com/documentation/eventkit/ekcalendaritem/calendaritemidentifier)
- [`eventIdentifier`](https://developer.apple.com/documentation/EventKit/EKEvent/eventIdentifier)
- [Contacts framework](https://developer.apple.com/documentation/contacts)
- [`unifiedContact(withIdentifier:keysToFetch:)`](https://developer.apple.com/documentation/contacts/cncontactstore/unifiedcontact%28withidentifier%3Akeystofetch%3A%29)
- [`CNContactFetchRequest.unifyResults`](https://developer.apple.com/documentation/contacts/cncontactfetchrequest/unifyresults)
- [`com.apple.developer.contacts.notes`](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.contacts.notes)
- [`LAPolicy.deviceOwnerAuthentication`](https://developer.apple.com/documentation/localauthentication/lapolicy/deviceownerauthentication)
- [`LAContext.evaluatePolicy`](https://developer.apple.com/documentation/localauthentication/lacontext/evaluatepolicy%28_%3Alocalizedreason%3Areply%3A%29)
- [Constraining a tool's launch environment](https://developer.apple.com/documentation/security/constraining-a-tool%27s-launch-environment)
- [Creating distribution-signed code for macOS](https://developer.apple.com/documentation/xcode/creating-distribution-signed-code-for-the-mac/)
- [Security-scoped bookmarks](https://developer.apple.com/documentation/foundation/nsurl/bookmarkcreationoptions/withsecurityscope)

### Upstream evidence

- [Apple PIM helper dispatcher at reviewed revision](https://github.com/omarshahine/apple-pim/blob/18b8f91a48e537567151553bcb720eb2ee84d770/helper/pim-helper)
- [Apple PIM Mail account ambiguity issue #106](https://github.com/omarshahine/apple-pim/issues/106)
- [Apple PIM read-only Envelope Index implementation](https://github.com/omarshahine/apple-pim/blob/18b8f91a48e537567151553bcb720eb2ee84d770/swift/Sources/MailCLI/EnvelopeIndex.swift)
- [PyApple Messages implementation at reviewed revision](https://github.com/54yyyu/pyapple-mcp/blob/9844fa276474434be92b0ac16be6b43a7bd135f0/pyapple_mcp/utils/messages.py)
- [PyApple Calendar implementation at reviewed revision](https://github.com/54yyyu/pyapple-mcp/blob/9844fa276474434be92b0ac16be6b43a7bd135f0/pyapple_mcp/utils/calendar.py)
- [macos-mcp architecture decisions](https://github.com/krmj22/macos-mcp/blob/5b1561b00894b2f48aed7a46d6e105ae9556e23d/DECISION.md)
- [Orchard Contacts implementation](https://github.com/l22-io/orchard-mcp/blob/0de0967a1d298286f0101aec230ea86aaada8404/swift/Sources/AppleBridge/Contacts.swift)
- [`imessage-exporter` reviewed revision](https://github.com/ReagentX/imessage-exporter/tree/d372aa97e52d5987d0c8bb1dd4a1a37024b24d00)

## Final recommendation

Proceed only with the revised split architecture.

The original monolithic helper should not be implemented. The first build should be a sandboxed, visible, device-owner-authenticated **Contacts Collector** with no network capability, no mutation code, explicit raw/unified identity handling, app-private snapshot signing, and synthetic-only qualification. Calendar follows as a separate target. Mail and Messages remain independent add-ons until their own evidence gates pass.
