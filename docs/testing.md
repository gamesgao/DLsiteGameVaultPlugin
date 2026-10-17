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
