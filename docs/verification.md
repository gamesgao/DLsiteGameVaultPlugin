# Executed verification

## Actions implementation follow-up — 2026-10-17

**Configuration and partial local validation, not a remote Actions result.**
The new `build-release.yml` targets Ubuntu 24.04 / Node 24 / pnpm 11.7.0 and
the same exact GameVault revision as the delivery below. No workflow was
dispatched, tag created, release published/replaced, credential changed or
repository setting changed by this implementation session. The original
plan and all functional FIRST tests/coverage thresholds are unchanged.

Local runtime: native macOS arm64, independently downloaded/checksummed
Node **24.22.0**, npm **11.19.1**, and worktree-local pnpm **11.7.0**.
Tools/dependencies were confined to ignored worktree directories. The shared
reference backend's tracked source remained clean.

| Check | Executed result |
| --- | --- |
| `npm ci`, `format:check`, `typecheck`, `build` on Node 24 | Passed |
| `test:coverage` on Node 24 | **165 tests passed**, 4 files |
| Core coverage, lines/functions/branches/statements | **99.72 / 100 / 97.37 / 99.23%**, unchanged |
| actionlint **1.7.12** | Passed for the workflow |
| Standard YAML parser **2.9.0**, `bash -n` | Parsed YAML; all **7** inline shell steps passed syntax checks |
| Local execution of version/notes steps | Branch and matching tag passed; mismatching tag failed without output; existing release notes copied exactly; missing notes produced the documented fallback |
| `node --check` for both changed scripts; `git diff --check` | Passed |
| Action tags and current official documentation | Verified checkout v7, setup-node v7, upload-artifact v7, download-artifact v8 and pnpm/setup v1 exist; reviewed inputs, artifact extraction and `gh release create` refusal of published duplicates |

**Independent coordinating-agent acceptance:** after the implementer's host
setup was blocked by its non-interactive tool permissions, the coordinator
reran the changed code against the existing isolated backend on Node **26.7.0**.
All **165 core/client + 59 provider tests**, both coverage gates, both type
checks, formatting, version-derived ZIP packaging and checksum passed.
The newly built package registered exactly **one DLsite provider with zero
live requests**, then the temporary host and runtime were removed. This is a
fresh run of the changed scripts, not a reuse of the old release's results.
The coordinator also independently reran the Node **24.22.0** core coverage,
typecheck and build successfully. Full host acceptance on Node 24 and Linux
remains pending. Optional ShellCheck installation was blocked; actionlint,
YAML parsing and Bash syntax checks above did execute.

**Pending remote acceptance:** a maintainer must push using an authorized
transport (the reported current `gh` OAuth credential lacks `workflow` scope),
observe the branch-push run or dispatch the workflow from the default branch,
and verify all gates, one-provider/zero-live-fetch registration, retained
artifacts and downloaded checksums. The release job must be skipped for this
build-only acceptance. Linux native dependency installation, GitHub-hosted
action execution, artifact transfer and actual release publication remain
unverified. Do not recreate `v0.1.0` or publish another version for CI-only
acceptance. Commands and trigger/permission details: [ci.md](ci.md).

## Component 4: delivery and actual host lifecycle — 2026-10-17

