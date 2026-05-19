import { describe, test } from "vitest";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const cliPath = path.resolve(process.cwd(), "dist/main.js");

type TempDirCallback = (dir: string) => Promise<void>;

function withTempDir(callback: TempDirCallback) {
  return async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cppkg-cache-test-"));

    try {
      await callback(tempDir);
    } finally {
      await fs.rm(tempDir, { force: true, recursive: true });
    }
  };
}

function runCli(args: string[], cwd: string) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    encoding: "utf8",
  });
}

function runCliQuiet(args: string[], cwd: string) {
  return spawnSync(process.execPath, [cliPath, "--quiet", ...args], {
    cwd,
    encoding: "utf8",
  });
}

test("cache list and clean manage downloaded archive files", withTempDir(async (cwd) => {
  const cachePath = path.join(cwd, "cpp_libs", "cache");

  await fs.mkdir(cachePath, { recursive: true });
  await fs.writeFile(path.join(cachePath, "abc123-sdk.zip"), "archive", "utf8");

  const listed = runCli(["cache", "list"], cwd);

  assert.equal(listed.status, 0);
  assert.match(listed.stdout, /abc123-sdk\.zip/);
  assert.match(listed.stdout, /7 B/);

  const cleaned = runCli(["cache", "clean"], cwd);

  assert.equal(cleaned.status, 0);
  assert.match(cleaned.stdout, /Removed 1 cached archive/);
  await assert.rejects(
    () => fs.access(path.join(cachePath, "abc123-sdk.zip")),
    /ENOENT/,
  );
}));

test("cache export copies all cache files to target directory", withTempDir(async (cwd) => {
  const cachePath = path.join(cwd, "cpp_libs", "cache");
  const exportPath = path.join(cwd, "cache-export");

  await fs.mkdir(cachePath, { recursive: true });
  await fs.writeFile(path.join(cachePath, "abc123-sdk.zip"), "data1", "utf8");
  await fs.writeFile(path.join(cachePath, "def456-lib.tar.gz"), "data2", "utf8");

  const exported = runCli(["cache", "export", exportPath], cwd);

  assert.equal(exported.status, 0);
  assert.match(exported.stdout, /Exported 2 cached/);

  const files = await fs.readdir(exportPath);
  assert.deepEqual([...files].sort(), ["abc123-sdk.zip", "def456-lib.tar.gz"]);
}));

test("cache export warns when cache is empty", withTempDir(async (cwd) => {
  const cachePath = path.join(cwd, "cpp_libs", "cache");
  const exportPath = path.join(cwd, "cache-export");

  await fs.mkdir(cachePath, { recursive: true });

  const exported = runCli(["cache", "export", exportPath], cwd);

  assert.equal(exported.status, 0);
  assert.match(exported.stdout, /No cached archives/);
}));

test("cache import copies files from source directory into cache", withTempDir(async (cwd) => {
  const cachePath = path.join(cwd, "cpp_libs", "cache");
  const importSource = path.join(cwd, "cache-backup");

  await fs.mkdir(importSource, { recursive: true });
  await fs.writeFile(path.join(importSource, "abc123-sdk.zip"), "data1", "utf8");
  await fs.writeFile(path.join(importSource, "def456-lib.tar.gz"), "data2", "utf8");

  const imported = runCli(["cache", "import", importSource], cwd);

  assert.equal(imported.status, 0);
  assert.match(imported.stdout, /Imported 2 cached/);

  const files = await fs.readdir(cachePath);
  assert.deepEqual([...files].sort(), ["abc123-sdk.zip", "def456-lib.tar.gz"]);
}));

test("cache import errors when source directory does not exist", withTempDir(async (cwd) => {
  const imported = runCli(["cache", "import", "/nonexistent/path"], cwd);

  assert.notEqual(imported.status, 0);
}));

test("cache import warns when source directory is empty", withTempDir(async (cwd) => {
  const importSource = path.join(cwd, "empty-backup");

  await fs.mkdir(importSource, { recursive: true });

  const imported = runCli(["cache", "import", importSource], cwd);

  assert.equal(imported.status, 0);
  assert.match(imported.stdout, /No cache files/);
}));

describe("--verbose / --quiet global flags", () => {
  test("--quiet suppresses info and warn output but allows errors", withTempDir(async (cwd) => {
    // run a command that produces info output with and without --quiet
    const withoutQuiet = runCli(["cache", "list"], cwd);
    const withQuiet = runCliQuiet(["cache", "list"], cwd);

    // without --quiet should still show output
    assert.equal(withoutQuiet.status, 0);
    assert.match(withoutQuiet.stdout, /No cached archives/);

    // with --quiet should suppress the warning
    assert.equal(withQuiet.status, 0);
    assert.equal(withQuiet.stdout.trim(), "");
  }));

  test("--version still works with --quiet", withTempDir(async (cwd) => {
    const result = runCliQuiet(["--version"], cwd);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /\d+\.\d+\.\d+/);
  }));

  test("--help still works with --quiet", withTempDir(async (cwd) => {
    const result = runCliQuiet(["--help"], cwd);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /Usage/);
  }));
});
