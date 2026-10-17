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
