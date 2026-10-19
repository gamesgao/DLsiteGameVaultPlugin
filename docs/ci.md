# GitHub Actions build and release

`.github/workflows/build-release.yml` has one build job and a dependent release
job. Version 0.2.0 extends its offline gates with scoped-proxy/media lifecycle
fixtures. It does not replace the published `v0.1.0` release; publication is
still a separate maintainer-owned matching-tag action.

## Triggers and gates

The 0.2.0 proxy/media gates have passed on a real hosted runner:
[run 39185840810](https://github.com/gamesgao/DLsiteGameVaultPlugin/actions/runs/39185840810).
All 244 tests, HTTP/HTTPS proxy smoke, packaged-host lifecycle and artifact
verification succeeded. Historical first-run notes below refer to 0.1.0.

Every branch push, pull request and manual `workflow_dispatch` runs the same
build. A `v*` tag push also runs it, but any tag must equal `v` followed by the
checked-out `package.json` version. A mismatch fails before dependency install.
Manual dispatch is always build-only, even when a tag is selected.

The runner is `ubuntu-24.04`, with Node 24 and pnpm 11.7.0. The backend is
checked out from `Phalcode/gamevault-backend` at exactly
`859d71ef46f3a1f00a236e5d4c7dbde1eeba02b3` (17.0.1), not a moving branch or
version tag. npm and pnpm use their committed lockfiles. Native build tools,
Python 3, OpenSSL, `zip`, `unzip`, `ps` (procps) and 7-Zip are installed explicitly.
The upstream pnpm build allowlist permits `better-sqlite3` and `bcrypt`;
install scripts are not disabled. No tracked upstream code is patched.

Gates run formatting, core/provider type checks, and both existing FIRST test
suites with their unchanged coverage thresholds (90% lines/functions/statements,
85% branches). Core coverage runs first so it does not erase adapter reports.
The plugin is built through the pinned host, then its **actual ZIP** is
extracted and registered using the real loader, temporary SQLite and the
authenticated localhost API. `smoke:proxy` then exercises real HTTP/HTTPS
CONNECT against local HTTPS fixtures; `e2e:proxy` verifies the actual packaged
plugin's media persistence/reuse/failure/restart lifecycle through the proxy.
Both are bounded, offline and use temporary certificates/credentials only.
Checksum and ZIP integrity must also pass.
The normal smoke has a zero live-fetch budget; neither `e2e:host` nor
`smoke:dlsite` runs in Actions. Those remain explicit local live checks, not
public-site-dependent release gates.

Successful builds retain `plugin-package` for 14 days: `dlsite-VERSION.zip`,
`SHA256SUMS` and the prepared release notes. Download and extract this Actions
artifact wrapper first; the inner `dlsite-VERSION.zip` is the installable
plugin. `coverage` is retained separately for 14 days, also when tests fail
after generating reports. A failed gate cannot publish a release.

## Publishing a future version

For an intentional future plugin release, update `package.json` and
`package-lock.json` together, update installation/version documentation, and
preferably add `docs/release-notes-VERSION.md`. The package manifest inside the
ZIP, ZIP filename, checksum entry and default smoke path all use the root
package version. Release notes use the matching document when present;
otherwise a short installation/README link is generated.

Only a **push of an existing matching `vVERSION` tag to the canonical
repository** can start the release job, after the build job succeeds.
The release job downloads that run's immutable artifact by its ID and
rechecks `SHA256SUMS`; it does not check out source, install dependencies or
rebuild. It attaches only the tested ZIP and checksum file. Versions containing
a hyphen are marked as prereleases.

`gh release create --verify-tag` never creates a missing tag and fails if a
published release already exists. There is no asset upload with `--clobber`,
existing-release edit/deletion or automatic version bump. Re-running a
published tag is not an update mechanism. If publication fails, inspect the failure and any
unfinished draft before deciding on manual recovery; the workflow does not
silently replace an existing release. Same-tag release jobs are serialized.

All jobs default to `contents: read`; only the release job requests
`contents: write`. Its sole credential is the built-in `GITHUB_TOKEN`, scoped
to the release command. Checkouts do not persist credentials. Pull requests
use `pull_request`, never `pull_request_target`; no PR title/body/branch text
is interpolated into shell code. No PAT, DLsite credentials or other external
secret is required.

## Historical 0.1.0 remote acceptance

[Hosted run 39014813257](https://github.com/gamesgao/DLsiteGameVaultPlugin/actions/runs/39014813257)
passed on Ubuntu 24.04 / Node 24.21.0: all 224 tests and coverage gates,
native dependencies, packaging, one-provider/zero-live-fetch registration and
artifact upload succeeded. The coordinating agent downloaded `plugin-package`
and independently verified its SHA256 and ZIP integrity. Release was correctly
skipped for this branch push; no existing release was changed.

This is not a hosted result for the new 0.2.0 proxy gates. Their actual local
results and limitations are recorded in [verification.md](verification.md).

Publishing workflow files requires an authorized credential (for GitHub CLI
OAuth, the `workflow` scope). Use the normal local authorization flow if a
push is rejected; never add a PAT to the workflow as a workaround.

The branch push itself triggers build-only acceptance. Once the workflow is
on the default branch, it can also be dispatched without inputs:

```sh
gh workflow run build-release.yml --ref main
gh run list --workflow build-release.yml --limit 5
gh run watch RUN_ID --exit-status
gh run download RUN_ID --name plugin-package --dir /path/to/empty/download
# In that download directory:
shasum -a 256 -c SHA256SUMS
unzip -tq dlsite-0.2.0.zip
```

Check that all build gates passed, the registration smoke reports one DLsite
provider and zero live requests, both artifacts exist, and the release job
was skipped. Record the actual run URL and result in `docs/verification.md`.
Do not push/recreate `v0.1.0` or publish a throwaway version just to test CI.
The hosted run verifies Ubuntu dependencies, native binding installation,
Actions execution and build artifact transfer. Tag-triggered release publication
has not yet been exercised; it will run for the next intentional matching
version tag. This is not evidence of Linux live-DLsite lifecycle, NAS, Docker,
PostgreSQL or GUI compatibility.
