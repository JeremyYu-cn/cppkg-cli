const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const {
  getConfigValue,
  listConfigEntries,
  removeConfigValue,
  resolveCliConfig,
  setConfigValue,
} = require("../dist/public/config.js");

const cliPath = path.resolve(__dirname, "../dist/main.js");
const originalCwd = process.cwd();

async function withTempCwd(callback) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cppkg-config-test-"));

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

test("config defaults, overrides, and remove are resolved from cppkg.config.json", async () => {
  await withTempCwd(async () => {
    assert.equal(getConfigValue("packageRootDir"), "cpp_libs");
    assert.equal(getConfigValue("cacheDirName"), "cache");

    assert.deepEqual(setConfigValue("packageRootDir", "./third_party\\cppkg/"), {
      key: "packageRootDir",
      value: "third_party/cppkg",
    });
    assert.deepEqual(setConfigValue("proxy", " http://127.0.0.1:7890 "), {
      key: "proxy",
      value: "http://127.0.0.1:7890",
    });
    assert.deepEqual(setConfigValue("cacheDirName", "./archives/"), {
      key: "cacheDirName",
      value: "archives",
    });

    assert.equal(resolveCliConfig().packageRootDir, "third_party/cppkg");
    assert.equal(resolveCliConfig().proxy, "http://127.0.0.1:7890");
    assert.equal(resolveCliConfig().cacheDirName, "archives");

    const entries = listConfigEntries();
    assert.equal(
      entries.find((entry) => entry.key === "packageRootDir").source,
      "user",
    );
    assert.equal(
      entries.find((entry) => entry.key === "includeDirName").source,
      "default",
    );

    assert.deepEqual(removeConfigValue("proxy"), {
      hadValue: true,
      key: "proxy",
      value: "",
    });
    assert.equal(resolveCliConfig().proxy, "");

    assert.deepEqual(removeConfigValue("packageRootDir"), {
      hadValue: true,
      key: "packageRootDir",
      value: "cpp_libs",
    });
    assert.deepEqual(removeConfigValue("cacheDirName"), {
      hadValue: true,
      key: "cacheDirName",
      value: "cache",
    });
    await assert.rejects(
      () => fs.access("cppkg.config.json"),
      /ENOENT/,
    );
  });
});

test("config rejects unknown keys and unsafe relative path values", async () => {
  await withTempCwd(async (cwd) => {
    assert.throws(
      () => setConfigValue("unknown", "value"),
      /Unknown config key "unknown"/,
    );
    assert.throws(
      () => setConfigValue("packageRootDir", "../vendor"),
      /must stay inside the current project directory/,
    );
    assert.throws(
      () => setConfigValue("packageRootDir", path.join(cwd, "vendor")),
      /must be a relative path/,
    );
    assert.throws(
      () => setConfigValue("proxy", " "),
      /Config key "proxy" cannot be empty/,
    );
  });
});

test("config CLI set, get, list, and remove work against the project config file", async () => {
  await withTempDir(async (cwd) => {
    const setResult = runCli(["config", "set", "includeDirName", "public_include"], cwd);
    assert.equal(setResult.status, 0);
    assert.match(setResult.stdout, /Set includeDirName=public_include/);

    const getResult = runCli(["config", "get", "includeDirName"], cwd);
    assert.equal(getResult.status, 0);
    assert.equal(getResult.stdout.trim(), "public_include");

    const listResult = runCli(["config", "list"], cwd);
    assert.equal(listResult.status, 0);
    assert.match(listResult.stdout, /includeDirName/);
    assert.match(listResult.stdout, /user/);
    assert.match(listResult.stdout, /public_include/);

    const removeResult = runCli(["config", "remove", "includeDirName"], cwd);
    assert.equal(removeResult.status, 0);
    assert.match(removeResult.stdout, /Removed includeDirName/);

    const defaultResult = runCli(["config", "get", "includeDirName"], cwd);
    assert.equal(defaultResult.status, 0);
    assert.equal(defaultResult.stdout.trim(), "include");

    const repeatedRemove = runCli(["config", "remove", "includeDirName"], cwd);
    assert.equal(repeatedRemove.status, 0);
    assert.match(repeatedRemove.stdout, /already using its default value/);
  });
});
