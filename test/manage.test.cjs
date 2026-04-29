const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const {
  readInstalledDependencies,
  writeInstalledDependencies,
} = require("../dist/tools/deps.js");
const {
  removeInstalledPackage,
  updateInstalledPackages,
} = require("../dist/tools/manage.js");

const originalCwd = process.cwd();

async function withTempCwd(callback) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cppkg-manage-test-"));

  process.chdir(tempDir);

  try {
    await callback(tempDir);
  } finally {
    process.chdir(originalCwd);
    await fs.rm(tempDir, { force: true, recursive: true });
  }
}

function createDependency(name, repositoryPath, overrides = {}) {
  const repositoryUrl = overrides.repositoryUrl || `https://github.com${repositoryPath}`;
  const install = overrides.install || {
    mode: "include",
    target: "cpp_libs/include",
    headers: [name],
    paths: [name],
  };

  return {
    name,
    version: "v1.0.0",
    installedAt: "2026-04-27T00:00:00.000Z",
    type: install.mode === "full-project" ? "need-compile" : "header-only",
    repository: {
      path: repositoryPath,
      url: repositoryUrl,
    },
    release: {
      tagName: "v1.0.0",
      name: "v1.0.0",
      publishedAt: "2026-04-27T00:00:00.000Z",
    },
    source: {
      type: overrides.sourceType || "github-release",
      archiveName: `${name}.zip`,
      archiveUrl: `${repositoryUrl.replace(/\.git$/i, "")}/archive/v1.0.0.zip`,
      requested: overrides.requested || {
        type: "latest-release",
        value: null,
      },
    },
    install,
  };
}

async function assertMissing(targetPath) {
  await assert.rejects(
    () => fs.access(targetPath),
    /ENOENT/,
  );
}

test("remove deletes owned include paths and preserves shared paths", async () => {
  await withTempCwd(async () => {
    await fs.mkdir("cpp_libs/include/nlohmann", { recursive: true });
    await fs.mkdir("cpp_libs/include/fmt", { recursive: true });
    await fs.mkdir("cpp_libs/include/shared", { recursive: true });
    await fs.writeFile("cpp_libs/include/nlohmann/json.hpp", "// json\n", "utf8");
    await fs.writeFile("cpp_libs/include/fmt/core.h", "// fmt\n", "utf8");
    await fs.writeFile("cpp_libs/include/shared/common.h", "// shared\n", "utf8");

    await writeInstalledDependencies([
      createDependency("json", "/nlohmann/json", {
        install: {
          mode: "include",
          target: "cpp_libs/include",
          headers: ["nlohmann", "shared"],
          paths: ["nlohmann", "shared"],
        },
      }),
      createDependency("fmt", "/fmtlib/fmt", {
        install: {
          mode: "include",
          target: "cpp_libs/include",
          headers: ["fmt", "shared"],
          paths: ["fmt", "shared"],
        },
      }),
    ]);

    const result = await removeInstalledPackage("nlohmann/json");

    assert.equal(result.dependency.name, "json");
    assert.deepEqual(result.removedPaths, ["nlohmann"]);
    assert.deepEqual(result.skippedPaths, ["shared"]);
    await assertMissing("cpp_libs/include/nlohmann");
    await fs.access("cpp_libs/include/fmt/core.h");
    await fs.access("cpp_libs/include/shared/common.h");

    const installed = await readInstalledDependencies();
    assert.deepEqual(installed.dependencies.map((dependency) => dependency.name), ["fmt"]);
  });
});

test("remove deletes full-project installs from their dedicated project target", async () => {
  await withTempCwd(async () => {
    await fs.mkdir("cpp_libs/projects/owner_project/src", { recursive: true });
    await fs.writeFile("cpp_libs/projects/owner_project/CMakeLists.txt", "cmake\n", "utf8");
    await fs.writeFile("cpp_libs/projects/owner_project/src/main.cpp", "int main() {}\n", "utf8");

    await writeInstalledDependencies([
      createDependency("project", "/owner/project", {
        install: {
          mode: "full-project",
          target: "cpp_libs/projects/owner_project",
          headers: ["CMakeLists.txt", "src"],
          paths: ["CMakeLists.txt", "src"],
        },
      }),
    ]);

    const result = await removeInstalledPackage("project");

    assert.equal(result.dependency.name, "project");
    assert.deepEqual(result.removedPaths, ["CMakeLists.txt", "src"]);
    await assertMissing("cpp_libs/projects/owner_project");
    assert.deepEqual((await readInstalledDependencies()).dependencies, []);
  });
});

