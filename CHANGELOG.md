# Changelog

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
