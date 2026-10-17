# Design: native DLsite metadata provider

## Scope

A GameVault server-side provider named `dlsite`, written in TypeScript, with a small platform-independent DLsite core and a thin NestJS adapter. Use the official plugin pattern. No sidecar, Playnite runtime, custom front end, new database, or GameVault core fork.

The original Copilot plan is retained in copilot-original-plan.md. This document incorporates the project owner's later requirements and takes precedence: prioritize useful feature behavior and readable implementation over speculative hardening or exhaustive boundary validation.

## Components

1. Identity and parsing: canonical IDs/URLs; parse product HTML plus optional JSON and search HTML into simple typed records. No network or host dependency.
2. DLsite client: fetch/search, modest request pacing and cache, meaningful error handling; use standard fetch and a minimal injected network boundary for tests.
3. GameVault adapter: provider registration, ID-first automatic matching, search/manual remap, field mapping, existing metadata/media services and safe refresh behavior.
4. Packaging and verification: ESM output, current host build integration, install documentation and actual isolated-server acceptance.

Use a small number of modules named for behavior. Do not add repositories, policy engines, generalized plug-in transports or multi-layer factories for future hypothetical backends.

## Identity and matching

Support DLsite work IDs and canonical work URLs. Preserve prefix and leading zeroes; accept historic six-digit and current eight-digit IDs using observed forms. Reject conflicting IDs instead of guessing. Use full uppercase work ID for `provider_data_id`; locale and category do not create duplicate identities.

Automatic matching uses an unambiguous explicit ID from the filename/title. Without ID, expose title-search candidates for manual remap; do not pick the first candidate automatically. `(NC)` remains GameVault's own no-provider-refresh behavior. Do not rename or modify archives.

## Fields

Map title, description, cover, background, developers, publishers when actually known, genres, tags, release date, rating, minimum age, and website links. Keep game genres separate from topical tags. Normalize HTML into readable Markdown, score scale once, and dates without fabricated defaults.

Use prefixed tags for Series and Features. Icon has no native destination. Do not add schema columns for price/sales/credits/languages. Do not claim that DLsite is necessarily the publisher. Preserve human-entered metadata priority.

## Network and refresh

Use known DLsite endpoints and meaningful URL checks; never fetch arbitrary user-supplied non-DLsite URLs or local files. Keep timeouts, bounded retries for transient failures, and rate-limit handling straightforward. No browser automation, login cookies or bypass of access restrictions.

On unavailable/failed refresh keep prior valid data, especially relation arrays and images. Do not turn an incomplete parse into a successful empty record. Confirm the real host save/media behavior before settling the adapter design. Reuse existing host facilities; do not expand scope into a host-wide transaction, GC, networking or security rewrite.

## Packaging and compatibility

Target the inspected GameVault 17.0.1 baseline first and record tested revisions. Native ESM/default module export/explicit .js imports; reuse host NestJS and entities. Ship plugin-only output and necessary private dependencies, never a duplicate NestJS or backend copy.

Validate realistic installation, update and removal behavior. Prefer ordinary compatible image tags in examples rather than frozen hashes. No real NAS access.

## Acceptance

Functional FIRST unit tests, coverage gates, type checking, package build, real low-volume DLsite smoke, and an actual isolated GameVault plugin load and metadata lifecycle test. Add concise evidence without claiming a NAS or GUI test that was not performed.

## Provider implementation decisions (2026-10-17)

- Follow the official `.local/plugins/dlsite` module layout, explicit `.js`
  imports and default module export. Compile with the host's TypeScript/
  decorator metadata and use its NestJS/TypeORM instances. Only the accepted
  standalone core and private JavaScript dependencies are bundled.
- Automatic matching combines title and filename/version-filename IDs,
  excluding parent directories; conflicting evidence rejects the match.
  Manual lookup always honors the supplied provider ID. NC and user-metadata
  priority stay entirely with GameVault.
- Confirmed `GameMetadataService.save()` initializes all four relation arrays
  empty. Use its public `findByProviderSlug` with relations to obtain the
  same-ID record. Preserve missing/empty optional relations; replace only
  nonempty supplied groups, with separate topical/series/feature tag groups.
  Do not use another product's metadata after remapping. Source codes and
  original-Unicode name hashes give stable provider relation identifiers.
- Confirmed `MediaService.downloadByUrl` records the source URL and validates
  actual bytes; it is simpler than manufacturing Multer uploads and an uploader.
  Reuse unchanged available images. Log and retain valid same-ID images on
  download failure; without a valid prior image, reject the snapshot before
  metadata save. Rely on host timeout/format/GC behavior, not a new media system.
- Three plugin settings only: locale (Japanese default), priority and existing
  client request interval. Media download pacing remains host-owned.
- Separate host-aware functional tests include the entire adapter in coverage;
  they use real Nest module registration/base classes and real client/parsers,
  with stubs only at persistence/media/network boundaries.
- Real extracted-archive registration is verified on the isolated 17.0.1 host.
  Its Nest asset-copy nesting required preparing the existing asset in generated
  output for startup; no tracked core modifications were made. The bounded
  harness uses the official loader/AppModule, localhost and a temporary admin.
  The subsequent delivery acceptance below extends this to persisted lifecycle.

## Delivery decisions (2026-10-17)

- Extend the existing host smoke with opt-in `--live` rather than introduce a
  test orchestration framework. A small child bootstrap allows real process
  restarts, a loopback-only listener and bounded shutdown despite host watcher
  handles. Copy built host output to a temporary production layout; reuse host
  dependencies without modifying its tracked files or injecting into its checkout.
- Index real synthetic ZIP archives through the real host filesystem scanner;
  authenticate a disposable admin and use existing public APIs for all mapping
  and user edits. No hand-authored DB records or fabricated successful responses.
  Read-only SQLite version reporting identifies the actual database engine.
- Live success covers two Japanese RJ works and four actual saved JPEG files.
  A separate, clearly labelled fetch-exception phase verifies saved failure
  preservation through the actual API/save/merge path.
- Preserve and verify provider data IDs, fields, user overrides, media source
  URLs and byte hashes across fresh processes and whole-directory same-version
  replacement. Do not equate unchanged-upsert timestamps with a refresh event,
  or host user-metadata update counters with changes to user values.
- The production loader leaves injected files behind. Document removal of both
  the volume folder and its copied generated directory on persistent hosts;
  verify zero registered DLsite providers without promising a database/media
  purge or an untested cross-version upgrade.
- Ship the plugin-root ZIP plus a generated SHA-256 sidecar, readable README,
  bilingual quick-start, mapping/configuration details and license notices.
  Keep the original plan unchanged. The original delivery did not run CI,
  NAS, GUI, all-locale/all-ID or other host-version acceptance; publishing
  remains the coordinating agent's job.

## CI follow-up

One build/release workflow reuses the existing FIRST coverage gates and
network-free packaged registration smoke. Use Ubuntu / Node 24 with the
exact compatible backend revision and its locked dependencies. Publish only
on matching version-tag pushes, after all gates pass, consuming the tested
artifact without rebuilding. Manual runs only retain artifacts; live E2E
remains opt-in/local. Do not replace published releases for CI-only changes.
See [ci.md](ci.md); remote execution evidence is recorded separately.

Contracts, commands and mapping details: [provider.md](provider.md).
