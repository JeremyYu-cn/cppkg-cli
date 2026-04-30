const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const { writeInstalledDependencies } = require("../dist/tools/deps.js");

const cliPath = path.resolve(__dirname, "../dist/main.js");
const originalCwd = process.cwd();

async function withTempCwd(callback) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cppkg-status-test-"));

  process.chdir(tempDir);

  try {
    await callback(tempDir);
  } finally {
    process.chdir(originalCwd);
    await fs.rm(tempDir, { force: true, recursive: true });
  }
}

function runCli(args, cwd) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    encoding: "utf8",
  });
}

function createDependency(name, repositoryPath) {
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
    },
  };
}

async function writeManifest() {
  await fs.writeFile(
    "cppkg.json",
    `${JSON.stringify(
      {
        dependencies: {
          json: "https://github.com/nlohmann/json",
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

test("status reports a clean project when manifest metadata and files agree", async () => {
  await withTempCwd(async (cwd) => {
    await writeManifest();
    await fs.mkdir("cpp_libs/include/json", { recursive: true });
    await writeInstalledDependencies([
      createDependency("json", "/nlohmann/json"),
    ]);

    const result = runCli(["status"], cwd);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Project status is clean/);
  });
});

test("status reports missing tracked files", async () => {
  await withTempCwd(async (cwd) => {
    await writeManifest();
    await writeInstalledDependencies([
      createDependency("json", "/nlohmann/json"),
    ]);

    const result = runCli(["doctor"], cwd);

    assert.equal(result.status, 1);
    assert.match(result.stdout, /missing-path/);
    assert.match(result.stdout, /cpp_libs\/include\/json/);
  });
});
