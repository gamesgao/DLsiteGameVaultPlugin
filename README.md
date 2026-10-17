# DLsiteGameVaultPlugin

A native DLsite metadata provider for [GameVault](https://gamevau.lt/).

The native provider and plugin package are implemented. An extracted archive
has loaded and registered on an isolated GameVault 17.0.1 server. This is not
yet a release: full persisted metadata/media lifecycle and update/removal
acceptance are the next component.

## Goal

Recognize DLsite product IDs in game filenames, fetch covers and metadata, and make the results available through GameVault's existing metadata system. Games without an explicit ID can be searched and mapped manually.

- Native TypeScript/NestJS server plugin; no Playnite installation or sidecar service.
- ID-first matching instead of guessing the first title-search result.
- Shared server metadata and images using existing GameVault facilities.
- Readable components, behavior-focused FIRST unit tests, and end-to-end verification.

## Design and development

- [Core API and parsing decisions](docs/core.md)
- [HTTP client API, configuration and refresh behavior](docs/client.md)
- [Native provider, configuration, build and installation](docs/provider.md)
- [Executed verification](docs/verification.md)
- [Current design](docs/design.md)
- [Component delivery and acceptance](docs/implementation.md)
- [Testing principles](docs/testing.md)
- [Original Copilot planning document](docs/copilot-original-plan.md): preserved for provenance; the current design deliberately narrows speculative hardening and excessive abstraction.
- [Contribution guidelines](CONTRIBUTING.md)

### Developer commands

Use Node.js 24 LTS (or a compatible Node.js 26+ environment) and npm. Run from
the repository root:

```sh
npm ci
npm test
npm run test:coverage
npm run typecheck
npm run build
```

`npm run format:check` checks TypeScript/config/script formatting; `npm run format`
applies it. Dependencies are locked in `package-lock.json`. Tests are offline
and use synthetic fixtures, with coverage gates described in
[docs/testing.md](docs/testing.md).

`npm run build` emits the standalone identity/parsing library and HTTP client
in `dist/`, with ESM JavaScript and TypeScript declarations. After building, the opt-in
`npm run smoke:dlsite` checks two real public games, title search and a cover;
it is never run by the offline unit suite.

### Build and install the native plugin

Use a disposable compatible GameVault source checkout with its pnpm dependencies
installed. The script stages `.local/plugins/dlsite`, runs the host build, and
packages only the plugin plus private scraper dependencies:

```sh
npm run typecheck:provider -- --backend /path/to/gamevault-backend
npm run test:provider -- --backend /path/to/gamevault-backend
npm run test:provider:coverage -- --backend /path/to/gamevault-backend
npm run build:plugin -- --backend /path/to/gamevault-backend
npm run smoke:plugin -- --backend /path/to/gamevault-backend
```

Stop the destination server and extract `artifacts/dlsite-0.1.0.zip` into its
plugin volume:

```sh
unzip artifacts/dlsite-0.1.0.zip -d /path/to/plugin-volume
```

Restart GameVault with that volume configured as `VOLUMES_PLUGINS`. The
authenticated `GET /api/metadata/providers` should list `dlsite`.
Optional server environment configuration:

```sh
PLUGIN_GAMESGAO_DLSITE_LOCALE=ja_JP
PLUGIN_GAMESGAO_DLSITE_PRIORITY=20
PLUGIN_GAMESGAO_DLSITE_REQUEST_INTERVAL_MS=500
```

Automatic matching requires an unambiguous work ID in the title/filename.
Keyword and work-URL searches support manual mapping. NC handling and user
metadata precedence are unchanged. See [provider.md](docs/provider.md) for
supported locales, field/refresh semantics, separate adapter coverage,
host image limitations and complete installation/removal guidance.

## Credits and license

Plugin-owned code is MIT licensed. DLsite parsing rules are informed by [Mysterken/DLsiteMetadata](https://github.com/Mysterken/DLsiteMetadata), also MIT licensed. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

GameVault is a separate source-available project with its own license; this repository does not relicense or redistribute its backend. DLsite product descriptions and artwork retain their respective rights. This plugin does not download game binaries or bypass purchase requirements.
