const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const {
  normalizeTrackedPath,
  readInstalledDependencies,
  upsertInstalledDependency,
  writeInstalledDependencies,
} = require("../dist/tools/deps.js");

const originalCwd = process.cwd();

async function withTempCwd(callback) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cppkg-deps-test-"));

  process.chdir(tempDir);

  try {
    await callback(tempDir);
  } finally {
    process.chdir(originalCwd);
    await fs.rm(tempDir, { force: true, recursive: true });
  }
}

function createDependency(name, repositoryPath, install = {}) {
  return {
    name,
    version: "1.0.0",
    installedAt: "2026-04-27T00:00:00.000Z",
    type: "header-only",
    repository: {
      path: repositoryPath,
      url: `https://github.com${repositoryPath}`,
    },
    release: {
      tagName: "1.0.0",
      name: "1.0.0",
      publishedAt: "2026-04-27T00:00:00.000Z",
    },
    source: {
      type: "github-release",
      archiveName: `${name}.zip`,
      archiveUrl: `https://github.com${repositoryPath}/releases/download/1.0.0/${name}.zip`,
      requested: {
        type: "latest-release",
        value: null,
      },
    },
    install: {
      mode: "include",
      target: "cpp_libs/include",
      headers: [name],
      paths: [name],
      ...install,
    },
  };
}

test("normalizeTrackedPath strips local prefixes and normalizes separators", () => {
  assert.equal(normalizeTrackedPath("./include\\nlohmann/json.hpp"), "include/nlohmann/json.hpp");
  assert.equal(normalizeTrackedPath("/fmt/core.h"), "fmt/core.h");
});

test("readInstalledDependencies returns an empty file model when deps.json is missing", async () => {
  await withTempCwd(async () => {
    assert.deepEqual(await readInstalledDependencies(), {
      dependencies: [],
    });
  });
});

test("readInstalledDependencies normalizes old dependency records", async () => {
  await withTempCwd(async () => {
    await fs.mkdir("cpp_libs", { recursive: true });
    await fs.writeFile(
      "cpp_libs/deps.json",
      `${JSON.stringify({
        dependencies: [
          {
            name: "json",
            version: "v3.12.0",
            installedAt: "2026-04-27T00:00:00.000Z",
            type: "header-only",
            repository: {
              path: "/nlohmann/json",
              url: "https://github.com/nlohmann/json",
            },
            release: {
              tagName: "v3.12.0",
              name: "JSON for Modern C++ version 3.12.0",
              publishedAt: "2025-04-11T08:43:39Z",
            },
            source: {
              type: "github-release",
              archiveName: "include.zip",
              archiveUrl: "https://github.com/nlohmann/json/releases/download/v3.12.0/include.zip",
            },
            install: {
              paths: ["./nlohmann/json.hpp", "/nlohmann/detail/value_t.hpp"],
            },
          },
        ],
      }, null, 2)}\n`,
      "utf8",
    );

    const installed = await readInstalledDependencies();
    const dependency = installed.dependencies[0];

    assert.equal(dependency.install.mode, "include");
    assert.equal(dependency.install.target, "cpp_libs/include");
    assert.deepEqual(dependency.install.headers, ["nlohmann"]);
    assert.deepEqual(dependency.install.paths, ["nlohmann"]);
  });
});

test("writeInstalledDependencies sorts dependencies and top-level paths", async () => {
  await withTempCwd(async () => {
    await writeInstalledDependencies([
      createDependency("json", "/nlohmann/json", {
        headers: ["./nlohmann/json.hpp", "nlohmann/detail/value_t.hpp"],
        paths: ["nlohmann/json.hpp", "nlohmann/detail/value_t.hpp"],
      }),
      createDependency("fmt", "/fmtlib/fmt", {
        headers: ["fmt/core.h"],
        paths: ["fmt/core.h"],
      }),
    ]);

    const installed = await readInstalledDependencies();

    assert.deepEqual(
      installed.dependencies.map((dependency) => dependency.name),
      ["fmt", "json"],
    );
    assert.deepEqual(installed.dependencies[1].install.headers, ["nlohmann"]);
    assert.deepEqual(installed.dependencies[1].install.paths, ["nlohmann"]);
  });
});

test("upsertInstalledDependency replaces records by repository identity", async () => {
  await withTempCwd(async () => {
    await upsertInstalledDependency(createDependency("json", "/nlohmann/json"));
    await upsertInstalledDependency(
      createDependency("json", "/nlohmann/json", {
        headers: ["single_include"],
        paths: ["single_include"],
      }),
    );

    const installed = await readInstalledDependencies();

    assert.equal(installed.dependencies.length, 1);
    assert.deepEqual(installed.dependencies[0].install.paths, ["single_include"]);
  });
});

test("upsertInstalledDependency keeps providers separate when repository paths overlap", async () => {
  await withTempCwd(async () => {
    const giteeDependency = createDependency("gitee-repo", "/owner/repo", {
      paths: ["gitee_repo"],
    });

    giteeDependency.repository.url = "https://gitee.com/owner/repo.git";

    await upsertInstalledDependency(createDependency("github-repo", "/owner/repo"));
    await upsertInstalledDependency(giteeDependency);

    const installed = await readInstalledDependencies();

    assert.deepEqual(
      installed.dependencies.map((dependency) => dependency.name),
      ["gitee-repo", "github-repo"],
    );
  });
});
