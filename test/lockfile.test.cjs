const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const {
  readPackageLock,
  requireLockedManifestDependencies,
  getFrozenManifestDependencyOptions,
} = require("../dist/tools/lockfile.js");
const { readPackageManifest } = require("../dist/public/manifest.js");
const { writeInstalledDependencies } = require("../dist/tools/deps.js");

const originalCwd = process.cwd();

async function withTempCwd(callback) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cppkg-lock-test-"));

  process.chdir(tempDir);

  try {
    await callback(tempDir);
  } finally {
    process.chdir(originalCwd);
    await fs.rm(tempDir, { force: true, recursive: true });
  }
}

function createDependency(name, repositoryPath, requested = { type: "latest-release", value: null }) {
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
      integrity: {
        sha256: "abc123",
      },
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

test("writeInstalledDependencies writes cppkg-lock.json without install timestamps", async () => {
  await withTempCwd(async () => {
    await writeInstalledDependencies([
      createDependency("json", "/nlohmann/json"),
    ]);

    const rawLock = JSON.parse(await fs.readFile("cppkg-lock.json", "utf8"));
    const lock = await readPackageLock();

    assert.equal(rawLock.lockfileVersion, 1);
    assert.equal(rawLock.dependencies[0].installedAt, undefined);
    assert.equal(lock.dependencies[0].source.integrity.sha256, "abc123");
    assert.equal(lock.dependencies[0].source.archiveUrl, "https://github.com/nlohmann/json/releases/download/v1.0.0/json.zip");
  });
});

test("requireLockedManifestDependencies rejects stale lock requests", async () => {
  await withTempCwd(async () => {
    await fs.writeFile(
      "cppkg.json",
      `${JSON.stringify(
        {
          dependencies: {
            json: {
              source: "https://github.com/nlohmann/json",
              tag: "v2.0.0",
            },
          },
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    await writeInstalledDependencies([
      createDependency("json", "/nlohmann/json", {
        type: "tag",
        value: "v1.0.0",
      }),
    ]);

    const manifest = await readPackageManifest();

    await assert.rejects(
      () => requireLockedManifestDependencies(manifest.dependencies),
      /does not match cppkg\.json/,
    );
  });
});

test("frozen manifest options pin latest-release locks to the resolved tag", async () => {
  await withTempCwd(async () => {
    await writeInstalledDependencies([
      createDependency("json", "/nlohmann/json"),
    ]);
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

    const manifest = await readPackageManifest();
    const locked = await requireLockedManifestDependencies(manifest.dependencies);
    const options = getFrozenManifestDependencyOptions(
      manifest.dependencies[0],
      locked[0],
      {
        cache: false,
      },
    );

    assert.deepEqual(options, {
      cache: false,
      fullProject: false,
      tag: "v1.0.0",
    });
  });
});
