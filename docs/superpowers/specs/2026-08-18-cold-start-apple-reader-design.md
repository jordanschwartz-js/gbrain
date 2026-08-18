# Cold Start Apple Reader Design

**Date:** 2026-08-18  
**Status:** Approved design, implementation not started  
**Scope:** Native macOS read-only adapter for `skills/cold-start-apple/SKILL.md`

## Summary

Build a small, purpose-built macOS reader for GBrain's Apple cold-start workflow. The reader is based primarily on the MIT-licensed `omarshahine/apple-pim` native implementation, with selected correctness and coverage ideas from the MIT-licensed `54yyyu/pyapple-mcp`, `krmj22/macos-mcp`, and `l22-io/orchard-mcp` projects.

The finished reader is not a general Apple automation server. It is a deterministic snapshot adapter whose executable contains no Apple mutation operations. V1 reads only locally synchronized Contacts, Calendar, Mail, and Messages data on the Mac. GBrain keeps the existing cold-start product behavior: consent gates, source windows, smart sampling, normalization, review, provenance, and Markdown output.

The adapter should live in a separate repository, tentatively named `cold-start-apple-reader`, while GBrain pins a reviewed release or commit and invokes its JSON CLI from `cold-start-apple`.

## Goals

1. Provide deterministic, local-only reads of Apple data needed by GBrain cold start.
2. Make destructive or outbound Apple actions impossible by construction, not merely prohibited by agent instructions.
3. Preserve source completeness information so partial reads cannot masquerade as complete reads.
4. Preserve stable source identities so rerunning the same snapshot does not duplicate GBrain pages.
5. Use native macOS frameworks where supported and read-only SQLite/filesystem access where native read APIs are absent or unsuitable at scale.
6. Keep macOS permission ownership stable across host agents by using a dedicated, signed helper app identity.
7. Keep upstream lineage and licensing clear enough to track security and compatibility fixes over time.

## Non-goals

V1 does not:

- send, reply to, move, delete, flag, mark read, create, or edit Mail;
- create, update, delete, or invite attendees to Calendar events;
- create, update, or delete Contacts;
- send Messages or copy message attachments;
- create or edit Notes or Reminders;
- expose an MCP server, HTTP server, OpenClaw plugin, daemon, scheduler, watcher, or background service;
- request Apple Account passwords, app-specific passwords, cookies, OAuth tokens, or other iCloud credentials;
- perform live synchronization after the point-in-time cold-start snapshot;
- replace GBrain's existing filtering, significance, consent, enrichment, provenance, or page-writing behavior.

Notes and Reminders are explicitly deferred. They may be added later as independent read domains after the core cold-start path is qualified.

## Existing GBrain contract

`cold-start-apple` remains an adapter to the existing `cold-start` workflow, not a separate product. The source mapping remains:

| GBrain cold-start source | Apple source |
|---|---|
| Google Contacts | Contacts.framework |
| Google Calendar | EventKit |
| Gmail | locally synchronized Mail store |
| Conversation exports | locally synchronized Messages history plus existing AI exports |
| Drive/local archives | explicitly approved iCloud Drive/local paths |

The source adapter must preserve the existing scope:

- all approved contacts;
- the last 90 days of calendar history;
- smart sampling of recent mail rather than bulk mail ingestion;
- user-selected Messages scope, followed by the existing significance threshold;
- explicit consent before each phase;
- stable local source repositories and normal GBrain Markdown as the durable format.

## Recommended upstream sources

### Primary foundation: Apple PIM

Repository: `omarshahine/apple-pim`

Use as the primary implementation source for:

- Contacts.framework access and rich contact shaping;
- EventKit Calendar access and rich event shaping;
- Mail Envelope Index discovery and read-only SQLite queries;
- `.emlx` body and header reading;
- macOS TCC helper-app architecture and stable responsible-process identity;
- permission diagnostics and native JSON CLI conventions.

Do not retain Apple PIM's mutation surface, SMTP/IMAP write support, secrets store, MCP server, OpenClaw plugin, or general-purpose agent features in the finished cold-start reader.

### Correctness reference: PyApple MCP

Repository: `54yyyu/pyapple-mcp`

