# cppkg-cli

A CLI for downloading C/C++ packages from GitHub, Gitee, or remote zip archives. By default, repository sources with published releases are installed into `./cpp_libs/include` when their archives expose a usable `include` directory; otherwise they fall back to full-project installs under `./cpp_libs/projects`. Repository sources without releases, along with direct remote zip archive URLs, are treated as full projects and extracted into `./cpp_libs/projects`. These paths and the default proxy can now be changed with `cppkg-cli config`.

[简体中文](./docs/README.zh-CN.md)

### Install

```bash
npm install -g cppkg-cli
```

For local development inside this repository:

```bash
npm install
npm run dev -- get https://github.com/nlohmann/json
```

### Usage

```bash
cppkg-cli get <source-url>
cppkg-cli list
cppkg-cli remove <selector>
cppkg-cli update [selector]
cppkg-cli config <get|set|list|remove>
```

Examples:

Install a package:

```bash
cppkg-cli get https://github.com/nlohmann/json
cppkg-cli get https://github.com/fmtlib/fmt
```

Install using a GitHub API repository URL:

```bash
cppkg-cli get https://api.github.com/repos/nlohmann/json
```

Install using a Gitee repository URL:

```bash
cppkg-cli get https://gitee.com/mirrors/jsoncpp.git
```

Install using a Gitee API repository URL:

```bash
cppkg-cli get https://gitee.com/api/v5/repos/mirrors/jsoncpp
```

Install a repository without releases as a full project:

```bash
cppkg-cli get https://github.com/espruino/Espruino
```

Force a repository to install as a full project:

```bash
cppkg-cli get https://github.com/lvgl/lvgl --full-project
```

Install a direct remote zip archive as a full project:

```bash
cppkg-cli get https://example.com/downloads/my-sdk.zip
```

List installed packages:

```bash
cppkg-cli list
```

Update one installed package:

```bash
cppkg-cli update json
```

Force a full-project reinstall while updating:

```bash
cppkg-cli update lvgl --full-project
```

Update all installed packages:

```bash
cppkg-cli update
```

Remove one installed package:

```bash
cppkg-cli remove json
```

Selectors accepted by `remove` and `update`:

- Installed package name, such as `json`
- Repository path, such as `/nlohmann/json`
- Owner and repository, such as `nlohmann/json`
- Exact recorded source URL, such as `https://github.com/nlohmann/json`

With a proxy:

```bash
cppkg-cli get https://github.com/nlohmann/json \
  --http-proxy http://127.0.0.1:7890 \
  --https-proxy http://127.0.0.1:7890
```

Configure persistent defaults for the current project:

```bash
cppkg-cli config set proxy http://127.0.0.1:7890
cppkg-cli config set packageRootDir third_party/cppkg
cppkg-cli config set includeDirName include
cppkg-cli config set projectsDirName projects
cppkg-cli config get packageRootDir
cppkg-cli config list
```

The `config` command stores project-level settings in `./cppkg.config.json`. CLI flags still win over config values.

### Output Layout

With the default config, package files are placed under `./cpp_libs`, and metadata is written to `./cpp_libs/deps.json`:

```text
your-project/
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

Behavior:

- `cppkg-cli get` accepts GitHub repository URLs, GitHub API repository URLs, Gitee repository URLs, Gitee API repository URLs, and direct remote zip archive URLs.
- GitHub and Gitee repository inputs are checked for a published release through the corresponding provider API.
- If a release exists, the CLI first tries to install reusable headers into the configured include directory, which defaults to `./cpp_libs/include`.
- `cppkg-cli get --full-project` skips include-directory detection and installs the repository as a full project directly.
- In release mode, the CLI first tries the release archive and then retries with the repository archive when the release archive does not contain a usable `include` directory.
- If neither archive contains a usable `include` directory, the CLI falls back to installing the repository as a full project under the configured projects directory, which defaults to `./cpp_libs/projects/<owner>_<repo>`.
- If no release exists, the CLI downloads the default-branch repository archive and extracts it into the configured projects directory, which defaults to `./cpp_libs/projects/<owner>_<repo>`.
- Direct remote zip archive URLs are installed as full projects because there is no releases API to classify them as reusable header packages.
- Direct archive URLs are installed into a sanitized directory name derived from the source URL.
- Package content under `include/xxx` is merged directly into the configured include directory.
- Installed package metadata is recorded in the configured deps file, which defaults to `./cpp_libs/deps.json`, including version, install time, repository URL, archive URL, and only the top-level installed directories or files tracked for removal.
- `cppkg-cli remove` deletes installed files based on the tracked metadata and keeps shared paths that are still referenced by other packages.
- `cppkg-cli update` refreshes one package or all packages by cleaning tracked files first and then reinstalling from the recorded source URL, while reusing the recorded install mode by default.
- When a release does not provide a separate zip asset, the CLI falls back to the provider source archive, such as a GitHub `zipball`.

### Development

```bash
npm install
npm run dev -- --help
```
