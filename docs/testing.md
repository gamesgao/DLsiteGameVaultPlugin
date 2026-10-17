# Testing principles

Unit tests verify public function behavior and documented outcomes, not how code is written. FIRST means Fast, Independent, Repeatable, Self-validating, and Timely.

## Unit tests

- Use small synthetic HTML/JSON fixtures and deterministic inputs.
- Test ID recognition, exact title/field extraction, search results, normalization and mapping through public APIs.
- Test meaningful cases: missing optional fields, unknown/ambiguous IDs, unavailable products, failed HTTP/image retrieval, and retryable failures.
- Stub the HTTP boundary, not the parser or mapping function being tested. Avoid live requests and real sleeps in unit tests; use fake timers for time-dependent behavior.
- Client tests inject standard fetch responses and fake clocks, including body-read timeout, shared pacing/cooldown, cache refresh/recovery and the observed explicit empty-search layout.
- Do not assert source-code strings, private helper names, object construction details or incidental internal call ordering. Do not mirror every conditional with a contrived test.
- Coverage gates for authored functional code: at least 90% lines, 90% functions and 85% branches. Exclude generated output, upstream/vendor code and declarations, not meaningful untested functionality. Coverage is a diagnostic, not permission to write tautological tests.

## Component acceptance

The main coordinating agent runs the component's tests and applicable full suite, type checks and build, checks that assertions exercise behavior, and accepts or returns concrete defects to the implementation agent. No code-review agents are used. Each accepted component is pushed independently.

## Integration and live checks

Keep network-free UT separate from opt-in live DLsite checks. Test an actual packaged plugin against an isolated compatible GameVault server: load and registration, automatic ID mapping, manual search/remap, persisted metadata/media, updates, useful failure preservation and restart. Do not substitute mocked host classes for all host integration evidence.

Record real command results and supported versions in docs/verification.md. Clearly distinguish local API verification from client GUI or NAS verification that has not been performed. The production archive must be independently inspected and load-tested.

For the client-only opt-in public HTTP check, run `npm run build` followed by
`npm run smoke:dlsite`. It uses built output, bounded request/time budgets, and
prints statuses and concise fields without saving product pages or images.

## Native provider commands

The default suite covers `src/**/*.ts`. The native adapter under `plugin/`
requires real host imports and has its own explicit configuration and **the
same coverage gates**, with no adapter exclusion:

```sh
npm run typecheck:provider -- --backend /path/to/gamevault-backend
npm run test:provider -- --backend /path/to/gamevault-backend
npm run test:provider:coverage -- --backend /path/to/gamevault-backend
```

These commands stage the plugin and use the host compiler. The test commands
then run `vitest.provider.config.ts` against every `plugin/**/*.ts` file with
real host Nest/base/entity classes. Tests substitute host storage/media modules
and standard fetch, not matching, mapping, client or parsing logic. The host's
AppModule is imported first, like its real main, to initialize its cyclic ESM
graph. Coverage reports are `coverage/` (core) and `coverage/provider/` (adapter);
run core coverage first because it cleans its report directory.

`npm run build:plugin -- --backend PATH` builds the archive/checksum, and
`npm run smoke:plugin -- --backend PATH` checks the **extracted archive** through
the real host loader, temporary SQLite and authenticated localhost API.
This default mode is registration-only, with no DLsite retrieval.

## Opt-in native host lifecycle

After building the plugin, from the repository root:

```sh
npm run e2e:host -- --backend /path/to/disposable/gamevault-backend
# Optional: verify a specific release asset rather than the default artifact.
npm run e2e:host -- --backend /path/to/disposable/gamevault-backend --archive /path/to/dlsite-0.1.0.zip
```

Requirements: a built compatible backend with its own installed dependencies
(including functional SQLite native binding), Node, `zip`, `unzip`, `ps`, and
public DLsite/image-host reachability. No Docker, browser or game binaries.
Use macOS/Linux-style native tooling; Windows execution has not been tested.
The script does not install dependencies or alter global proxy/configuration.

The harness copies host `dist` into its own OS-temporary production layout,
symlinks host dependencies, extracts the actual ZIP and boots the real loader/
AppModule in a child process. It does not import plugin test sources or edit
tracked host code. A temporary first-user admin uses real API authentication.
The worker is a minimal localhost bootstrap, not the all-interface official
`main.js` listener; Nest validation, controllers, services, indexer, DB and
media implementation are real.

Three synthetic archives exercise ID auto-indexing, no-ID manual selection,
and `(NC)`. Assertions cover saved source/effective title, date, circle,
genres/tags/rating, actual JPEG files served byte-for-byte by the media API,
four-section keyword search, same/different-ID mapping, user title/rating/tag
priority, fresh-metadata reindex, restart, same-version replacement and removal.
Image IDs, source URLs and SHA-256 remain unchanged across restart/replacement.
Actual expiration of the 30-day host TTL is not timed out in this short test.

After live success, an explicit failure-only phase injects standard fetch
transport exceptions for DLsite, **not successful fixtures**. Both refresh and
remap must return 500 with a meaningful error and leave the entire previously
saved source/user/merged game unchanged. This is deterministic failure
evidence, not a claim of observing a real DLsite outage.

Overall deadline: 300 seconds plus up to 5 seconds for worker shutdown.
Poll waits: 90 seconds. Live budget: 48 outbound fetch attempts; normal observed
run: 20. Native media redirects remain host-owned. Each worker and descendants
are stopped, connection refusal is checked, and temporary credentials, SQLite,
volumes/media/ZIPs are deleted on success, error or handled interrupt.
SIGKILL/power loss cannot run JavaScript cleanup.

Run core coverage **before** provider coverage; the first cleans `coverage/`.
Do not build the backend concurrently with a host check copying its output.
Harness scripts are not unit-covered production logic; all `src/` and
`plugin/` functionality remains covered with unchanged thresholds.
There is no CI claim. See [provider.md](provider.md) for the generated-asset
preparation and [verification.md](verification.md) for actual results.