Use as the primary correctness reference for:

- Messages chat-scoped reads rather than participant-only joins;
- explicit SQLite `mode=ro` behavior;
- Messages attributed-body decoding strategy;
- truncation, total-count, pagination, and coverage semantics;
- distinction between an unavailable source and a valid empty result;
- Calendar recurring-occurrence identity;
- Calendar completeness checks and long-window segmentation principles.

Code copied or adapted from this MIT project must retain required attribution.

### Independent architecture reference: macos-mcp

Repository: `krmj22/macos-mcp`

Use to independently validate:

- SQLite-for-Mail and SQLite-for-Messages architecture;
- Gmail label-table handling;
- local AddressBook/identity enrichment assumptions;
- Full Disk Access failure handling;
- fail-loud behavior when a local SQLite read is unavailable.

Do not depend on its MCP or TypeScript runtime in V1.

### Independent safety reference: Orchard MCP

Repository: `l22-io/orchard-mcp`

Use to inform:

- bounded expensive operations;
- preflight/doctor behavior;
- output-size and timeout protection;
- native Contacts.framework and EventKit access patterns;
- helper-app packaging.

Do not adopt its AppleScript Mail read path for cold-start ingestion.

### Qualification oracle only: imessage-exporter

Repository: `ReagentX/imessage-exporter`

This project is GPL-3.0. It must remain a separate external executable and must not be copied into the permissively licensed cold-start reader unless the project intentionally accepts the resulting GPL obligations.

It may be used during qualification to compare selected synthetic or explicitly approved message samples because it has exceptionally broad iMessage/SMS/MMS/RCS feature coverage.

## High-level architecture

```text
GBrain
└── skills/cold-start-apple/
          │
          │ invokes JSON CLI
          ▼
ColdStartAppleReader.app
stable macOS TCC identity
          │
          └── cold-start-apple-reader
                ├── doctor
                ├── contacts
                │    └── Contacts.framework
                ├── calendar
                │    └── EventKit
                ├── mail
                │    ├── Envelope Index [read only]
                │    └── .emlx files [read only]
                └── messages
                     └── chat.db [read only]
```

The helper app exists to provide one stable macOS privacy identity. It launches the reader as its responsible process. The reader returns structured JSON to the caller. It does not expose a listening socket.

## Hard read-only boundary

The safety objective is stronger than "the agent should not call write commands." The shipped reader must not contain Apple write commands at all.

The production executable must have no code path for:

- Mail send/reply/forward/draft/update/move/delete/mark-read/flag/save-attachment/SMTP/IMAP mutation/secrets;
- Calendar create/update/delete/batch-create/private attendee writes;
- Contacts create/update/delete/save requests;
- Messages send/react/attachment send;
- Notes or Reminders writes;
- generic AppleScript/JXA execution supplied by the caller.

Read-only SQLite stores must be opened with an API-enforced read-only mode. Mail's Envelope Index should use `SQLITE_OPEN_READONLY` plus `PRAGMA query_only = 1`. Messages should use SQLite URI `mode=ro` or the equivalent native `SQLITE_OPEN_READONLY` API and must not use a normal connection mode that can create a missing database.

The reader must not execute instructions contained in Mail, Messages, Calendar notes, or Contacts notes. Imported source content is data only.

## TCC and helper-app design

Use the Apple PIM helper-app pattern as the base.

Requirements:

1. The reader runs through a small `.app` bundle with a fixed bundle identifier.
2. The final bundle identifier is selected before the first real permission qualification and is then treated as immutable for that installation lineage.
3. The bundle carries only the privacy usage descriptions required by V1.
4. Usage strings describe read access, not "read and manage" access.
5. The helper executable is a real Mach-O executable, not a shell script declared as `CFBundleExecutable`.
6. Rebuilding or re-signing an unchanged helper is avoided because TCC grants may be tied to its code identity.
7. Prefer a stable Apple Development or Developer ID identity when operationally appropriate. Ad-hoc signing is acceptable for an early local qualification only if its TCC persistence behavior is explicitly tested.
8. `doctor` must report which process/bundle currently owns each relevant privacy grant.

Expected permissions:

