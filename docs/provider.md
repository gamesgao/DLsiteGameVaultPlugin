# Native GameVault provider

The plugin targets the inspected GameVault **17.0.1** ESM backend. Its default
export is `DlsitePluginModule`; Nest imports the host `MetadataModule` and
`MediaModule`, and registers one `DlsiteMetadataProviderService` with slug
`dlsite`. No host entities, NestJS, TypeORM or `reflect-metadata` are bundled.

## Configuration

Set environment variables on the **GameVault server process** before startup:

```sh
PLUGIN_DLSITE_LOCALE=ja_JP
PLUGIN_DLSITE_PRIORITY=20
PLUGIN_DLSITE_REQUEST_INTERVAL_MS=500
# Optional; omit entirely to keep the default transport:
PLUGIN_DLSITE_PROXY_URL=http://proxy.example:8080
```

All are optional. Locale supports `ja_JP`, `en_US`, `zh_CN`, `zh_TW`; priority
is a safe integer and must not collide with another registered provider's
priority (IGDB defaults to 10). Higher priorities take precedence in the host
merge; user metadata still wins. Pacing is 0–60,000 ms between the shared
client's HTTP requests. Other timeout/retry/cache settings use the existing
[client defaults](client.md); no separate provider policy layer is introduced.
Invalid settings fail construction. Remove the plugin to disable it.
These are plugin environment variables, not additions to the host YAML schema.

**0.1.0 migration:** rename `PLUGIN_GAMESGAO_DLSITE_LOCALE` to
`PLUGIN_DLSITE_LOCALE`, `PLUGIN_GAMESGAO_DLSITE_PRIORITY` to
`PLUGIN_DLSITE_PRIORITY`, and `PLUGIN_GAMESGAO_DLSITE_REQUEST_INTERVAL_MS` to
`PLUGIN_DLSITE_REQUEST_INTERVAL_MS`. Existing explicit settings require this
change; the old names are ignored, not aliases. `VOLUMES_PLUGINS` remains a
GameVault setting and is unchanged.

`PROXY_URL` supports HTTP and HTTPS proxy URIs, optionally
`http://USERNAME:PASSWORD@proxy.example:8080` (percent-encode each credential).
SOCKS is not supported. Both schemes use CONNECT for HTTPS destinations.
Use an address reachable from inside the GameVault container; `127.0.0.1`
is the container itself. Invalid configuration fails without echoing the URI.
One pinned private Undici **7.30.1** ProxyAgent is reused by the provider,
injected through `DlsiteClientOptions.fetch`, and closed on Nest shutdown.
It never installs a global dispatcher or changes global fetch. Without the
setting the existing default fetch is used; with it, failures never retry
directly. Proxy auth is confined to CONNECT, not origin request headers.
Destination and HTTPS-proxy certificate verification stay enabled. No
insecure TLS override is provided.

## Provider APIs and matching

| Native method | Behavior |
| --- | --- |
| `search(query)` | Exact ID or supported work URL returns one rich candidate with `provider_slug`, full uppercase `provider_data_id`, title, description, optional date and cover URL. Other queries use the client's manual keyword search. No image is downloaded for search. |
| `getBestMatch(game)` | Extracts one distinct ID from title and filename(s), including version filenames. Ignores parent directory IDs. No ID or conflicting IDs throws Nest `NotFoundException`; never auto-selects a title result. |
| `getByProviderDataIdOrFail(id)` | Accepts a complete work ID, forces a fresh product fetch, reads same-ID saved provider metadata and returns a native `GameMetadata` snapshot. Does not save or write `user_metadata`; GameVault maps/saves/merges it. |

Repeated copies of the same ID are valid. Manual remapping uses the supplied
`provider_data_id` rather than the archive's ID. Missing products (404/410 or
the parser's unavailable marker) become `NotFoundException`; other HTTP,
parse and database errors propagate. `(NC)` is deliberately **not** overridden:
GameVault decides when automatic refresh is skipped.

Existing authenticated host endpoints (EDITOR or higher for search/list):

```text
GET /api/metadata/providers
GET /api/metadata/providers/dlsite/search?query=RJ000001
GET /api/metadata/providers/dlsite/search?query=<URL-encoded-title-or-work-URL>
```

The plugin adds no controller or alternate map endpoint. Use GameVault's
existing mapping UI/API with provider `dlsite` and the returned work ID:

```http
PUT /api/games/GAME_ID
Authorization: Bearer <your-access-token>
Content-Type: application/json

{"mapping_requests":[{"provider_slug":"dlsite","provider_data_id":"RJ141995"}]}
```

Use a separate `PUT` with `{"user_metadata":{"title":"My title"}}` to set an
override. The same-ID mapping request forces a fresh fetch; a different ID
remaps. `PUT /api/games/reindex` indexes files but respects host metadata TTL
(default 30 days), so it does not force fresh retrieval. In 17.0.1 it returns
HTTP 200 with an empty body. `(NC)` skips automatic queue refresh, not an
explicit manual mapping request. API behavior is tested; GUI controls are not.

