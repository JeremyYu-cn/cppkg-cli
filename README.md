# cppkg-cli

`cppkg-cli` downloads C/C++ packages from GitHub, Gitee, or remote zip archives into a project-local package directory. It can install reusable headers into a shared include tree, or fall back to full-project extraction when a package is not header-only.

[简体中文](./docs/README.zh-CN.md)

## Install

```bash
npm install -g cppkg-cli
```

For local development inside this repository:

```bash
npm install
npm run dev -- --help
```

## Quick Start

Create a project manifest:

```bash
cppkg-cli init
```

Add dependencies to `cppkg.json`:

```json
{
  "dependencies": {
    "json": "https://github.com/nlohmann/json",
    "fmt": {
      "source": "https://github.com/fmtlib/fmt",
      "tag": "11.2.0"
    },
    "lvgl": {
      "source": "https://github.com/lvgl/lvgl",
      "branch": "master",
      "fullProject": true
    }
  }
}
```

Install everything in the manifest:

```bash
cppkg-cli install
```

Install only selected manifest entries:

```bash
cppkg-cli install json fmt
```

With the default config, installed files are written under `./cpp_libs`, and package metadata is written to `./cpp_libs/deps.json`.

## Commands

| Command | Purpose |
| --- | --- |
| `cppkg-cli init` | Create `./cppkg.json`. |
| `cppkg-cli install [selector...]` | Install all manifest dependencies, or selected manifest entries. |
| `cppkg-cli get <source-url...>` | Install one or more package sources directly. |
| `cppkg-cli list` | List packages tracked in `deps.json`. |
| `cppkg-cli update [selector]` | Update one tracked package, or all packages when no selector is provided. |
| `cppkg-cli remove <selector>` | Remove one tracked package. |
| `cppkg-cli config <subcommand>` | Manage project-level defaults in `./cppkg.config.json`. |

Run any command with `--help` for its current options.

## Manifest

`cppkg.json` supports a name-to-source map:

```json
{
  "dependencies": {
    "json": "https://github.com/nlohmann/json",
    "fmt": {
      "source": "https://github.com/fmtlib/fmt",
      "tag": "11.2.0"
    }
  }
}
```

It also supports an array form:

```json
{
  "dependencies": [
    "https://github.com/nlohmann/json",
    {
      "name": "lvgl",
      "source": "https://github.com/lvgl/lvgl",
      "branch": "master",
      "fullProject": true
    }
  ]
}
```

Manifest object fields:

| Field | Type | Description |
| --- | --- | --- |
| `source` | string | GitHub repo URL, GitHub API repo URL, Gitee repo URL, Gitee API repo URL, or remote zip URL. |
| `name` | string | Optional selector name for array entries. In map form, the map key is the dependency name. |
| `tag` | string | Install a specific release tag, or repository tag when no matching release exists. |
| `branch` | string | Install a specific repository branch. |
| `prerelease` | boolean | Allow prerelease entries when resolving the latest release. |
| `fullProject` | boolean | Skip include detection and install as a full project. |

`tag` and `branch` cannot be used together for the same dependency.

## Direct Install

Use `get` when you want to install a source without editing `cppkg.json`.

```bash
cppkg-cli get https://github.com/nlohmann/json
cppkg-cli get https://github.com/nlohmann/json https://github.com/fmtlib/fmt
```

Supported source formats:

```bash
cppkg-cli get https://github.com/nlohmann/json
cppkg-cli get https://api.github.com/repos/nlohmann/json
cppkg-cli get https://gitee.com/mirrors/jsoncpp.git
cppkg-cli get https://gitee.com/api/v5/repos/mirrors/jsoncpp
cppkg-cli get https://example.com/downloads/my-sdk.zip
```

Version and install-mode options:

```bash
cppkg-cli get https://github.com/nlohmann/json --tag v3.12.0
cppkg-cli get https://github.com/lvgl/lvgl --branch master
cppkg-cli get https://github.com/owner/repo --prerelease
cppkg-cli get https://github.com/lvgl/lvgl --full-project
```

## Manage Packages

List installed packages:

```bash
cppkg-cli list
```

Update all packages, or one package:

```bash
cppkg-cli update
cppkg-cli update json
cppkg-cli update json --tag v3.12.0
cppkg-cli update lvgl --branch master
cppkg-cli update lvgl --full-project
```

Remove one package:

```bash
cppkg-cli remove json
```

Selectors accepted by `install`, `update`, and `remove`:

| Selector | Example |
| --- | --- |
| Manifest dependency name or installed package name | `json` |
| Repository path | `/nlohmann/json` |
| Owner/repository | `nlohmann/json` |
| Recorded source URL | `https://github.com/nlohmann/json` |

`install` selectors are matched against entries in `cppkg.json`. `update` and `remove` selectors are matched against installed records in `deps.json`.

## Config

Project-level config is stored in `./cppkg.config.json`.

```bash
cppkg-cli config set proxy http://127.0.0.1:7890
cppkg-cli config set packageRootDir third_party/cppkg
cppkg-cli config set includeDirName include
cppkg-cli config set projectsDirName projects
cppkg-cli config get packageRootDir
cppkg-cli config list
```

Supported config keys:

| Key | Default | Description |
| --- | --- | --- |
| `proxy` | empty | Default proxy for HTTP and HTTPS requests. |
| `httpProxy` | empty | Default HTTP proxy. |
| `httpsProxy` | empty | Default HTTPS proxy. |
| `packageRootDir` | `cpp_libs` | Root directory for installed package data. |
| `includeDirName` | `include` | Shared include directory under `packageRootDir`. |
| `projectsDirName` | `projects` | Full-project directory under `packageRootDir`. |
| `depsFileName` | `deps.json` | Installed package metadata file under `packageRootDir`. |

CLI proxy flags override config values:

```bash
cppkg-cli get https://github.com/nlohmann/json \
  --http-proxy http://127.0.0.1:7890 \
  --https-proxy http://127.0.0.1:7890
```

## Output Layout

Default layout:

```text
your-project/
├── cppkg.json
└── cpp_libs/
    ├── deps.json
    ├── include/
    │   ├── nlohmann/
    │   │   └── json.hpp
    │   └── fmt/
    │       └── format.h
    └── projects/
        ├── espruino_Espruino/
        └── mirrors_jsoncpp/
```

Install behavior:

- Repository sources are checked for published releases through the GitHub or Gitee API.
- If a release archive exposes a usable `include` directory, headers are merged into the configured include directory.
- If the release archive does not expose a usable `include` directory, the CLI retries with the repository archive.
- If no usable include directory is found, the package is installed as a full project under the configured projects directory.
- Repositories without releases and direct remote zip URLs are installed as full projects.
- Direct archive URLs are installed into a sanitized directory name derived from the source URL.
- Metadata records the package version, install time, repository URL, archive URL, requested source selection, install mode, and tracked top-level paths.
- `remove` deletes tracked paths while preserving paths still referenced by other installed packages.
- `update` cleans tracked paths first, then reinstalls from the recorded source URL. It reuses the recorded install mode and recorded tag or branch unless new options are provided.
- If a release does not provide a separate zip asset, the CLI falls back to the provider source archive, such as a GitHub `zipball`.

## Development

```bash
npm install
npm run build
npm test
```