| Domain | Permission |
|---|---|
| Contacts | Contacts access |
| Calendar | Full Calendar access required for reads |
| Mail | Full Disk Access for SQLite and `.emlx` reads |
| Messages | Full Disk Access for `chat.db` reads |

The V1 Mail reader intentionally does not require Mail Automation permission because it has no JXA fallback.

## Common JSON envelope

Every domain returns the same top-level contract.

```json
{
  "schemaVersion": 1,
  "source": "apple-messages",
  "status": "ok",
  "coverage": {},
  "returned": 250,
  "total": 621,
  "truncated": true,
  "nextCursor": "opaque-or-null",
  "items": [],
  "warnings": []
}
```

### Status values

- `ok`: requested read completed with known coverage semantics.
- `partial`: the reader can return useful data but knows the requested scope is incomplete.
- `unavailable`: the source could not be read at all, commonly because of missing permission or missing local synchronization.
- `error`: caller input or an internal invariant prevented a trustworthy answer.

A failure must never be represented as an empty `items` array with `status: ok`.

### Coverage requirements

Each domain reports enough information for the cold-start workflow to know what was actually examined. Coverage metadata may include:

- approved container/calendar/account/chat IDs;
- requested date window;
- observed local date extent;
- number of source records considered;
- result limit and whether it was hit;
- locally unavailable bodies;
- unsupported source records;
- pagination cursor or next window when applicable.

Human-facing receipts may hash private scope identifiers rather than printing account names, addresses, phone numbers, subjects, or bodies.

## Contacts reader

### Backend

Use `CNContactStore` through Contacts.framework.

### Required output

For a full contact read, preserve where available:

- stable `CNContact.identifier`;
- container/source identifier;
- full formatted name and component names;
- nickname;
- organization, title, department;
- labeled emails and phone numbers;
- labeled postal addresses;
- URLs;
- birthdays and other labeled dates;
- contact relations and social/IM handles where available and useful;
- contact type;
- whether an image exists.

Do not import contact image bytes into the cold-start snapshot by default.

Contacts notes require restricted entitlement behavior on newer macOS versions. The reader must report note availability explicitly and must not broaden privileges or fall back to app automation merely to recover an unavailable note field.

### Identity

The source identity is the Contacts stable identifier plus its source/container context where needed to disambiguate linked cards. Display names are never durable keys.

### Completeness

List operations must report the total enumerated count. Container filters must be explicit. A failure to enumerate is `unavailable` or `error`, not an empty address book.

## Calendar reader

### Backend

Use EventKit only.

### Window

GBrain requests exactly the last 90 days for cold start. The reader accepts explicit ISO start and end timestamps.

### Required output

Preserve:

- event identifier;
- occurrence start and end;
- all-day status;
- calendar identifier and title;
- calendar source/account metadata suitable for scope selection;
- title;
- location;
- notes;
- URL;
- recurrence information;
- attendees and organizer when available;
- participation status where available.

### Recurring-event identity

Do not use `eventIdentifier` alone as the durable source key. EventKit recurring occurrences can share the same identifier.

Use a deterministic occurrence key based on at least:

```text
calendarIdentifier + eventIdentifier + occurrenceStart
```

If later qualification shows another field is required for cross-account collision resistance, extend the private identity-map version and migrate deterministically rather than silently changing existing keys.

### Completeness

The reader must not silently truncate EventKit windows. Even though cold start currently requests only 90 days, retain an internal segmented-window implementation or explicit safe maximum so a future wider caller cannot receive a silently incomplete result.

A returned record count equal to a caller limit is not proof of completeness. The envelope must indicate whether more records exist or whether the range was segmented to exhaustion.

## Mail reader

### Backend

Use Apple Mail's local Envelope Index plus local `.emlx` files. No JXA fallback in the cold-start reader.

The Envelope Index is metadata and routing state. `.emlx` files are the source for locally available full bodies and RFC-style headers.

### Engine policy

There is no `auto` mode in the cold-start reader.

- If the read-only SQLite index is readable, proceed.
- If it is not readable, Mail is `unavailable` for that run.
- If metadata is available but the selected message's `.emlx` body is not locally present, keep the metadata and mark the body unavailable/partial.
- Never launch or automate Mail.app to make the run succeed.