## Mapping and refresh

| DLsite field | GameVault destination |
| --- | --- |
| Full ID / canonical URL | `provider_data_id` / `provider_data_url` |
| Title / Markdown description | `title` / `description` |
| Release calendar date | `release_date`, midnight UTC representation |
| Minimum age / already normalized score | `age_rating` / `rating`, including age 0; score is **not** multiplied again |
| Circle / brand | `developers`; never an inferred publisher |
| Work type codes / labels | `genres`; unknown codes retain their literal label, not proof that the item is a game |
| Topical labels | `tags` |
| Series / features | `Series: …` / `Features: …` tags |
| Canonical / Ci-en links | `url_websites` |
| Cover / first gallery image | Host `cover` / `background` media |
| Gallery URLs | `url_screenshots` |

Icon has no supported destination. Price, sales and other unsupported fields
are not invented. Relations use `maker:<source-id>`, `work-type:<source-code>`
or namespace + SHA-256 of the NFC-normalized **original Unicode name**. This
keeps unrelated CJK names distinct; it does not hash an empty transliterated
slug. Name-derived IDs can change when display locale changes.

The host's `GameMetadataService.save()` initializes relation arrays to `[]`.
The adapter therefore loads `findByProviderSlug("dlsite", { loadRelations:
true })` and selects only the requested ID. This public host API lists all
DLsite records. Metadata retrieval still uses this public API; the only added
repository operation is the narrow media-source persistence described below.
Unknown scalar values keep prior same-ID values. Missing **or empty** optional
relation/gallery sections retain their last useful values: a parser's empty
section is not reliable deletion evidence. Nonempty sections replace their
group; topical tags, series and features update independently. Website links
are deduplicated with previous same-ID links so an absent optional Ci-en link
does not erase a known one. Publishers are
never fabricated. A different remapped ID never inherits the old product's
relations, scalars or images.

### Images

Download bytes with the same `DlsiteClient.getImage()` used by the provider,
so images cannot bypass its proxy. Only HTTPS `img.dlsite.jp` URLs without
credentials/nonstandard ports are accepted, including redirects. The client's
timeouts, retries, MIME checks and shared pacing now also cover image requests.
The host still owns actual byte/format validation, atomic file writes, media
rows, availability and garbage collection.

Pass those bytes as a typed in-memory Multer file to public
`MediaService.upload(file, "")`. The pinned host treats the empty username as
no uploader; no account is created. Upload does not set `source_url`, and
GameMetadata's media relations do not cascade updates. Therefore import
`TypeOrmModule.forFeature([Media])` and inject the **host** Media repository to
persist the original requested source URL after upload. Require one updated
row before returning the media. Never store a proxy URL, redirected URL or
data URL. On URL-update failure use public `MediaService.delete()` to clean
the new media, then follow the existing failure-preservation policy.
No host source, private methods, duplicate entities or storage implementation
are patched. Reload and process restart are verified against real SQLite.

Reuse same-source media only after `isAvailable(id)` succeeds. Missing image
sections keep an available same-ID old image. A download/format failure logs a
warning and keeps an available old image; without one, the snapshot throws
before GameVault saves metadata. Text-only products without image URLs remain
valid. A later image failure can leave an earlier downloaded image for the
host's ordinary orphan cleanup; there is no cross-service transaction or GC
rewrite.

## Build and install

Requirements: Node.js 24 LTS or compatible 26+, npm, pnpm and `zip`; a compatible
GameVault source checkout with **its own dependencies already installed**.
Use a disposable development checkout: the script stages plugin sources under
`.local/plugins/dlsite` and invokes the normal host `pnpm build`, replacing its
`dist`. It never changes tracked host source.

```sh
npm ci
npm run build:plugin -- --backend /path/to/gamevault-backend
```

Output: `artifacts/dlsite/`, `artifacts/dlsite-0.2.0.zip` and
`artifacts/SHA256SUMS`. The directory has
`dlsite.plugin.module.js`, native ESM adapter files, a private core/scraper
bundle, declarations, license notices, README, changelog and `docs/`. Only
private pure-JS dependencies are bundled; the host TypeScript compiler emits
decorator metadata using its own installed NestJS and entity types.

Stop the destination server; extract the archive into its configured plugin
volume (default `/plugins`):

```sh
cd artifacts
shasum -a 256 -c SHA256SUMS
unzip dlsite-0.2.0.zip -d /path/to/plugin-volume
# Result: /path/to/plugin-volume/dlsite/dlsite.plugin.module.js
```

Start GameVault with `VOLUMES_PLUGINS` pointing to that volume. Archives are
**not** loaded directly. In official source-development mode,
`VOLUMES_PLUGINS=./.local/plugins` loads the compiled staged copy under `dist`.
Check the authenticated provider-list API for `dlsite`.

