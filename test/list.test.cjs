const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const cliPath = path.resolve(__dirname, "../dist/main.js");

async function withTempDir(callback) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cppkg-list-test-"));

  try {
    await callback(tempDir);
  } finally {
    await fs.rm(tempDir, { force: true, recursive: true });
  }
}

function runCli(args, cwd) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    encoding: "utf8",
  });
}

function createDependency(name, repositoryPath, requested) {
  return {
    name,
    version: "v1.0.0",
    installedAt: "2026-04-27T00:00:00.000Z",
    type: "header-only",
    repository: {
      path: repositoryPath,
      url: `https://github.com${repositoryPath}`,
    },
    release: {
      tagName: "v1.0.0",
      name: "v1.0.0",
      publishedAt: "2026-04-27T00:00:00.000Z",
    },
    source: {
      type: "github-release",
      archiveName: `${name}.zip`,
      archiveUrl: `https://github.com${repositoryPath}/releases/download/v1.0.0/${name}.zip`,
      requested,
    },
    install: {
      mode: "include",
      target: "cpp_libs/include",
      headers: [name],
      paths: [name],
    },
  };
}

test("list warns when no package metadata exists", async () => {
  await withTempDir(async (cwd) => {
    const result = runCli(["list"], cwd);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /No installed packages found in cpp_libs/);
  });
});

test("list prints installed dependency metadata including requested source", async () => {
  await withTempDir(async (cwd) => {
    await fs.mkdir(path.join(cwd, "cpp_libs"), { recursive: true });
    await fs.writeFile(
      path.join(cwd, "cpp_libs", "deps.json"),
      `${JSON.stringify(
        {
          dependencies: [
            createDependency("json", "/nlohmann/json", {
              type: "tag",
              value: "v3.12.0",
            }),
            createDependency("fmt", "/fmtlib/fmt", {
              includePrerelease: true,
              type: "latest-release",
              value: null,
            }),
          ],
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const result = runCli(["list"], cwd);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Installed packages in cpp_libs/);
    assert.match(result.stdout, /name/);
    assert.match(result.stdout, /fmt/);
    assert.match(result.stdout, /json/);
    assert.match(result.stdout, /latest-release\+prerelease/);
    assert.match(result.stdout, /tag:v3\.12\.0/);
    assert.match(result.stdout, /cpp_libs\/include/);
  });
});