test("remove selector matching accepts GitHub, Gitee, git suffix, and owner/repo forms", async () => {
  const cases = [
    {
      name: "fmt",
      repositoryPath: "/fmtlib/fmt",
      repositoryUrl: "https://github.com/fmtlib/fmt",
      selector: "https://github.com/fmtlib/fmt.git",
    },
    {
      name: "jsoncpp",
      repositoryPath: "/mirrors/jsoncpp",
      repositoryUrl: "https://gitee.com/mirrors/jsoncpp.git",
      selector: "gitee.com/mirrors/jsoncpp",
    },
    {
      name: "ownerlib",
      repositoryPath: "/owner/ownerlib",
      repositoryUrl: "https://github.com/owner/ownerlib",
      selector: "owner/ownerlib",
    },
  ];

  for (const item of cases) {
    await withTempCwd(async () => {
      await fs.mkdir(`cpp_libs/include/${item.name}`, { recursive: true });
      await fs.writeFile(`cpp_libs/include/${item.name}/header.h`, "// header\n", "utf8");
      await writeInstalledDependencies([
        createDependency(item.name, item.repositoryPath, {
          repositoryUrl: item.repositoryUrl,
        }),
      ]);

      const result = await removeInstalledPackage(item.selector);

      assert.equal(result.dependency.name, item.name);
      assert.deepEqual((await readInstalledDependencies()).dependencies, []);
    });
  }
});

test("host-specific selectors choose the matching provider when repository paths overlap", async () => {
  await withTempCwd(async () => {
    await fs.mkdir("cpp_libs/include/github_repo", { recursive: true });
    await fs.mkdir("cpp_libs/include/gitee_repo", { recursive: true });
    await fs.writeFile("cpp_libs/include/github_repo/header.h", "// github\n", "utf8");
    await fs.writeFile("cpp_libs/include/gitee_repo/header.h", "// gitee\n", "utf8");

    await writeInstalledDependencies([
      createDependency("aaa-github-repo", "/owner/repo", {
        install: {
          mode: "include",
          target: "cpp_libs/include",
          headers: ["github_repo"],
          paths: ["github_repo"],
        },
        repositoryUrl: "https://github.com/owner/repo",
      }),
      createDependency("zzz-gitee-repo", "/owner/repo", {
        install: {
          mode: "include",
          target: "cpp_libs/include",
          headers: ["gitee_repo"],
          paths: ["gitee_repo"],
        },
        repositoryUrl: "https://gitee.com/owner/repo.git",
        sourceType: "gitee-release",
      }),
    ]);

    const result = await removeInstalledPackage("gitee.com/owner/repo");

    assert.equal(result.dependency.name, "zzz-gitee-repo");
    await fs.access("cpp_libs/include/github_repo/header.h");
    await assertMissing("cpp_libs/include/gitee_repo");

    const installed = await readInstalledDependencies();
    assert.deepEqual(installed.dependencies.map((dependency) => dependency.name), [
      "aaa-github-repo",
    ]);
  });
});

test("remove rejects ambiguous name-only selectors", async () => {
  await withTempCwd(async () => {
    await writeInstalledDependencies([
      createDependency("json", "/first/json"),
      createDependency("json", "/second/json"),
    ]);

    await assert.rejects(
      () => removeInstalledPackage("json"),
      /Package selector "json" is ambiguous/,
    );
  });
});

test("update handles empty metadata and rejects invalid selector usage before network access", async () => {
  await withTempCwd(async () => {
    assert.deepEqual(await updateInstalledPackages(undefined), {
      updatedDependencies: [],
    });

    await assert.rejects(
      () => updateInstalledPackages(undefined, { tag: "v1" }),
      /Options --tag and --branch require a package selector/,
    );

    await writeInstalledDependencies([createDependency("fmt", "/fmtlib/fmt")]);

    await assert.rejects(
      () => updateInstalledPackages("missing"),
      /Cannot find installed package: missing/,
    );
  });
});
