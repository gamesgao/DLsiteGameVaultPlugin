# Native GameVault provider

The plugin targets the inspected GameVault **17.0.1** ESM backend. Its default
export is `DlsitePluginModule`; Nest imports the host `MetadataModule` and
`MediaModule`, and registers one `DlsiteMetadataProviderService` with slug
`dlsite`. No host entities, NestJS, TypeORM or `reflect-metadata` are bundled.

## Configuration

Set environment variables on the **GameVault server process** before startup:

```sh
PLUGIN_GAMESGAO_DLSITE_LOCALE=ja_JP
PLUGIN_GAMESGAO_DLSITE_PRIORITY=20
PLUGIN_GAMESGAO_DLSITE_REQUEST_INTERVAL_MS=500
```

All are optional. Locale supports `ja_JP`, `en_US`, `zh_CN`, `zh_TW`; priority
is a safe integer and must not collide with another registered provider's
priority (IGDB defaults to 10). Higher priorities take precedence in the host
merge; user metadata still wins. Pacing is 0–60,000 ms between the shared
client's HTTP requests. Other timeout/retry/cache settings use the existing
[client defaults](client.md); no separate provider policy layer is introduced.
Invalid settings fail construction. Remove the plugin to disable it.
These are plugin environment variables, not additions to the host YAML schema.

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
existing mapping UI/API with provider `dlsite` and the returned work ID.

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
DLsite records; no direct database repository/core patch is added.
Unknown scalar values keep prior same-ID values. Missing **or empty** optional
relation/gallery sections retain their last useful values: a parser's empty
section is not reliable deletion evidence. Nonempty sections replace their
group; topical tags, series and features update independently. Website links
are deduplicated with previous same-ID links so an absent optional Ci-en link
does not erase a known one. Publishers are
never fabricated. A different remapped ID never inherits the old product's
relations, scalars or images.

### Images

Use host `MediaService.downloadByUrl(source)` directly: it saves `source_url`,
validates actual file bytes against host-supported formats, writes the file and
returns persisted `Media`. Unlike `upload(file, username)`, it needs no uploader
account or synthetic Multer upload. Only HTTPS `img.dlsite.jp` source URLs
without credentials/nonstandard ports are accepted. The host owns the download
timeout, redirect behavior and supported format list; this is not a new
redirect-security or media-GC implementation. Client pacing covers page/JSON/
search traffic, not the host's image downloads.

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

Output: `artifacts/dlsite/` and `artifacts/dlsite-0.1.0.zip`. The directory has
`dlsite.plugin.module.js`, native ESM adapter files, a private core/scraper
bundle, declarations, license notices and this installation guide. Only
private pure-JS dependencies are bundled; the host TypeScript compiler emits
decorator metadata using its own installed NestJS and entity types.

Stop the destination server; extract the archive into its configured plugin
volume (default `/plugins`):

```sh
unzip artifacts/dlsite-0.1.0.zip -d /path/to/plugin-volume
# Result: /path/to/plugin-volume/dlsite/dlsite.plugin.module.js
```

Start GameVault with `VOLUMES_PLUGINS` pointing to that volume. Archives are
**not** loaded directly. In official source-development mode,
`VOLUMES_PLUGINS=./.local/plugins` loads the compiled staged copy under `dist`.
Check the authenticated provider-list API for `dlsite`.

The production loader copies plugins into `dist/src/modules`. To update,
replace the complete `dlsite` folder while stopped, not a mix of old/new files.
For removal on a persistent source installation, also remove the copied
`dist/src/modules/dlsite` directory (or rebuild clean host output). Do not
remove the host's shared modules or dependency directories.

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
```

Provider tests use the separate `vitest.provider.config.ts`, real provider,
mapper, client/parsers and host base/entity/Nest classes. Only host persistence/
media boundaries and network responses are substituted. The wrapper compiles
the staged plugin/host first, then uses that host's runtime modules; the test
transform emits decorator metadata. Adapter coverage includes **every**
`plugin/**/*.ts` file with the same 90% lines/functions/statements and 85%
branches gates as the core. Default core tests do not silently stand in for
these host-aware tests.

`smoke:plugin` extracts the ZIP into a fresh OS-temporary plugin volume, uses
the real production plugin loader and AppModule, migrates a fresh SQLite DB,
registers/logs in a temporary first-user admin, and checks the authenticated
provider-list API. It binds only `127.0.0.1` on an ephemeral port, has a
60-second deadline, closes the server and verifies connection refusal, then
deletes its runtime volumes and injected plugin copy. Credentials are never
printed. The host checkout must be disposable and already built; no extra
plugins may be present in its production injection directory.

The inspected host's Nest build copies `ignored-executables.txt` into
`dist/assets/assets/`, while ProgressService reads `dist/assets/`. The smoke
setup copies this existing host asset to the required **generated** path.
No tracked upstream source/config is patched, and host assets are not shipped
in the plugin archive. Tests initialize the host AppModule before plugin
imports, matching the official loader and avoiding host cyclic-ESM import
order errors.

See [verification.md](verification.md) for actual executed results. Registration
is not full lifecycle acceptance: persisted mapping/remapping, failure
preservation across host saves/restarts, updates/removal and client GUI behavior
still require the next delivery component.
