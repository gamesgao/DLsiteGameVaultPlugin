# DLsiteGameVaultPlugin 0.1.0

First native DLsite metadata provider release for GameVault. Matches explicit
work IDs in filenames, supports manual title/ID/work-URL search and remapping,
and saves public metadata plus actual covers/backgrounds through the host.
User metadata wins; `(NC)` keeps its normal host behavior. No DLsite account,
sidecar, game download or Playnite runtime is required.

## Installation

Download the **`dlsite-0.1.0.zip`** and **`SHA256SUMS`** attachments, not GitHub's
source archives. Verify with `shasum -a 256 -c SHA256SUMS`. Back up the database
and media, stop GameVault, and extract the ZIP into `VOLUMES_PLUGINS`
(normally `/plugins`), yielding `dlsite/dlsite.plugin.module.js`. Restart and
check the authenticated provider list for exactly one enabled `dlsite`.
No dependency install is required inside the plugin.

默认日语 `ja_JP`。解压发布附件到服务端插件目录后重启；文件名有明确 ID 时
自动匹配，无 ID 时手动搜索映射。可设置
`PLUGIN_GAMESGAO_DLSITE_LOCALE=zh_CN`，但不是自动翻译。
详细安装、配置和排错见 [README](https://github.com/gamesgao/DLsiteGameVaultPlugin#readme)。

## Compatibility and evidence

Tested: **GameVault 17.0.1 / `859d71e`, Node 26.7.0, SQLite 3.53.4, native macOS**.
The package follows the official 17.0.1 ESM loader; it includes no NestJS,
backend implementation or native binaries. Do not assume compatibility with
older CommonJS hosts or every build sharing the 17.0.1 version string.

Local gates passed: 165 core/client tests and 59 adapter tests; line/function/
branch coverage respectively **99.72/100/97.37%** and **100/100/93.96%**;
typecheck, build and formatting passed. No CI result is claimed.
Opt-in acceptance exercised real authenticated API indexing of synthetic ZIPs,
two public Japanese RJ works, four saved JPEGs, manual remap, forced refresh,
user priority, injected network-failure preservation, restart, same-version
replacement and removal. See
[verification](https://github.com/gamesgao/DLsiteGameVaultPlugin/blob/main/docs/verification.md).

## Important limits

Node 24 LTS is intended but untested here. PostgreSQL, Linux/Windows hosts,
Docker, NAS, GUI and Playnite synchronization were not tested. Live checks do
not cover all ID prefixes, locales or historical catalog layouts. Series and
Features become prefixed tags; Icon has no native destination. Official
Playnite integration does not automatically synchronize this server metadata.

Replace the whole plugin directory while stopped. Persistent source/native
installs must also remove the copied `dist/src/modules/dlsite` or rebuild clean
host output; deleting only the volume folder can leave the plugin active.
Removal is not a data purge, and only same-version replacement was exercised.
DLsite availability, HTML, ratings and image URLs can change.
