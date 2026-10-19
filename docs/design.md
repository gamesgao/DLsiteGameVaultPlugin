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

Functional FIRST unit tests, coverage gates, type checking, package build,
and isolated GameVault registration and metadata/media lifecycle checks.
For 0.2.0 the network acceptance uses local CONNECT/HTTPS fixtures; live
DLsite checks remain opt-in and were not requested for this change.
Add concise evidence without claiming NAS, GUI or hosted CI execution.

## Historical 0.1.0 provider decisions (2026-10-17)

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
- At 0.1.0, `MediaService.downloadByUrl` recorded the source URL and validated
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

## 0.2.0 scoped proxy and media transport (2026-10-19)

- All runtime settings now use `PLUGIN_DLSITE_`: `LOCALE`, `PRIORITY`,
  `REQUEST_INTERVAL_MS`, and optional `PROXY_URL`. No old-prefix aliases.
  Defaults remain Japanese, priority 20 and 500 ms. Explicit 0.1.0 settings
  must be renamed; `VOLUMES_PLUGINS` stays host-owned.
- Pin Undici 7.30.1 directly and bundle it privately. Reuse a single
  ProxyAgent through the client's existing injected fetch boundary; never
  replace global fetch or the global dispatcher. No direct fallback.
  Support HTTP/HTTPS with optional Basic credentials, not SOCKS. Close on
  Nest module destruction. Preserve origin and proxy TLS verification.
- Local testing found Undici 7 passes IP proxy addresses as SNI, which Node
  26 rejects. Use the supported `clientFactory`/Pool/buildConnector APIs for
  HTTPS IP proxies to omit SNI while retaining certificate IP verification.
  No upstream-main-only features or insecure TLS settings are assumed.
- Supersede the 0.1.0 image download choice above: `downloadByUrl` performs
  its own global fetch and would bypass scoped routing. Fetch all image
  bytes through `DlsiteClient.getImage`, with its pacing/retry/timeout and
  redirect checks; pass a typed in-memory file to public host upload with
  no uploader. Host validation, file persistence, media rows and GC remain
  unchanged.
- Upload does not populate `source_url`; metadata relations do not cascade
  updates. Use supported Nest TypeORM injection for the host Media entity
  and update exactly the new media row with the original source URL. Clean
  it through public host delete if this update fails. No private patch,
  new account, media implementation or metadata transaction framework.
  Keep same-ID availability/reuse and previous-image failure preservation.
- Fetch and response-body errors deliberately omit raw transport causes;
  config/construction/shutdown errors never echo proxy URIs or retain
  credential-bearing nested causes. HTTP status, request URL, timeout and
  retry metadata remain useful. Credentials are sent only on CONNECT.
- Keep FIRST suites offline and fast; put real socket/certificate/host work
  in bounded `smoke:proxy` and `e2e:proxy` scripts. They use only loopback
  fixture servers and temporary credentials/CA, explicitly synthetic
  responses, real extracted plugin/SQLite/media APIs and fresh processes.
  No public DNS or NAS access. Add those gates to Ubuntu / Node 24 Actions,
  without claiming the updated hosted workflow has run.
