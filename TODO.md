# TODO: Next Features & Improvements

## High Priority

- [x] **`cppkg rebuild`** — Reinstall all packages from scratch: `cppkg-cli clean && cppkg-cli install`
- [x] **`cppkg exec`** — Run a command with `CPPKG_INCLUDE_DIR` and `CPPKG_PROJECTS_DIR` set in PATH/CPATH/C_INCLUDE_PATH/CPLUS_INCLUDE_PATH
- [x] **`--json` output flag for `env`** — (completed)
- [x] **`--json` output flag for `list`** — (completed)
- [x] **`--json` output flag for `status`** — (completed)
- [x] **`--json` output flag** — Add `--json` to `search`, `audit`, `outdated`, `licenses`, `graph`, `clean`, `verify`, `diff`, `inspect`, `why`, `info`, `diagnose` for scripting/CI usage
- [x] **`verify --fix`** — Re-download packages that fail checksum verification
- [x] **`graph --depth <n>`** — Limit dependency graph to N levels of depth
- [x] **Write tests for new commands** — Tests added for `env --json`, `docs`, `home`, `bug`, `uninstall`, `rebuild`, `graph --json`, `clean --json`, `verify --json`, `diagnose`, `inspect --json`, `diff --json`, `audit --json`, `--json` variants
- [x] **Fix `inspect.test.ts`** — Regex assertions fail due to ANSI color codes — added `stripAnsi()` helper

## Medium Priority

- [x] **`cppkg docs`** — Open the documentation site in the default browser (like `npm docs`)
- [x] **`cppkg home`** — Open the project's GitHub homepage in the browser
- [x] **`cppkg bug`** — Open the GitHub issues page in the browser
- [x] **`cppkg pack`** — Create a distributable tarball/zip of the project (like `npm pack`)
- [x] **`--json` for `diff`** — Output diff as JSON for programmatic consumption
- [x] **`self-update` semver comparison** — Use proper semver comparison (`semver.gt`) instead of string equality
- [x] **`diff` full comparison** — Compares all manifest fields (versionRange, versionPolicy, prerelease, includePath, stripPrefix, patches, components, checksum) via `src/tools/diff.ts:addDiff()`
- [x] **`migrate import` dedup** — Deduplicate sources when importing
- [x] **`audit --json`** — Already logs to console; add `--json` for structured output
- [x] **`cache export/import` tests** — Add vitest tests for cache export/import

## Low Priority

- [x] **`cppkg uninstall`** — Alias for `remove` (user expectation from npm)
- [x] **`cppkg lockfile`** — Subcommands: `lockfile check` (verify integrity), `lockfile regenerate` (re-resolve all), `lockfile dedupe` (deduplicate transitive)
- [x] **`cppkg init --template <type>`** — Scaffolds `cmake-header-only`, `cmake-executable`, `cmake-library` with sample source files
- [x] **Shell completion for PowerShell** — `cppkg-cli completion powershell` generates `Register-ArgumentCompleter` script
- [x] **`--verbose` / `--quiet` global flags** — Control log output verbosity
- [x] **Build from source with Docker** — `cppkg-cli build --docker` and `compile --docker` already implemented
- [x] **`cppkg publish --dry-run`** — `--dry-run` flag shows repo, tag, archive name without creating release

## Code Quality & Technical Debt

- [x] **Extract duplicate `sourceRequestsEqual` / `getManifestSourceRequest`** — Extracted to `src/tools/dep-utils.ts`
- [x] **Custom error classes** — `CppkgError`, `LockfileError`, `ManifestError`, `DownloadError`, `ConfigError` in `src/tools/errors.ts`; adopted in `lockfile.ts` and `manifest.ts`
- [x] **CI: add code coverage upload** — Upload `coverage/lcov.info` to Codecov in GitHub Actions
- [x] **CI: auto-publish to npm** — GitHub Actions workflow (`publish.yml`) for npm publishing on release
- [x] **`.github/ISSUE_TEMPLATE`** — Add issue templates for bug reports and feature requests
- [x] **Manpage auto-generation** — Generated in `scripts/generate-docs.ts` via `generateManPage()` as `man/cppkg-cli.1` (824-line roff manpage)
- [x] **ESLint: enable more rules** — Added `plugin:@typescript-eslint/stylistic` and 7 additional rules
- [x] **Prettier: check in CI** — `npm run format:check` step added to `test.yml`
- [x] **Benchmark suite** — `test/benchmarks.test.ts` with `resolveInputSource` tests; run via `npx vitest bench --run test/benchmarks.test.ts`
