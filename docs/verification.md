# Executed verification

## Component 3: native provider and package — 2026-10-17

Executed with Node.js **v26.7.0**, npm **11.19.0**, pnpm **11.7.0**, TypeScript
**6.0.3** and the isolated GameVault backend **17.0.1 / `859d71e`** checkout.
No tracked host/core source was modified. No Docker, NAS, production library,
real credentials or external server was used.

Run the host-aware commands with `-- --backend /path/to/gamevault-backend`.
They stage `.local/plugins/dlsite` and use the host's installed compiler and
dependencies, not a second NestJS/TypeORM installation.

| Command | Executed result |
| --- | --- |
| `npm test` | Exit 0; **165 core/client tests** |
| `npm run test:coverage` | Exit 0; **99.72% lines, 100% functions, 97.37% branches, 99.23% statements** |
| `npm run typecheck` / `npm run build` | Exit 0; standalone ESM/declarations |
| `npm run typecheck:provider -- --backend PATH` | Exit 0; staged native code checked with the host types/compiler |
| `npm run test:provider -- --backend PATH` | Exit 0; **59 native mapper/provider/config tests**, 3 files |
| `npm run test:provider:coverage -- --backend PATH` | Exit 0; **100% lines/functions/statements, 93.96% branches** across all four adapter files |
| `npm run build:plugin -- --backend PATH` | Exit 0; host build and plugin-only directory/ZIP |
| `npm run smoke:plugin -- --backend PATH` | Exit 0; extracted archive loaded and registered through the real host |
| `npm run format:check` / `git diff --check` | Exit 0 |

The native suite uses real mapper/provider methods, the accepted client and
parsers, the host MetadataProvider base/entity classes and an actual Nest
testing module. Stubs are confined to storage/media module boundaries and
standard fetch. It covers ID/no-ID/conflicts (including version filenames),
manual ID lookup/forced refresh, native search candidates, field mapping,
CJK-safe identities, unknown/empty relation groups, same-ID preservation,
remap isolation, whole-fetch/parse/database failures and image reuse/failures.
The combined suites pass **224 tests**. Coverage gates remain 90% lines/
functions/statements and 85% branches; no authored adapter file is excluded.

### Real packaged-host evidence

The archive was extracted to a fresh temporary plugin volume, not imported
from unit-test source. The harness used the host's real `loadPlugins()` and
`AppModule`, real SQLite migrations, authentication and provider-list
controller. It bootstraps Nest directly to bind **only `127.0.0.1`**, unlike
the host main's default all-interface listener. A generated temporary first
user was confirmed as ADMIN, logged in through Basic auth, and its bearer
token was used for:

```text
GET http://127.0.0.1:56527/api/metadata/providers
HTTP 200
```

Relevant actual response:

```json
{"slug":"dlsite","name":"DLsite","priority":20,"enabled":true}
```

The response also contained the host's disabled `rawg-legacy` provider. No
credentials or tokens were printed or retained. The final smoke printed
`Temporary localhost server stopped.`, verified that the API no longer
accepted connections, removed temporary runtime volumes/the injected plugin
copy and exited 0. The script has a 60-second deadline.

Two actual source-host integration details were handled without a core fork:

- Importing MediaModule in isolation hit the host's cyclic-ESM initialization
  order. Host-aware tests now import AppModule first, matching the official
  main/plugin-loader sequence.
- Nest's asset copy produced `dist/assets/assets/ignored-executables.txt`,
  while ProgressService requires `dist/assets/ignored-executables.txt`. The
  first startup exposed that ENOENT. The harness prepares the existing host
  asset in generated output only. After app shutdown the host retained process
  handles, so the bounded CLI explicitly exits after successful cleanup.
  The initial failed runtime and lingering validation process were cleaned up.

Artifacts are `artifacts/dlsite/` and `artifacts/dlsite-0.1.0.zip`, ignored by
git. The archive contains the ESM module/adapter, private core bundle, types,
documentation and actual bundled dependency license notices, including nested
versions. The build initially found that npm's boolbase 1.0.0 omits its LICENSE;
its upstream ISC notice is now retained in THIRD_PARTY_NOTICES and the archive.
No backend implementation, NestJS, TypeORM, reflect-metadata, test credentials,
database, artwork or product-page dump is part of the package.

### Remaining delivery acceptance

Registration is the proof completed here, **not** a claim of a finished
metadata/media lifecycle. The next component must run persisted automatic
mapping, manual search/remapping, real media saves, refresh-failure preservation
through host `save()`/merge, user-metadata precedence, restart, update and
removal against synthetic library archives. GUI/NAS behavior and Node 24 were
not tested. Live DLsite HTTP evidence remains the component-2 checks below;
the registration smoke makes no DLsite requests. No commits/pushes or
code-review agents were used in this component.

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