This prevents a failed or ambiguous local read from silently switching to a different mechanism with different identity and completeness behavior.

### Account identity

Internally scope accounts by stable local account UUIDs derived from the local Mail/Accounts stores. Display names and email addresses are selection aids only, never durable account keys.

If a human-readable account selection maps to more than one local account, fail with an explicit ambiguity result and require selection by stable ID. Never take the first match.

### Gmail labels

Support the `labels` join table so Gmail mailbox membership is correctly represented when messages physically live in `[Gmail]/All Mail`.

### Required metadata

Preserve where available:

- Envelope Index row ID as local record locator;
- RFC Message-ID;
- subject and subject prefix;
- sender address/display name;
- To and Cc recipients;
- date sent/received;
- read and flagged state as observed metadata only;
- physical and logical mailbox identity;
- stable account UUID;
- attachment names/count, without copying attachment bytes by default;
- full local body and relevant headers when `.emlx` is present.

### Message identity

RFC Message-ID alone is not sufficient because multiple local copies can exist across accounts or mailboxes. The private source identity must include stable local account context and enough local record information to select the same copy deterministically on rerun.

Any duplicate or ambiguous Message-ID lookup must fail closed unless account/mailbox context uniquely identifies a copy.

### Cold-start sampling

The reader supplies deterministic primitives. The GBrain skill retains the policy:

1. sent mail from the last 30 days;
2. flagged/important candidates;
3. threads with 3+ replies;
4. mail involving existing people;
5. noise filtering and candidate review before body fetch.

The reader must not independently decide which messages become GBrain knowledge.

## Messages reader

### Backend

Read `~/Library/Messages/chat.db` directly in read-only mode.

### Chat-scoped model

Conversation reads must join through `chat_message_join` and identify a chat first. Do not implement "conversation with X" as a raw handle filter over the global message table. That produces incorrect results for group conversations and can mix messages from unrelated chats containing the same participant.

### Required output

Preserve where available:

- stable chat GUID/row identity;
- chat display name;
- complete participant handles for the selected chat;
- message row ID/GUID;
- sender handle or explicit `isFromMe` state;
- timestamp;
- service/type where available;
- plain message text;
- attachment metadata without copying attachment bytes;
- reply/reaction/edit metadata where it can be decoded reliably in V1;
- explicit unsupported-content markers rather than fabricated text.

### Attributed bodies

Many Messages rows may not have usable text in the plain `text` column. The reader should use the PyApple approach as the reference: attempt a real macOS unarchive/typedstream-compatible decode before heuristic salvage.

If content cannot be decoded, return an explicit unreadable-content marker plus raw-type metadata. Do not treat undecodable content as an empty message.

### Pagination and truncation

Every chat read reports:

- total messages in the requested window when reasonably computable;
- number returned;
- whether the result is truncated;
- an opaque cursor or deterministic boundary for the next older page.

This is required because the newest N messages and the complete conversation must never serialize identically.

### Coverage

The reader claims only what is present in the local Messages database. It must not claim iCloud-wide history or device-complete history if the Mac has not synchronized it.

## iCloud Drive and local archives

No custom native Apple reader is required in V1.

The existing GBrain archive/file workflow should operate only on explicitly approved local filesystem paths, including approved paths beneath the user's iCloud Drive container. The Apple reader may expose a `doctor` helper that resolves whether an approved path is present locally, but it does not crawl arbitrary iCloud Drive contents.

## Notes and Reminders

Deferred from V1.

If Notes is added later, use read-only Apple Events and `plaintext`, not HTML `body`, for normal text reads. The later design must preserve explicit truncation and distinguish Notes failures from an empty store.

If Reminders is added later, use EventKit and the same immutable read-only command-surface principle as Calendar.

## CLI surface

V1 should expose a small command tree approximately like:

