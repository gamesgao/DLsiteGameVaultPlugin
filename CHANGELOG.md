# Changelog

## 0.2.0 — scoped proxy and environment migration (prepared, unpublished)

- Rename all runtime variables to `PLUGIN_DLSITE_LOCALE`,
  `PLUGIN_DLSITE_PRIORITY` and `PLUGIN_DLSITE_REQUEST_INTERVAL_MS`; defaults
  remain `ja_JP`, `20`, `500`. Existing explicit
  `PLUGIN_GAMESGAO_DLSITE_*` settings **must be renamed**; no legacy aliases.
  GameVault's `VOLUMES_PLUGINS` is unchanged.
- Add optional `PLUGIN_DLSITE_PROXY_URL`: HTTP/HTTPS proxy URI with optional
  percent-encoded username/password; no SOCKS. Use a proxy address reachable
  from the GameVault container; its `127.0.0.1` is not the Docker host.
- A private pinned Undici agent routes product HTML, redirects, ratings JSON,
  manual search and image bytes together, without changing IGDB/global fetch.
  Unset preserves default transport; failures never fall back to direct.
  Preserve destination/proxy TLS verification; no insecure TLS option.
- Keep proxy auth on CONNECT only and omit credential-bearing transport
  causes from errors. Reuse the agent and close it with the plugin.
- Download images through the client, retain GameVault upload validation,
  storage and media rows, and explicitly persist original source URLs using
  host TypeORM. Preserve available same-ID images and cleanup on failure.
- Add local CONNECT/HTTPS fixture smoke and actual packaged-host media/
  restart acceptance to offline CI. No live DLsite or NAS verification is
  claimed for 0.2.0; see [verification](docs/verification.md).

## 0.1.0 — first release

- Native ESM `dlsite` metadata provider targeting GameVault 17.0.1.
- Explicit-ID automatic matching, manual keyword/ID/work-URL search and remap.
- Public metadata retrieval, Markdown descriptions, native relations and actual
  host-managed covers/backgrounds; Japanese default with four configurable locales.
- Same-ID optional-field/image preservation, bounded HTTP retries/cache/pacing,
  and existing host NC/user-priority semantics.
- Plugin-only ZIP with bundled private JavaScript dependencies, licenses and
  SHA-256 checksum; no bundled backend, NestJS or native runtime.
- Offline core/provider behavior suites and opt-in localhost lifecycle acceptance
  using synthetic archives, real DLsite retrieval and isolated SQLite.

Tested on native macOS, Node 26.7.0, GameVault 17.0.1 / `859d71e`, SQLite 3.53.4.
Only two Japanese RJ works were live verified. Other hosts/platforms/databases,
Node 24, NAS and GUI/Playnite behavior are not certified. See
[verification](docs/verification.md) for exact results and limits.