**Executed, not a plan:** native macOS; Node **v26.7.0**, npm **11.19.0**,
TypeScript **6.0.3**; GameVault **17.0.1** at
**`859d71ef46f3a1f00a236e5d4c7dbde1eeba02b3`**; actual SQLite engine
**3.53.4** queried from the running host. The backend's package-manager pin
used pnpm **11.7.0** (the outer shell's pnpm launcher reports 11.3.0).
The isolated backend's tracked worktree remained clean. No Docker, NAS,
`/Volumes`, real library, personal credentials or global configuration/proxy
changes. All test hosts and descendants were stopped; temporary databases,
admins, archives and downloaded media were deleted.

### Reproduce from the repository root

Supply a disposable checkout of that backend revision with its dependencies
already installed and a working native SQLite binding. Do not run the host
copy step concurrently with a backend rebuild.

```sh
BACKEND=/path/to/disposable/gamevault-backend
npm test
npm run test:coverage
npm run typecheck
npm run build
npm run typecheck:provider -- --backend "$BACKEND"
npm run test:provider -- --backend "$BACKEND"
npm run test:provider:coverage -- --backend "$BACKEND"
npm run format:check
npm run build:plugin -- --backend "$BACKEND"
npm run smoke:plugin -- --backend "$BACKEND"
npm run e2e:host -- --backend "$BACKEND"
npm run smoke:dlsite
(cd artifacts && shasum -a 256 -c SHA256SUMS)
unzip -tq artifacts/dlsite-0.1.0.zip
git diff --check
```

`npm ci` is the prerequisite on a fresh plugin checkout, not part of each test
run. `e2e:host` accepts `--archive /absolute/path/to/dlsite-0.1.0.zip` to test a
downloaded release asset. Neither live check runs in the unit suites.

| Gate | Actual result |
| --- | --- |
| `npm test`, `npm run test:coverage` | Exit 0, **165 tests**, 4 files |
| Core/client coverage | **99.72% lines, 100% functions, 97.37% branches, 99.23% statements** |
| `npm run typecheck`, `npm run build` | Exit 0 |
| `typecheck:provider` | Exit 0 using the host's compiler/types |
| `test:provider`, `test:provider:coverage` | Exit 0, **59 tests**, 3 files |
| Adapter coverage | **100% lines/functions/statements, 93.96% branches** |
| `format:check`, `git diff --check` | Exit 0 |
| `build:plugin` | Exit 0, plugin-root ZIP and `SHA256SUMS` |
| `smoke:plugin` | Exit 0, extracted production package, exactly one DLsite; **zero live retrievals** |
| `e2e:host` | Exit 0, all lifecycle phases below; **20 real outbound fetch responses**, **4 injected failed attempts** |
| `smoke:dlsite` | Exit 0, **10 real HTTP responses**, no supplemental warnings |
| ZIP integrity / checksum | Passed; digest is generated in `artifacts/SHA256SUMS` and printed by build/E2E |

Combined offline suite: **224 tests**. Gates remain 90% lines/functions/
statements and 85% branches for both core and adapter. No functional code was
excluded, no threshold lowered. Delivery changes are the executable acceptance/
packaging scripts and documentation; no demonstrated provider/core functional
defect required a production workaround.

### Actual packaged-host API and persistence evidence

The harness copied compiled host output into a fresh temporary production
layout, linked the host's installed dependencies, extracted the ZIP into its
plugin volume and called the **real production loader and AppModule**.
It did not import plugin test source, insert database game records, patch
controllers, or fabricate successful network responses. The worker bootstrap
uses the real validation pipe/controllers/services with `127.0.0.1:0` instead
of official `main.js`'s all-interface listener.

Every startup used an ephemeral localhost port. Unauthenticated
`GET /api/metadata/providers` returned **401**. Actual
`POST /api/auth/basic/register` returned **201**, role **3 / ADMIN**;
Basic login returned **200** and a bearer token used for the remaining APIs.
The authenticated provider list contained exactly:

```json
{"slug":"dlsite","name":"DLsite","priority":20,"enabled":true}
```

The host's disabled `rawg-legacy` was also present. No credentials/tokens were
printed or retained.

| Lifecycle operation | Observed and asserted |
| --- | --- |
| Startup filesystem index | Three ZIPs, containing only an invented text file, became actual game/version records |
| `03 RJ141995 (W_P).zip` | Automatically mapped to RJ141995; saved source and effective metadata agreed |
| `01 Manual Example (W_P).zip` | Indexed, but no guessed DLsite mapping |
| `02 RJ150726 Skip (NC) (W_P).zip` | Indexed, but host skipped automatic metadata |
| `PUT /api/games/reindex` | 200, empty body; NC/no-ID remained unmapped, fresh mapping caused no extra requests |
| Keyword provider search for `東方紅輝心` | 200; four real DLsite search sections, correct RJ141995 candidate |
| `PUT /api/games/:id` mapping requests | No-ID entry manually mapped to RJ141995, reused saved images, then remapped to RJ150726 with that work's own circle/images |
| Same-ID mapping/refresh | Fresh home redirect, maniax HTML and AJAX fetched again; saved source ID/fields/media retained |
| `user_metadata` update | Effective title `Synthetic user title`, rating **42**, tag `User tag` survived provider refresh; DLsite source retained its real title/rating/tags |
| Injected transport failure, same ID | API 500 with a network/DLsite error; complete saved game unchanged |
| Injected transport failure, different ID | API 500; previous mapping, relations, user metadata and images unchanged |
| Real process restart | Exactly one DLsite, same source work IDs/fields, user values and media hashes; no new outbound retrieval |
| Whole-directory same-version replacement | Extracted archive loaded again with the same persisted results; no new retrieval |
| Removal | Volume folder deletion left the host's injected copy present; deleting that copy too and restarting yielded zero DLsite providers; saved source/media still readable |
| Shutdown/cleanup | Each process/descendant stopped; API connection refusal checked; all owned runtime files deleted |

No-ID/NC assertions use real indexed records, not synthetic database inserts.
Refresh failure injection only throws at the fetch boundary after the live
snapshots are saved; it is **not** a real observed DLsite outage or a successful
fixture masquerading as live retrieval. Two requests with one retry each
account for the four injected failures. Persistence and API behavior remain
real during that phase.

### Public fields and actual image bytes

| Work | Saved title | Date | Circle/developer | Genre | Score |
| --- | --- | --- | --- | --- | --- |
| RJ141995 | 東方紅輝心 | 2014-09-23 | あんかけスパ | アクション | 94 |
| RJ150726 | もんむす・くえすと! ぱらどっくすRPG前章 | 2015-03-14 | とろとろレジスタンス | ロールプレイング | 96 |

RJ141995 saved tags: `3D作品`, `Features: アプリケーション`,
`Features: 音楽あり`. RJ150726 saved tags: `逆レ`, `逆転無し`,
`Series: もんむす・くえすと！`, `Features: アプリケーション`,
`Features: 音楽あり`. Both saved nonempty Markdown descriptions, canonical
provider URLs and real release dates. Dates were persisted at midnight UTC;
ratings were not multiplied a second time.

RJ141995 work/AJAX returned **200**. RJ150726 lookup returned **301 → maniax**,
then page/AJAX **200**. All home/maniax/soft/pro keyword searches returned
**200**. The four `img.dlsite.jp` requests returned **200** and were validated/
persisted by the actual host MediaService as **image/jpeg**, not just saved URLs:

| Work/media | Bytes | SHA-256 of file and authenticated `/api/media/:id` response |
| --- | ---: | --- |
| RJ141995 cover | 240,521 | `2898c2888b875aa04e8aeb2339c255464951951d4721789ddf5cff4fa3eb2153` |
| RJ141995 first sample/background | 131,439 | `8aa1321dd8172d5cd2fd69fce503c031074ae08c672f15c09bb36ff86724e80e` |
| RJ150726 cover | 207,207 | `eaf5795cb7da234b095b76e68427c2f38978bef8d84406ca31e8f48a3d658790` |
| RJ150726 first sample/background | 188,202 | `b4dbd536c91751d879c8228e55e7c9a59f9c5e327ce2aa4cc76d148f93c3873d` |

The actual file paths were inside the temporary media volume, source URLs
remained on `https://img.dlsite.jp`, JPEG magic bytes were checked, and served
bytes equalled file bytes. IDs, source URLs and hashes survived restart and
replacement without redownload. Artwork and HTML were not retained as fixtures
or packaged. The standalone live smoke separately downloaded the 207,207-byte
cover without writing it to disk.

### Package, harness corrections and limits

`artifacts/dlsite-0.1.0.zip` extracts to the single `dlsite/` plugin root.
Contents were inspected: compiled ESM adapter/declarations/maps, private
core/scraper JavaScript bundle, Markdown documentation/changelog, MIT license
and bundled dependency notices. Host NestJS/TypeORM/reflect-metadata are
external imports, not duplicate runtime copies. No backend source, native
binary/runtime, `node_modules`, credentials, DB, real full HTML pages, game
payloads or artwork are included. The same final ZIP is the input to production
load/lifecycle acceptance; `SHA256SUMS` identifies the exact built bytes.
Rebuilding may change ZIP timestamps/digest; check the sidecar for that build.

Early harness runs correctly failed on three test assumptions: parsing the
reindex endpoint's empty 200 response as JSON; expecting an unchanged TypeORM
upsert to advance `updated_at`; and comparing host startup cascade-save update
counters as though they were user values. Inspection of the actual public host
path resolved these: assert reindex status, assert real fresh page/JSON requests
and persisted fields, and compare all user data except `updated_at`/
`entity_version` across restart. Failure-preservation comparisons still check
the **complete game**, including counters. No provider defect was hidden or
host code patched; failed runs also stopped and cleaned their hosts.

The existing host asset-copy mismatch is handled only in temporary generated
output, as documented below. The harness has a 300-second deadline, a 48-fetch
budget, and bounded child shutdown. It uses a transparent fetch observer plus
the explicit failure phase; host media redirects remain host-owned.

**Not tested:** real NAS/libraries/credentials; Docker; Linux/Windows deployment;
PostgreSQL; Node 24; GameVault GUI or Playnite UI; historical/CommonJS hosts or
other backend revisions; every ID prefix/locale/work category; actual 30-day
TTL expiration; large-library performance; cross-version plugin upgrade or
media garbage collection after removal. Same-version replacement is not an
upgrade-migration claim. Official Playnite does not automatically synchronize
these server metadata. There is no CI/workflow-run claim. No commit, push, tag
or release was made by this delivery session.

The earlier component results below are historical evidence; their then-pending
lifecycle boundary is superseded by the component-4 results above.

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
