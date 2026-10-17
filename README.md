# DLsiteGameVaultPlugin

A native DLsite metadata provider for [GameVault](https://gamevau.lt/).

This project is being implemented component by component. It is not yet a released plugin; tested installation instructions and compatibility evidence will be added before the first release.

## Goal

Recognize DLsite product IDs in game filenames, fetch covers and metadata, and make the results available through GameVault's existing metadata system. Games without an explicit ID can be searched and mapped manually.

- Native TypeScript/NestJS server plugin; no Playnite installation or sidecar service.
- ID-first matching instead of guessing the first title-search result.
- Shared server metadata and images using existing GameVault facilities.
- Readable components, behavior-focused FIRST unit tests, and end-to-end verification.

## Design and development

- [Current design](docs/design.md)
- [Component delivery and acceptance](docs/implementation.md)
- [Testing principles](docs/testing.md)
- [Original Copilot planning document](docs/copilot-original-plan.md): preserved for provenance; the current design deliberately narrows speculative hardening and excessive abstraction.
- [Contribution guidelines](CONTRIBUTING.md)

## Credits and license

Plugin-owned code is MIT licensed. DLsite parsing rules are informed by [Mysterken/DLsiteMetadata](https://github.com/Mysterken/DLsiteMetadata), also MIT licensed. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

GameVault is a separate source-available project with its own license; this repository does not relicense or redistribute its backend. DLsite product descriptions and artwork retain their respective rights. This plugin does not download game binaries or bypass purchase requirements.