```text
cold-start-apple-reader doctor
cold-start-apple-reader contacts containers
cold-start-apple-reader contacts list
cold-start-apple-reader contacts get --id <stable-id>
cold-start-apple-reader calendar calendars
cold-start-apple-reader calendar events --from <iso> --to <iso>
cold-start-apple-reader mail accounts
cold-start-apple-reader mail mailboxes --account-id <stable-id>
cold-start-apple-reader mail messages ...
cold-start-apple-reader mail get --local-id <id> --account-id <stable-id>
cold-start-apple-reader messages chats ...
cold-start-apple-reader messages read --chat-id <stable-id> ...
```

No generic script execution and no hidden write verbs are shipped.

All normal output is JSON on stdout. Diagnostics and non-sensitive progress go to stderr. Source bodies, contact details, phone numbers, addresses, and subjects must not appear in general logs.

## GBrain integration flow

1. `cold-start-apple` asks for consent for the phase.
2. It invokes `doctor` and records adapter version, code signature, executable hash, schema version, and permission/coverage state.
3. The user approves source containers/calendars/accounts/chats.
4. GBrain stores a private scope map using stable IDs and hashes sensitive scope identifiers in shareable receipts.
5. The reader writes raw JSON only into the private per-run cold-start workspace.
6. GBrain normalizes raw records into deterministic Markdown staging repositories.
7. Existing GBrain deduplication, filtering, significance, enrichment, page review, and provenance rules run unchanged.
8. Only reviewed/accepted Markdown becomes a stable GBrain source.
9. Reruns reuse source IDs, stable source keys, identity-map version, and content hashes.

The reader never calls GBrain database operations itself.

## Error-handling principles

1. **Fail closed on ambiguity.** Never select the first matching account, message copy, chat, or calendar when multiple candidates remain.
2. **Unavailable is not empty.** Permission failures, schema incompatibility, missing local files, or source corruption must not produce a normal empty result.
3. **Partial is explicit.** Missing `.emlx` bodies, truncation, unsupported attributed-body content, or locally incomplete synchronization must survive into the receipt.
4. **No fallback that changes semantics.** In particular, Mail SQLite failure never falls through to JXA in V1.
5. **Bound expensive reads.** Every list/read accepts deterministic limits or windows and exposes continuation rather than hanging or silently clipping.
6. **Never mutate while diagnosing.** `doctor` only probes authorization/readability and never resets TCC, launches target apps to force prompts, or modifies Apple stores.

## Versioning and receipts

Every run records at minimum:

- reader semantic version;
- source commit/release identifier;
- JSON schema version;
- executable SHA-256;
- code-signature identity/hash;
- macOS version and architecture;
- relevant local schema/version observations such as Mail `V*` store version;
- approved scope hash;
- requested date windows;
- per-domain coverage and counts;
- warnings and unsupported-record counts.

A documented command or JSON schema change requires either a backward-compatible parser or a deliberate reader-version upgrade in the GBrain skill. GBrain must not continue after an unrecognized reader schema.

## Licensing and attribution

The reader may incorporate MIT-licensed code from Apple PIM, PyApple MCP, macos-mcp, and Orchard MCP with appropriate copyright/license notices and file-level attribution where required.

Keep an `UPSTREAM.md` or equivalent manifest containing:

- upstream repository;
- upstream commit used;
- files/ideas incorporated;
- local modifications;
- license.

Do not copy GPL-3.0 implementation code from `imessage-exporter` into a permissively licensed reader. Treat that project as a separately installed qualification tool only.

## Upstream maintenance strategy

The new reader should preserve Apple PIM as an `upstream` Git remote during development, but it is intentionally a narrowed derivative rather than a long-lived feature-compatible fork.

Upstream updates are reviewed by subsystem:

- Contacts.framework fixes;
- EventKit/macOS permission fixes;
- Mail Envelope Index schema fixes;
- `.emlx` parsing fixes;
- helper-app/TCC fixes.

General agent features, write features, SMTP, MCP, OpenClaw, and mail-channel features are not merged by default.

Maintain a small upstream-diff checklist so an Apple PIM release can be assessed without repeatedly re-auditing unrelated functionality.

## Qualification plan

No personal data is admitted during reader qualification unless a later explicit approval changes that boundary. Initial qualification should use synthetic records created manually in the native apps, then read them through the reader.

### Static acceptance checks

