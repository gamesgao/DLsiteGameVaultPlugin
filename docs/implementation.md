# Component delivery

Each implementation session uses GitHub Copilot GPT-6 Astra. Implementation sessions do not run code-review agents. The main coordinating agent performs acceptance and pushes each accepted milestone.

| Component | Scope | Required acceptance |
|---|---|---|
| Foundation | README, license, ignore rules, design and testing policy | Public repository and first push |
| Core | Project tooling, shared records, identity, product/search parsers | Behavior-based FIRST tests, coverage, type check |
| Client | Product lookup/search, ordinary timeout/pacing/cache/failures | Deterministic HTTP-boundary UT and real low-volume smoke |
| Provider | Official-style module, mapping, matching, media and refresh | Adapter tests, host-compatible build and actual registration |
| Delivery | Plugin package, install/update guidance, CI, E2E verification | Full test gates, production package and isolated host lifecycle |

The original planning document is design input, not a mandate to implement every speculative hardening item. Keep a short implementation decision log in docs/design.md if actual host behavior requires a design change.
