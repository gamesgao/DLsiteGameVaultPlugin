# Contributing

Read docs/design.md and docs/testing.md before changing code.

- Follow GameVault's documented NestJS provider/module style, ESM imports, and naming conventions.
- Keep scraping and parsing independent of the GameVault adapter. Prefer small functions and concrete types; introduce abstractions only when they remove actual duplication.
- Implement real behavior, then cover its contract with FIRST tests. Do not test source text, private implementation choices, or incidental call order.
- Cover normal use, meaningful missing data and failures. Do not introduce validation frameworks, speculative threat models, or large hardening layers unrelated to the feature.
- Do not invoke code-review agents. The coordinating agent accepts components by reading the changed behavior and running tests, type checking, build and integration checks.
- Deliver coherent components. Each accepted component is committed and pushed before moving to the next milestone.
- Keep design, mapping, installation and test documentation current. Do not claim live results that were not executed.
- Never access a user's NAS or real library during development. Use an isolated local instance and synthetic archives.
- No credentials, full third-party game archives, complete product-page dumps, machine-specific paths, or private execution logs belong in commits.