- production command registry contains only approved read verbs;
- no SMTP/IMAP mutation or secrets implementation is linked into the binary;
- no Contacts save request is reachable;
- no EventKit save/remove call is reachable;
- no Messages send Apple Event is reachable;
- no generic AppleScript/JXA execution endpoint exists;
- SQLite opens are demonstrably read-only;
- stdout JSON validates against the checked-in schema.

### Contacts tests

Use synthetic contacts covering:

- ordinary person;
- organization-only contact;
- multiple emails/phones;
- birthday;
- linked/source-card edge case;
- contact with a note when entitlement is unavailable.

Pass only if counts reconcile, stable IDs survive rerun, unavailable note fields are explicit, and a second identical run changes no normalized output.

### Calendar tests

Use synthetic events covering:

- timed event;
- all-day event;
- recurring series with at least three occurrences;
- attendee-linked event;
- event with notes/location/URL.

Pass only if every recurrence occurrence receives a distinct stable key, the 90-day window reconciles, and rerun is duplicate-free.

### Mail tests

Use a dedicated synthetic mail account or bounded synthetic mailbox where practical.

Cover:

- direct received message;
- sent message;
- flagged message;
- multi-recipient message;
- duplicate Message-ID/local copies;
- body present as `.emlx`;
- metadata present but body unavailable;
- Gmail-label fixture if a Gmail-style fixture can be built safely.

Pass only if the reader never falls back to Mail Automation, ambiguous copies fail closed, missing bodies are partial rather than empty, and the source store is unchanged.

### Messages tests

Use synthetic conversations covering:

- one-to-one chat;
- group chat with several participants;
- incoming and outgoing messages;
- attachment-only row;
- reaction/reply where supported;
- attributed-body-only text;
- page larger than the result limit.

Compare selected expected records with `imessage-exporter` as an external oracle where licensing and installation allow. Pass only if group messages do not bleed across chats, truncation is explicit, and unreadable records are not silently omitted.

### Read-only evidence

For each domain, capture before/after evidence showing no Apple store mutation attributable to the reader. The exact evidence mechanism may differ by store, but qualification must include timestamps/counts or equivalent receipts sufficient to detect accidental writes.

## Changes required in GBrain's current `cold-start-apple` skill

The existing draft should be updated after the reader exists and is qualified:

1. replace direct Apple PIM installation with a pinned `cold-start-apple-reader` release/commit;
2. replace command allowlists with the reader's inherently read-only command surface;
3. remove Mail `--engine auto` and JXA fallback language;
4. scope Mail by stable account ID rather than display name;
5. change Calendar durable identity from `eventIdentifier` alone to occurrence-aware identity;
6. replace `imessage-exporter` as the primary Messages ingestion mechanism with the native read-only Messages reader;
7. keep `imessage-exporter` optional as a qualification/reference tool;
8. update Phase 0 receipts to include reader schema version, executable hash, and code-signature identity;
9. preserve every existing consent, sampling, quality, normalization, source-repo, and no-deletion rule unless separately reviewed.

## Repository strategy

Do not implement this inside the heavily diverged historical `agent/cold-start-apple` branch.

Design work starts from current GBrain `master`. The native reader should then be created as a separate repository derived from Apple PIM, with its own tests and releases. GBrain integration work should happen on a fresh feature branch from then-current GBrain `master` after the reader interface is qualified.

This separation keeps:

- macOS native code and TCC qualification independent of GBrain's database/runtime changes;
- upstream Apple PIM tracking manageable;
- licensing attribution clear;
- GBrain's skill changes small and reviewable.

## Implementation boundary

Implementation starts only after this design is reviewed. The first implementation plan should decompose work into independently verifiable phases:

1. create narrowed reader repository and upstream manifest;
2. establish helper-app identity and read-only command registry;
3. port/retain Contacts reader;
4. port/retain Calendar reader plus occurrence/completeness fixes;
5. port/retain Mail SQLite + `.emlx` reader with fail-closed account identity;
6. implement Messages reader with chat-scoped and truncation semantics;
7. add common JSON envelope and doctor/receipts;
8. run static and synthetic qualification;
9. only then update GBrain `cold-start-apple` to consume the qualified reader.

No step admits real personal data merely because earlier unit tests pass.
