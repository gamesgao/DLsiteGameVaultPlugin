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

`npm run build:plugin -- --backend PATH` builds the archive, and
`npm run smoke:plugin -- --backend PATH` checks the **extracted archive** through
the real host loader, temporary SQLite and authenticated localhost API.
The bounded smoke stops its server, confirms connection refusal and cleans
its temporary admin/database/volumes. It does not test real game mapping or the
client GUI. See [provider.md](provider.md) for prerequisites and the observed
generated-host-asset preparation needed for this checkout.
