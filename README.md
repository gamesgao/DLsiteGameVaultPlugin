# DLsiteGameVaultPlugin

A native, server-side [GameVault](https://gamevau.lt/) metadata provider for
DLsite. It matches explicit work IDs in archive filenames, retrieves public
metadata and saves covers/backgrounds through GameVault. No sidecar, DLsite
account or Playnite installation is required.

**Compatibility:** tested against GameVault **17.0.1, revision `859d71e`**,
Node **26.7.0**, SQLite **3.53.4**, on native macOS. This is an ESM plugin for
the 17.0.1 plugin API, not for older CommonJS hosts. Version **0.2.0** adds a
plugin-scoped HTTP(S) proxy and an environment-prefix migration. Its local
acceptance uses synthetic HTTPS/CONNECT fixtures, not live DLsite.
Historical 0.1.0 hosted Ubuntu / Node 24 results are recorded separately. Other host revisions,
PostgreSQL, Docker, NAS and client GUIs are untested; see
[verification](docs/verification.md).

## Install

Back up your GameVault database and media first. Plugins execute inside the
server process; install only code you trust.

1. Download **`dlsite-0.2.0.zip`** and **`SHA256SUMS`** from
   [Releases](https://github.com/gamesgao/DLsiteGameVaultPlugin/releases).
   Use the compiled ZIP attachment, **not** GitHub's “Source code” archives.
   If no release is published yet, build it using the commands below.
2. Verify the checksum, stop GameVault, and extract into its plugin volume:

   ```sh
   shasum -a 256 -c SHA256SUMS
   unzip dlsite-0.2.0.zip -d /path/to/plugin-volume
   # Must exist: /path/to/plugin-volume/dlsite/dlsite.plugin.module.js
   ```

3. Set the server's `VOLUMES_PLUGINS` to that volume (default `/plugins`) and
   restart. If using a container, this is the **inside-container** volume path.
   No `npm install` is needed inside the extracted plugin. The authenticated
   `GET /api/metadata/providers` must contain exactly one enabled `dlsite`.

This follows the [official plugin installation layout](https://gamevau.lt/docs/server-docs/plugins/).
Do not leave the ZIP unextracted or introduce an extra `dlsite-0.2.0/` wrapper.
The release root is `dlsite/`, containing the ESM module, adapter, private
scraper bundle, declarations, documentation and licenses. Host NestJS,
TypeORM, native binaries and backend implementation are not included.

## Configuration

Optional environment variables on the **server process**, read at startup:

| Variable | Default | Meaning |
| --- | --- | --- |
| `PLUGIN_DLSITE_LOCALE` | `ja_JP` | `ja_JP`, `en_US`, `zh_CN`, `zh_TW`; display locale, not automatic translation |
| `PLUGIN_DLSITE_PRIORITY` | `20` | Unique integer provider priority; higher wins, user metadata still wins |
| `PLUGIN_DLSITE_REQUEST_INTERVAL_MS` | `500` | 0–60,000 ms between all plugin requests, including images |
| `PLUGIN_DLSITE_PROXY_URL` | unset | Optional `http://` or `https://` proxy URI; optional percent-encoded username/password |

**Migration from 0.1.0:** explicitly configured
`PLUGIN_GAMESGAO_DLSITE_LOCALE`, `PLUGIN_GAMESGAO_DLSITE_PRIORITY` and
`PLUGIN_GAMESGAO_DLSITE_REQUEST_INTERVAL_MS` **must be renamed** to the respective
`PLUGIN_DLSITE_*` names above. Old names are no longer read; there are no aliases.
Without explicit settings the defaults are unchanged. GameVault's own
`VOLUMES_PLUGINS` is unchanged.

For example, set `PLUGIN_DLSITE_PROXY_URL=http://proxy.example:8080` on the server.
Authenticated syntax is `http://USERNAME:PASSWORD@proxy.example:8080`;
percent-encode special characters in each credential component. Both HTTP
and HTTPS proxies tunnel HTTPS destinations with CONNECT. SOCKS is unsupported.
The address must be reachable **from the GameVault container**: `127.0.0.1`
means that container, not the Docker host or another device.

One plugin-owned transport handles product HTML, redirects, JSON supplements,
manual searches and cover/background bytes. It does not change global fetch,
IGDB or other host requests. Unset means the existing default fetch transport;
proxy failure never falls back to direct access. TLS certificate verification
remains enabled for destinations and HTTPS proxies; there is no insecure knob.
Transport errors omit raw credential-bearing causes; protect the environment
variable itself like any other secret.

These are not host YAML keys. Japanese is the default because much of the
catalog is Japanese; changing locale does not translate unavailable fields.
Only Japanese retrieval for two RJ games has been live verified. Configuration,
cache, timeout and field details: [provider](docs/provider.md), [client](docs/client.md).

## Normal use and manual mapping

Put your legally obtained archives in the normal GameVault files volume.
The host indexes them; DLsite uses the filename/title ID rather than guessing:

```text
RJ141995 (W_P).zip                  -> automatic ID match
[RJ150726] My Game (W_P).zip         -> automatic ID match
My Game (W_P).zip                   -> no automatic DLsite match; map manually
RJ141995 (NC) (W_P).zip              -> host skips automatic metadata refresh
RJ141995 RJ150726 (W_P).zip          -> conflicting IDs; map manually
```

`(W_P)` is GameVault's Windows-portable type override; use the correct type
for your own archive. The plugin does not rename or modify files. Six/eight
digit RJ, VJ, BJ and RE identity forms are parser-tested, not all live verified.

In GameVault's metadata mapping controls, select **DLsite**, search by title,
complete ID or work URL, inspect candidates, then select the correct ID.
Keyword search is manual only, one page per section, and can include non-games.
For an API client with EDITOR or ADMIN authentication, the actual endpoints are:

```text
GET /api/metadata/providers/dlsite/search?query=RJ141995
PUT /api/games/GAME_ID
Content-Type: application/json

{"mapping_requests":[{"provider_slug":"dlsite","provider_data_id":"RJ141995"}]}
```

Repeat the mapping to the same ID to fetch fresh metadata; use a different ID
to remap. Normal reindexing respects GameVault's metadata TTL and `(NC)` policy,
so it is not a forced refresh. User-entered metadata has priority over provider
data. Failed fetches do not replace a valid snapshot with an empty result;
missing optional fields and available same-ID images are retained.

Supported fields: title, Markdown description, date, circle/brand as developer,
genres, topical tags, 0–100 rating, age, website/gallery links, cover and first
gallery image as background. No invented publisher. **Series** and **Features**
become `Series: …` / `Features: …` tags; **Icon** has no native destination.
The official Playnite integration **does not automatically synchronize this
server metadata into Playnite**; this plugin does not change that integration.

## Updating, removing and troubleshooting

Stop GameVault before replacing the **whole** `dlsite/` directory. Back up first;
do not overlay mixed versions. On a persistent source/native deployment, also
remove only the copied `dist/src/modules/dlsite` directory, or rebuild clean
host output. The production loader copies plugins there and does **not** remove
stale copies. Removing only the volume folder can leave the plugin loaded.
After removal/restart, confirm `dlsite` is absent from the provider list.
Removal is not a metadata/media purge; later host merges and garbage collection
remain host-owned. Only same-version replacement has been tested.

| Symptom | Check |
| --- | --- |
| DLsite missing, or duplicate registration | Extraction root, plugin volume, ESM-compatible host, stale injected copies, duplicate priority (IGDB normally uses 10); read server startup logs |
| No automatic match | Explicit unambiguous ID, archive scanned by host, `(NC)`, metadata TTL; use manual mapping |
| Text stays unchanged | User overrides win; reindex is not forced refresh; map the same ID again |
| HTTP 403/429, timeout, unavailable product | Check public DLsite reachability from the server; retry later; no login/access-block bypass is provided |
| Images missing | Reachability of `img.dlsite.jp` through the same configured proxy, writable media volume, host-supported formats; inspect server media errors |
| Proxy connection fails | HTTP(S) scheme, credentials, trusted certificates and reachability from inside the container; no direct fallback |
| Source-host smoke fails on an asset | The harness prepares the existing `ignored-executables.txt` in **temporary generated output**; see [provider notes](docs/provider.md) |

## 中文快速开始

这是 **GameVault 服务端插件**，不是 Playnite 插件。先备份数据库和媒体目录，
停止服务，将发布附件 `dlsite-0.2.0.zip` 解压到 `VOLUMES_PLUGINS`，
确保存在 `dlsite/dlsite.plugin.module.js`，然后重启。不要直接放 ZIP，
也不要下载 GitHub 的源码压缩包当成插件安装。

文件名包含明确的 `RJ141995` 等作品 ID 时自动匹配；没有 ID 的游戏请在
元数据映射中选择 DLsite，搜索名称/ID/作品网址并手动确认。`(NC)` 保持
GameVault 原有的跳过自动刷新行为。默认语言是日语 `ja_JP`；可设置
`PLUGIN_DLSITE_LOCALE=zh_CN`，但不保证所有字段有中文。
手工填写的数据优先；Series/Features 保存为标签，Icon 无对应字段。
官方 Playnite 集成不会自动同步这里的服务端元数据。
从 0.1.0 升级时，必须把显式设置的 `PLUGIN_GAMESGAO_DLSITE_*` 三个旧变量
改名为 `PLUGIN_DLSITE_*`；旧名称不再生效，`VOLUMES_PLUGINS` 不变。
可选 `PLUGIN_DLSITE_PROXY_URL` 支持 HTTP/HTTPS 代理及用户名密码，不支持 SOCKS。
网页、JSON、手动搜索和图片统一走插件自己的代理，不影响 IGDB；失败不直连，
保留 TLS 证书校验。代理必须能从容器内访问，容器内 `127.0.0.1` 不是宿主机。
0.2.0 使用本机合成夹具验证，**没有访问在线 DLsite、NAS 或真实游戏库**。

## Build and local gates

Run these commands from a **source checkout of this repository**, not the
extracted plugin. Use npm and a disposable compatible backend checkout with
its pnpm dependencies already installed. `zip`, `unzip` and `ps` are required for packaging/native
acceptance. Do not point the build at a running production checkout: it stages
`.local/plugins/dlsite` and replaces the host's generated `dist`.

```sh
npm ci
npm test
npm run test:coverage
npm run typecheck
npm run build
BACKEND=/path/to/disposable/gamevault-backend
npm run typecheck:provider -- --backend "$BACKEND"
npm run test:provider -- --backend "$BACKEND"
npm run test:provider:coverage -- --backend "$BACKEND"
npm run format:check
npm run build:plugin -- --backend "$BACKEND"
npm run smoke:plugin -- --backend "$BACKEND"  # registration, no DLsite retrieval
npm run smoke:proxy                          # local HTTP/HTTPS CONNECT fixtures
npm run e2e:proxy -- --backend "$BACKEND"     # packaged host + local fixtures
npm run e2e:host -- --backend "$BACKEND"      # opt-in real live lifecycle
npm run smoke:dlsite                         # opt-in bounded client-only live check
```

The archive and checksum are in `artifacts/`. Unit suites are offline, with
separate full core/adapter coverage gates. Host E2E uses three tiny synthetic
ZIPs, a disposable admin, fresh SQLite/volumes and ephemeral localhost ports.
It checks API mapping, actual saved media, failure preservation, restart,
replacement and removal, then stops its processes and deletes its runtime.
No Docker is required; proxy fixtures additionally require `openssl`.
Detailed commands/bounds: [testing](docs/testing.md).

## Automatic builds and releases

[GitHub Actions](.github/workflows/build-release.yml) runs offline tests,
coverage, type checks, packaging, extracted-plugin registration and local
proxy/media lifecycle fixtures on branch
pushes, pull requests and manual dispatch. It targets Ubuntu 24.04 / Node 24
with the exact compatible GameVault revision above, and retains the tested
ZIP/checksum bundle and coverage reports for 14 days. Live DLsite E2E remains
local and opt-in. [The historical 0.1.0 hosted run passed](https://github.com/gamesgao/DLsiteGameVaultPlugin/actions/runs/39014813257);
the downloaded package checksum and ZIP integrity were independently verified.

Only a pushed `vVERSION` tag matching `package.json` can publish, after all
gates pass, using the exact tested artifact. Manual runs never release, and
existing releases/assets are not replaced. Version 0.2.0 is prepared here,
not tagged or published; its updated hosted gates have not run in this session.
See [CI and release instructions](docs/ci.md)
for first-run acceptance, permissions and future version/tag preparation.

[Design](docs/design.md) · [Original plan](docs/copilot-original-plan.md) ·
[Core API](docs/core.md) · [Verification](docs/verification.md) ·
[Changelog](CHANGELOG.md) · [Contributing](CONTRIBUTING.md)

## License

Plugin-owned code is MIT licensed. Parsing rules are informed by
[Mysterken/DLsiteMetadata](https://github.com/Mysterken/DLsiteMetadata) (MIT);
see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). GameVault is a separate
source-available project, not redistributed or relicensed here. DLsite artwork
and descriptions retain their respective rights. No game binaries, purchase
bypass, full product-page dumps or artwork are shipped.
