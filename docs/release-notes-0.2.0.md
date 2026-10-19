# DLsiteGameVaultPlugin 0.2.0

Install `dlsite-0.2.0.zip` with its matching
`SHA256SUMS`, not a source archive. Target: GameVault 17.0.1 / `859d71e`.

## Required environment migration

Rename every explicitly configured old variable before restarting:

| 0.1.0 name (removed) | 0.2.0 name | Default |
| --- | --- | --- |
| `PLUGIN_GAMESGAO_DLSITE_LOCALE` | `PLUGIN_DLSITE_LOCALE` | `ja_JP` |
| `PLUGIN_GAMESGAO_DLSITE_PRIORITY` | `PLUGIN_DLSITE_PRIORITY` | `20` |
| `PLUGIN_GAMESGAO_DLSITE_REQUEST_INTERVAL_MS` | `PLUGIN_DLSITE_REQUEST_INTERVAL_MS` | `500` |

There are no legacy aliases; leaving old names silently results in the normal
defaults because they are no longer read. Users without explicit variables
need no configuration migration. GameVault's `VOLUMES_PLUGINS` is unchanged.
Stop the server, replace the whole plugin directory, remove its stale injected
copy where applicable, then restart; see [installation](https://github.com/gamesgao/DLsiteGameVaultPlugin/blob/v0.2.0/README.md).

## Optional plugin-only proxy

Set `PLUGIN_DLSITE_PROXY_URL=http://proxy.example:8080`, or an HTTPS proxy URI.
Optional authentication uses `http://USERNAME:PASSWORD@proxy.example:8080`;
percent-encode special characters in the username and password separately.
Supported schemes are **HTTP and HTTPS**, both using CONNECT for HTTPS
destinations. **SOCKS is not supported.**

The proxy must be reachable **from inside the GameVault container**.
`127.0.0.1` there refers to that container, not the host or another device.
Do not publish your credential-bearing URI in logs or issue reports.

One reusable plugin-owned Undici 7.30.1 agent handles HTML, redirects, JSON
ratings, manual search and cover/background downloads. IGDB and other host
requests are unaffected. No proxy setting means default transport; proxy
failure never falls back to direct access. **TLS certificate verification
remains enabled** for DLsite and HTTPS proxies; no insecure bypass is offered.
The agent closes on plugin shutdown and transport errors omit raw nested
causes that could contain proxy credentials.

GameVault still validates image bytes, writes files, owns media rows and
performs cleanup. Original image source URLs are explicitly persisted for
same-ID reuse after restart. Failure preservation and user metadata priority
remain intact.

## Evidence and limits

Local synthetic HTTPS/CONNECT fixtures verify routing and auth isolation;
the real packaged-plugin host harness verifies media database/file persistence,
same-ID reuse, failures, restart/replacement and removal. Fixtures are **not
live DLsite responses**. The coordinating agent independently reran all 244
tests, package and proxy/host checks locally. The updated Ubuntu 24.04 / Node
24.21.0 [hosted gates also passed](https://github.com/gamesgao/DLsiteGameVaultPlugin/actions/runs/39185840810),
and the downloaded build artifact passed SHA256 and ZIP integrity checks. No NAS, live-DLsite,
Docker, PostgreSQL, GUI or real 0.1.0-to-0.2.0 persisted upgrade test was run.
See [verification](https://github.com/gamesgao/DLsiteGameVaultPlugin/blob/v0.2.0/docs/verification.md) for actual commands, counts and coverage.
