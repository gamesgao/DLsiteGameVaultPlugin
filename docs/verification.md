# Executed verification

## Component 2: HTTP client — 2026-10-17

Executed locally with Node.js **v26.7.0**, npm **11.19.0**. All commands below
were run against the completed client component; no coverage exclusions or
threshold reductions were introduced.

| Command | Final result |
| --- | --- |
| `npm test` | Exit 0; 4 files, **165 tests passed** |
| `npm run test:coverage` | Exit 0; 165 passed; **99.72% lines, 100% functions, 97.37% branches, 99.23% statements** |
| `npm run typecheck` | Exit 0 |
| `npm run build` | Exit 0; ESM JavaScript and declarations emitted |
| `npm run format:check` | Exit 0, including the smoke script |
| `npm run smoke:dlsite` | Exit 0; built client, **10 HTTP requests**, no supplemental warnings |
| `git diff --check` | Exit 0 |

Client-only coverage: **99.45% lines, 100% functions, 98.91% branches,
98.99% statements**. Gates remain at 90% lines/functions/statements and
85% branches, including all authored `src/**/*.ts` functionality.

The network-free suite uses real parsers, compact synthetic HTML/JSON,
injected fetch responses, and fake clocks. It covers exact IDs/URLs,
cross-section redirects without identity changes, keyword encoding and
deduplication, real empty-search structure, optional-versus-full failures,
request budgets, shared pacing, body-read timeout, retries/429 cooldown,
cache/force-refresh recovery, and image host/MIME handling.

### Actual public HTTP results

| Request | Observed outcome |
| --- | --- |
| RJ150726 generic home work URL | **301 → maniax**, then **200**; identity unchanged |
| RJ150726 maniax `product/info/ajax` | **200**, JSON; real `rate_average_2dp` 4.79 from the preliminary direct check; parsed score **96** |
| RJ141995 home work URL | **200** |
| RJ141995 home `product/info/ajax` | **200**, JSON; parsed score **94** |
| Title `東方紅輝心`, home/maniax/soft/pro HTML search | **200 in all four sections**; one deduplicated result, **RJ141995 / 東方紅輝心** |
| RJ150726 cover on `img.dlsite.jp` | **200**, `image/jpeg`, **207,207 bytes**, not saved |

Verified fields from built exports:

| ID | Title | Work type | Release date | Score |
| --- | --- | --- | --- | --- |
| RJ150726 | もんむす・くえすと! ぱらどっくすRPG前章 | `RPG` / ロールプレイング | 2015-03-14 | 96 |
| RJ141995 | 東方紅輝心 | `ACN` / アクション | 2014-09-23 | 94 |

RJ141995 was independently located by a public title search and then confirmed
against its product page before use in the smoke script. Both exact-ID searches
in the final smoke reused the product cache without extra HTTP requests.
Preliminary bounded curl checks also confirmed the anonymous cookie/AJAX
headers, the existing saved sample structure, and a **200** no-match search
with `.work_not_found > .lead` rather than a result table. That observation
justifies the narrowly scoped parser change and regression fixture.

The first smoke attempt stopped after five successful HTTP responses because
its assertion incorrectly expected `ACT` for RJ141995. Inspection of the actual
page confirmed `ACN`; only the smoke expectation changed, and the complete
10-request smoke then passed. This was not an HTTP failure or a parser rewrite.

Standard Node fetch worked in this environment. No proxy/global settings,
credentials, NAS, or real library were accessed or changed. Upstream reference
source/sample HTML were read only. No full product pages or artwork are included
in the repository. There were no commits, pushes or other remote changes.

### Limits of this evidence

This verifies the standalone client, not GameVault installation, provider
registration, persistence/media lifecycle, package loading, GUI or NAS behavior.
Node 24 remains the declared supported baseline but was not the runtime used
for this execution. Live product checks cover two Japanese RJ games and
home/maniax routing, not every ID prefix, section or locale. Search is one page
per section and can include non-games; the only admitted image host is the
observed `img.dlsite.jp`. DLsite content, ratings, availability and HTML may
change. See [client.md](client.md) for exact configuration and failure contracts.
