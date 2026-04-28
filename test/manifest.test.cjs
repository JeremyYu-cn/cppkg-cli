const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const {
  createPackageManifest,
  getManifestDependencyOptions,
  readPackageManifest,
} = require("../dist/public/manifest.js");

const cliPath = path.resolve(__dirname, "../dist/main.js");
const originalCwd = process.cwd();

async function withTempCwd(callback) {
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "cppkg-manifest-test-"),
  );

  process.chdir(tempDir);

  try {
    await callback(tempDir);
  } finally {
    process.chdir(originalCwd);
    await fs.rm(tempDir, { force: true, recursive: true });
  }
}

async function withTempDir(callback) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cppkg-cli-test-"));

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

test("init creates an empty cppkg manifest", async () => {
  await withTempDir(async (cwd) => {
    const result = runCli(["init"], cwd);
    const manifest = JSON.parse(
      await fs.readFile(path.join(cwd, "cppkg.json"), "utf8"),
    );

    assert.equal(result.status, 0);
    assert.deepEqual(manifest, {
      dependencies: {},
    });
  });
});

test("init refuses to overwrite an existing manifest unless forced", async () => {
  await withTempDir(async (cwd) => {
    assert.equal(runCli(["init"], cwd).status, 0);

    const refused = runCli(["init"], cwd);
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /cppkg\.json already exists/);

    const forced = runCli(["init", "--force"], cwd);
    assert.equal(forced.status, 0);
  });
});

test("readPackageManifest normalizes dependency maps", async () => {
  await withTempCwd(async () => {
    await fs.writeFile(
      "cppkg.json",
      `${JSON.stringify(
        {
          dependencies: {
            fmt: {
              fullProject: true,
              source: "https://github.com/fmtlib/fmt",
              tag: "11.2.0",
            },
            json: "https://github.com/nlohmann/json",
          },
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const manifest = await readPackageManifest();

    assert.deepEqual(manifest.dependencies, [
      {
        fullProject: true,
        name: "fmt",
        source: "https://github.com/fmtlib/fmt",
        tag: "11.2.0",
      },
      {
        name: "json",
        source: "https://github.com/nlohmann/json",
      },
    ]);
  });
});

test("readPackageManifest supports dependency arrays", async () => {
  await withTempCwd(async () => {
    await fs.writeFile(
      "cppkg.json",
      `${JSON.stringify(
        {
          dependencies: [
            "https://github.com/nlohmann/json",
            {
              branch: "master",
              name: "lvgl",
              source: "https://github.com/lvgl/lvgl",
            },
          ],
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const manifest = await readPackageManifest();

    assert.deepEqual(manifest.dependencies, [
      {
        source: "https://github.com/nlohmann/json",
      },
      {
        branch: "master",
        name: "lvgl",
        source: "https://github.com/lvgl/lvgl",
      },
    ]);
  });
});

test("readPackageManifest rejects tag and branch on the same dependency", async () => {
  await withTempCwd(async () => {
    await fs.writeFile(
      "cppkg.json",
      `${JSON.stringify(
        {
          dependencies: {
            json: {
              branch: "main",
              source: "https://github.com/nlohmann/json",
              tag: "v3.12.0",
            },
          },
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    await assert.rejects(
      () => readPackageManifest(),
      /dependencies\.json cannot define both tag and branch/,
    );
  });
});

test("getManifestDependencyOptions combines manifest options with CLI proxies", () => {
  const options = getManifestDependencyOptions(
    {
      fullProject: true,
      prerelease: true,
      source: "https://github.com/owner/repo",
      tag: "v1",
    },
    {
      httpProxy: "http://127.0.0.1:7890",
      httpsProxy: "http://127.0.0.1:7890",
    },
  );

  assert.deepEqual(options, {
    fullProject: true,
    httpProxy: "http://127.0.0.1:7890",
    httpsProxy: "http://127.0.0.1:7890",
    prerelease: true,
    tag: "v1",
  });
});

test("install warns when manifest has no dependencies", async () => {
  await withTempDir(async (cwd) => {
    assert.equal(runCli(["init"], cwd).status, 0);

    const result = runCli(["install"], cwd);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /No dependencies found in cppkg\.json/);
  });
});

test("install rejects unknown manifest selectors before network access", async () => {
  await withTempDir(async (cwd) => {
    await fs.writeFile(
      path.join(cwd, "cppkg.json"),
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

    const result = runCli(["install", "fmt"], cwd);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /Cannot find manifest dependency: fmt/);
  });
});

test("createPackageManifest writes a manifest in the current working directory", async () => {
  await withTempCwd(async (cwd) => {
    const result = createPackageManifest();
    const manifestPath = path.join(cwd, "cppkg.json");

    assert.equal(result.manifestFilePath, manifestPath);
    assert.equal(
      await fs.readFile(manifestPath, "utf8"),
      `${JSON.stringify({ dependencies: {} }, null, 2)}\n`,
    );
  });
});