The production loader copies plugins into `dist/src/modules`. To update,
replace the complete `dlsite` folder while stopped, not a mix of old/new files.
For updating or removal on a persistent source installation, also remove the copied
`dist/src/modules/dlsite` directory (or rebuild clean host output). Do not
remove the host's shared modules or dependency directories. The loader does
not delete stale injected files. Same-version replacement was verified, not a
migration between two released versions. Removal stops the provider but does
not purge saved source metadata/media; later host merge/GC behavior still applies.

The verified host is **17.0.1 at `859d71ef46f3a1f00a236e5d4c7dbde1eeba02b3`**.
Do not treat the version string alone as a guarantee for every upstream build:
native plugins depend on host imports and types. Rebuild and run the opt-in
host check when changing backend revisions. Official plugin guidance was
checked against the public documentation on 2026-10-17.

## Tests and evidence boundary

```sh
npm test
npm run test:coverage
npm run typecheck
npm run build
npm run typecheck:provider -- --backend /path/to/gamevault-backend
npm run test:provider -- --backend /path/to/gamevault-backend
npm run test:provider:coverage -- --backend /path/to/gamevault-backend
npm run build:plugin -- --backend /path/to/gamevault-backend
npm run smoke:plugin -- --backend /path/to/gamevault-backend
npm run smoke:proxy
npm run e2e:proxy -- --backend /path/to/gamevault-backend
npm run e2e:host -- --backend /path/to/gamevault-backend
```

Provider tests use the separate `vitest.provider.config.ts`, real provider,
mapper, client/parsers and host base/entity/Nest classes. Only host persistence/
media boundaries and network responses are substituted. The wrapper compiles
the staged plugin/host first, then uses that host's runtime modules; the test
transform emits decorator metadata. Adapter coverage includes **every**
`plugin/**/*.ts` file with the same 90% lines/functions/statements and 85%
branches gates as the core. Default core tests do not silently stand in for
these host-aware tests.

`smoke:plugin` extracts the ZIP into a fresh OS-temporary plugin volume and
copies **built host output** into a clean temporary production layout, linking
only the host's installed dependencies. It uses the actual production loader/
AppModule, SQLite migrations, first-user ADMIN registration, Basic login and
bearer authentication. It asserts unauthenticated access is rejected and the
provider list contains exactly one `dlsite`. This mode does not retrieve DLsite.

`e2e:proxy` runs the same harness with `--proxy`, real local HTTP CONNECT and
HTTPS fixture origins, a temporary CA trusted only in test workers, and
synthetic HTML/JSON/PNG responses. It exercises persisted source URLs, media
files/API bytes, same-ID reuse after restart/replacement, real host format
rejection, image/metadata/proxy failures, auth isolation, independent host
requests and removal. Public DNS is blocked; the pinned host's incidental
frontend GitHub lookup is denied and counted, not fetched. See [testing.md](testing.md).

`e2e:host` remains an opt-in live check. Three real ZIPs contain only
an invented text file; `(W_P)` avoids unnecessary executable inspection. The
host's real filesystem indexer creates the records, not SQL inserts or mocked
controllers. Authenticated API checks cover automatic ID mapping, NC/no-ID
policy, keyword search/manual remap, real metadata and on-disk media bytes,
same-ID forced refresh, user priority, restart, replacement and removal.

In live mode the worker observes real outbound fetch responses without rewriting them.
A clearly marked, separate failure phase injects transport exceptions only:
same-ID refresh and different-ID remap both return 500 and preserve the complete
saved game. It does not fabricate successful HTML, JSON or media responses.
The normal unit fixtures remain separate from live acceptance.

All host modes bind **only `127.0.0.1`**, use ephemeral ports, have a 300-second
overall deadline and a 5-second shutdown allowance, and clean up on errors/
interrupts as well as success. Live mode permits at most 48 outbound fetch
attempts (0.1.0 observed 20). In 0.2.0 image redirects are client-owned and
counted too; live mode was not rerun for this version.
Children use an isolated environment, no inherited host credentials/`.env`,
and only temporary DB/volumes. The parent stops each worker and its descendants,
verifies connection refusal and removes its runtime. Credentials/tokens are
not printed. Supply a disposable built host without extra injected plugins.
The harness itself does not modify that checkout.

The inspected host's Nest build copies `ignored-executables.txt` into
`dist/assets/assets/`, while ProgressService reads `dist/assets/`. The smoke
setup copies this existing host asset to the required **temporary generated** path.
No tracked upstream source/config is patched, and host assets are not shipped
in the plugin archive. Tests initialize the host AppModule before plugin
imports, matching the official loader and avoiding host cyclic-ESM import
order errors.

An unchanged host TypeORM upsert need not advance the provider's `updated_at`;
the E2E verifies fresh outbound page/JSON retrieval and persisted fields rather
than treating that timestamp as a refresh counter. Startup cascade saves can
also advance user metadata update counters without changing user values.
No host fork or provider workaround was added for these behaviors.

See [verification.md](verification.md) for executed results. Client GUI, NAS,
other databases/platforms, 0.2.0 on Node 24 and real cross-version upgrades remain
untested. The official Playnite integration does not automatically synchronize
these server metadata fields.
