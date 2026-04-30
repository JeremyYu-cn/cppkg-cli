const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const packageJson = require("../package.json");

const cliPath = path.resolve(__dirname, "../dist/main.js");

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

test("root version flag follows package.json", async () => {
  await withTempDir(async (cwd) => {
    const result = runCli(["--version"], cwd);

    assert.equal(result.status, 0);
    assert.equal(result.stdout.trim(), packageJson.version);
  });
});

test("get help exposes version selection options", async () => {
  await withTempDir(async (cwd) => {
    const result = runCli(["get", "--help"], cwd);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /--tag <tag>/);
    assert.match(result.stdout, /--branch <branch>/);
    assert.match(result.stdout, /--prerelease/);
    assert.match(result.stdout, /--no-cache/);
  });
});

test("add help exposes manifest write and install options", async () => {
  await withTempDir(async (cwd) => {
    const result = runCli(["add", "--help"], cwd);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Add one dependency to cppkg\.json/);
    assert.match(result.stdout, /--name <name>/);
    assert.match(result.stdout, /--install/);
    assert.match(result.stdout, /--force/);
  });
});

test("update help exposes version selection options", async () => {
  await withTempDir(async (cwd) => {
    const result = runCli(["update", "--help"], cwd);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /--tag <tag>/);
    assert.match(result.stdout, /--branch <branch>/);
    assert.match(result.stdout, /--prerelease/);
    assert.match(result.stdout, /--no-cache/);
  });
});

test("install help exposes manifest install options", async () => {
  await withTempDir(async (cwd) => {
    const result = runCli(["install", "--help"], cwd);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Install dependencies declared in cppkg\.json/);
    assert.match(result.stdout, /--http-proxy <url>/);
    assert.match(result.stdout, /--https-proxy <url>/);
    assert.match(result.stdout, /--no-cache/);
    assert.match(result.stdout, /--frozen-lockfile/);
  });
});

test("search help exposes result selection options", async () => {
  await withTempDir(async (cwd) => {
    const result = runCli(["search", "--help"], cwd);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Search GitHub for C\/C\+\+ libraries sorted by stars/);
    assert.match(result.stdout, /--limit <number>/);
    assert.match(result.stdout, /--language <language>/);
    assert.match(result.stdout, /--install/);
    assert.match(result.stdout, /--no-interactive/);
    assert.match(result.stdout, /--select <number>/);
  });
});

test("get rejects using tag and branch together before network access", async () => {
  await withTempDir(async (cwd) => {
    const result = runCli(
      ["get", "https://github.com/owner/repo", "--tag", "v1", "--branch", "main"],
      cwd,
    );

    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /Options --tag and --branch cannot be used together/,
    );
  });
});

test("get rejects tag and branch options for direct archive URLs", async () => {
  await withTempDir(async (cwd) => {
    const result = runCli(
      ["get", "https://example.com/sdk.zip", "--tag", "v1"],
      cwd,
    );

    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /Options --tag and --branch can only be used with GitHub or Gitee repository URLs/,
    );
  });
});

test("update rejects explicit version selection without a package selector", async () => {
  await withTempDir(async (cwd) => {
    const result = runCli(["update", "--tag", "v1"], cwd);

    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /Options --tag and --branch require a package selector/,
    );
  });
});

test("remove reports missing dependency metadata cleanly", async () => {
  await withTempDir(async (cwd) => {
    const result = runCli(["remove", "missing"], cwd);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /No installed packages found/);
  });
});
