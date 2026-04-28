# cppkg-cli

[English](../README.md)

`cppkg-cli` 是一个面向 C/C++ 包的下载 CLI，可以从 GitHub、Gitee 或远程 zip 压缩包安装包到当前项目目录。它会优先把可复用头文件安装到共享 include 目录；如果包不适合按头文件使用，则回退为完整项目解压。

## 安装

```bash
npm install -g cppkg-cli
```

在仓库里本地开发：

```bash
npm install
npm run dev -- --help
```

## 快速开始

创建项目包管理文件：

```bash
cppkg-cli init
```

在 `cppkg.json` 里添加依赖：

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

安装 manifest 里的全部依赖：

```bash
cppkg-cli install
```

只安装指定 manifest 条目：

```bash
cppkg-cli install json fmt
```

默认配置下，安装内容会写到 `./cpp_libs`，安装元数据会写到 `./cpp_libs/deps.json`。

## 命令

| 命令 | 作用 |
| --- | --- |
| `cppkg-cli init` | 创建 `./cppkg.json`。 |
| `cppkg-cli install [selector...]` | 安装全部 manifest 依赖，或只安装选中的 manifest 条目。 |
| `cppkg-cli get <source-url...>` | 直接安装一个或多个包来源。 |
| `cppkg-cli list` | 查看 `deps.json` 中记录的已安装包。 |
| `cppkg-cli update [selector]` | 更新一个已安装包；不传 selector 时更新全部包。 |
| `cppkg-cli remove <selector>` | 删除一个已安装包。 |
| `cppkg-cli config <subcommand>` | 管理 `./cppkg.config.json` 中的项目级默认配置。 |

每个命令都可以加 `--help` 查看当前支持的选项。

## Manifest

`cppkg.json` 支持依赖名到来源的映射写法：

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

也支持数组写法：

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

Manifest 对象字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `source` | string | GitHub 仓库 URL、GitHub API 仓库 URL、Gitee 仓库 URL、Gitee API 仓库 URL，或远程 zip URL。 |
| `name` | string | 数组条目的可选 selector 名称。映射写法里，映射 key 就是依赖名。 |
| `tag` | string | 安装指定 release tag；如果没有匹配 release，则安装对应的仓库 tag 归档。 |
| `branch` | string | 安装指定仓库分支。 |
| `prerelease` | boolean | 解析 latest release 时允许选择 prerelease。 |
| `fullProject` | boolean | 跳过 include 探测，直接按完整项目安装。 |

同一个依赖不能同时设置 `tag` 和 `branch`。

## 直接安装

如果只是临时安装一个来源，不想编辑 `cppkg.json`，可以使用 `get`。

```bash
cppkg-cli get https://github.com/nlohmann/json
cppkg-cli get https://github.com/nlohmann/json https://github.com/fmtlib/fmt
```

支持的来源格式：

```bash
cppkg-cli get https://github.com/nlohmann/json
cppkg-cli get https://api.github.com/repos/nlohmann/json
cppkg-cli get https://gitee.com/mirrors/jsoncpp.git
cppkg-cli get https://gitee.com/api/v5/repos/mirrors/jsoncpp
cppkg-cli get https://example.com/downloads/my-sdk.zip
```

版本和安装模式选项：

```bash
cppkg-cli get https://github.com/nlohmann/json --tag v3.12.0
cppkg-cli get https://github.com/lvgl/lvgl --branch master
cppkg-cli get https://github.com/owner/repo --prerelease
cppkg-cli get https://github.com/lvgl/lvgl --full-project
```

## 管理包

查看已安装包：

```bash
cppkg-cli list
```

更新全部包，或更新单个包：

```bash
cppkg-cli update
cppkg-cli update json
cppkg-cli update json --tag v3.12.0
cppkg-cli update lvgl --branch master
cppkg-cli update lvgl --full-project
```

删除一个包：

```bash
cppkg-cli remove json
```

`install`、`update` 和 `remove` 支持的 selector：

| Selector | 示例 |
| --- | --- |
| Manifest 依赖名或已安装包名 | `json` |
| 仓库路径 | `/nlohmann/json` |
| `owner/repo` | `nlohmann/json` |
| 已记录的来源 URL | `https://github.com/nlohmann/json` |

`install` 的 selector 会匹配 `cppkg.json` 中的条目。`update` 和 `remove` 的 selector 会匹配 `deps.json` 中的已安装记录。

## 配置

项目级配置保存在 `./cppkg.config.json`。

```bash
cppkg-cli config set proxy http://127.0.0.1:7890
cppkg-cli config set packageRootDir third_party/cppkg
cppkg-cli config set includeDirName include
cppkg-cli config set projectsDirName projects
cppkg-cli config get packageRootDir
cppkg-cli config list
```

支持的配置项：

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| `proxy` | 空 | HTTP 和 HTTPS 请求的默认代理。 |
| `httpProxy` | 空 | 默认 HTTP 代理。 |
| `httpsProxy` | 空 | 默认 HTTPS 代理。 |
| `packageRootDir` | `cpp_libs` | 安装数据根目录。 |
| `includeDirName` | `include` | `packageRootDir` 下的共享 include 目录名。 |
| `projectsDirName` | `projects` | `packageRootDir` 下的完整项目目录名。 |
| `depsFileName` | `deps.json` | `packageRootDir` 下的已安装包元数据文件名。 |

CLI 代理参数优先于配置文件：

```bash
cppkg-cli get https://github.com/nlohmann/json \
  --http-proxy http://127.0.0.1:7890 \
  --https-proxy http://127.0.0.1:7890
```

## 输出结构

默认输出结构：

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

安装行为：

- GitHub 和 Gitee 仓库会先通过对应 API 检查已发布 release。
- 如果 release 归档里有可用的 `include` 目录，头文件会合并到当前配置的 include 目录。
- 如果 release 归档没有可用的 `include` 目录，会继续尝试仓库源码归档。
- 如果仍然没有可用 include 目录，会回退为完整项目安装到当前配置的 projects 目录。
- 没有 release 的仓库和直接远程 zip URL 会按完整项目安装。
- 直接 archive URL 会安装到一个由来源 URL 生成的清洗后目录名里。
- 元数据会记录包版本、安装时间、仓库 URL、归档 URL、用户请求的来源选择、安装模式和用于删除的顶层路径。
- `remove` 会删除已记录路径，并保留仍被其他包引用的共享路径。
- `update` 会先清理已记录路径，再按记录来源重新安装。除非传入新的选项，否则会沿用上次记录的安装模式和 tag 或 branch。
- 如果 release 没有单独 zip 资源，会退回到平台源码归档，比如 GitHub 的 `zipball`。

## 开发

```bash
npm install
npm run build
npm test
```
