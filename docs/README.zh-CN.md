# cppkg-cli

[English](../README.md)

这是一个面向 C/C++ 包的下载 CLI，支持 GitHub、Gitee 和通用远程 zip 压缩包。默认情况下，带有已发布 release 的仓库，如果归档里存在可用的 `include` 目录，就会按头文件包安装到 `./cpp_libs/include`；如果没有可用的 `include` 目录，则会回退成完整项目安装到 `./cpp_libs/projects`。没有 release 的仓库，以及直接给出的远程 zip 压缩包 URL，也会被当成完整项目解压到 `./cpp_libs/projects`。这些路径以及默认代理现在都可以通过 `cppkg-cli config` 修改。

### 安装

```bash
npm install -g cppkg-cli
```

在仓库里本地调试：

```bash
npm install
npm run dev -- get https://github.com/nlohmann/json
```

### 使用

```bash
cppkg-cli get <source-url>
cppkg-cli list
cppkg-cli remove <selector>
cppkg-cli update [selector]
cppkg-cli config <get|set|list|remove>
```

示例：

安装一个包：

```bash
cppkg-cli get https://github.com/nlohmann/json
cppkg-cli get https://github.com/fmtlib/fmt
```

使用 GitHub API 仓库地址安装：

```bash
cppkg-cli get https://api.github.com/repos/nlohmann/json
```

使用 Gitee 仓库地址安装：

```bash
cppkg-cli get https://gitee.com/mirrors/jsoncpp.git
```

使用 Gitee API 仓库地址安装：

```bash
cppkg-cli get https://gitee.com/api/v5/repos/mirrors/jsoncpp
```

安装一个没有 release 的完整仓库：

```bash
cppkg-cli get https://github.com/espruino/Espruino
```

强制按整仓模式安装：

```bash
cppkg-cli get https://github.com/lvgl/lvgl --full-project
```

安装一个直接给出的远程 zip 压缩包：

```bash
cppkg-cli get https://example.com/downloads/my-sdk.zip
```

查看已安装包：

```bash
cppkg-cli list
```

更新单个包：

```bash
cppkg-cli update json
```

更新时强制按整仓模式重装：

```bash
cppkg-cli update lvgl --full-project
```

更新全部已安装包：

```bash
cppkg-cli update
```

删除一个包：

```bash
cppkg-cli remove json
```

`remove` 和 `update` 支持的 selector：

- 包名，比如 `json`
- 仓库路径，比如 `/nlohmann/json`
- `owner/repo`，比如 `nlohmann/json`
- 记录在 `deps.json` 里的完整来源 URL，比如 `https://github.com/nlohmann/json`

如果需要代理：

```bash
cppkg-cli get https://github.com/nlohmann/json \
  --http-proxy http://127.0.0.1:7890 \
  --https-proxy http://127.0.0.1:7890
```

给当前项目设置持久化默认值：

```bash
cppkg-cli config set proxy http://127.0.0.1:7890
cppkg-cli config set packageRootDir third_party/cppkg
cppkg-cli config set includeDirName include
cppkg-cli config set projectsDirName projects
cppkg-cli config get packageRootDir
cppkg-cli config list
```

`config` 命令会把项目级配置写入 `./cppkg.config.json`。如果同时传了 CLI 参数，则 CLI 参数优先。

### 输出结构

在默认配置下，执行成功后，包内容会被放到当前目录下的 `./cpp_libs`，安装元数据会写入 `./cpp_libs/deps.json`：

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

处理规则：

- `cppkg-cli get` 支持 GitHub 仓库 URL、GitHub API 仓库 URL、Gitee 仓库 URL、Gitee API 仓库 URL，以及直接远程 zip 压缩包 URL。
- 对于 GitHub 和 Gitee 仓库输入，CLI 会先通过对应平台的 API 检查仓库是否存在已发布的 release。
- 如果存在 release，会先尝试按头文件包处理并安装到当前配置的 include 目录，默认是 `./cpp_libs/include`。
- `cppkg-cli get --full-project` 会跳过 `include` 目录探测，直接按完整项目安装。
- 在 release 模式下，如果 release 归档里没有可用的 `include` 目录，会继续尝试默认分支的仓库源码归档。
- 如果 release 归档和仓库源码归档里都没有可用的 `include` 目录，就会回退成整仓安装到当前配置的 projects 目录，默认是 `./cpp_libs/projects/<owner>_<repo>`。
- 如果仓库不存在 release，就会下载默认分支的仓库源码归档，并解压到当前配置的 projects 目录，默认是 `./cpp_libs/projects/<owner>_<repo>`。
- 对于直接远程 zip 压缩包 URL，因为没有 releases API 可用，所以会按完整项目安装到 `./cpp_libs/projects`。
- 直接 archive URL 会安装到一个由来源 URL 生成的清洗后目录名里。
- 会把 `include/xxx` 下的内容直接归并到当前配置的 include 目录。
- 已安装包的信息会记录到当前配置的依赖元数据文件里，默认是 `./cpp_libs/deps.json`，包括版本、安装时间、仓库 URL、归档 URL，以及用于删除的顶层目录或文件路径，不会把每个文件都展开记录进去。
- `cppkg-cli remove` 会根据记录的元数据删除当前包的文件，并尽量保留仍被其他包引用的共享路径。
- `cppkg-cli update` 会先清理当前包的已记录文件，再按记录下来的来源 URL 重新安装指定包或全部包，默认会沿用上次记录的安装模式。
- 如果 release 没有单独的 zip 资源，会退回到平台提供的源码归档，比如 GitHub 的 `zipball`。

### 开发

```bash
npm install
npm run build
node dist/main.js --help
```
