const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

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

test("get help exposes version selection options", async () => {
  await withTempDir(async (cwd) => {
    const result = runCli(["get", "--help"], cwd);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /--tag <tag>/);
    assert.match(result.stdout, /--branch <branch>/);
    assert.match(result.stdout, /--prerelease/);
  });
});

test("update help exposes version selection options", async () => {
  await withTempDir(async (cwd) => {
    const result = runCli(["update", "--help"], cwd);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /--tag <tag>/);
    assert.match(result.stdout, /--branch <branch>/);
    assert.match(result.stdout, /--prerelease/);
  });
});

test("install help exposes manifest install options", async () => {
  await withTempDir(async (cwd) => {
    const result = runCli(["install", "--help"], cwd);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Install dependencies declared in cppkg\.json/);
    assert.match(result.stdout, /--http-proxy <url>/);
    assert.match(result.stdout, /--https-proxy <url>/);
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
