import { test } from "vitest";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const packageJson = require("../package.json");

const cliPath = path.resolve(process.cwd(), "dist/main.js");

async function withTempDir(callback: TempDirCallback) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cppkg-cli-test-"));

  try {
    await callback(tempDir);
  } finally {
    await fs.rm(tempDir, { force: true, recursive: true });
  }
}

function runCli(args: string[], cwd: string) {
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

test("env --json outputs valid JSON diagnostics", async () => {
  await withTempDir(async (cwd) => {
    const result = runCli(["env", "--json"], cwd);

    assert.equal(result.status, 0);
    assert.doesNotThrow(() => JSON.parse(result.stdout));
    const parsed = JSON.parse(result.stdout) as Record<string, string>;
    assert.equal(typeof parsed["Platform"], "string");
    assert.equal(typeof parsed["Node.js Version"], "string");
    assert.equal(typeof parsed["C++ Compiler"], "string");
  });
});

test("docs help exposes documentation command", async () => {
  await withTempDir(async (cwd) => {
    const result = runCli(["docs", "--help"], cwd);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Open the cppkg-cli documentation site/);
  });
});

test("home help exposes repository command", async () => {
  await withTempDir(async (cwd) => {
    const result = runCli(["home", "--help"], cwd);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Open the cppkg-cli GitHub repository/);
  });
});

test("bug help exposes issue tracker command", async () => {
  await withTempDir(async (cwd) => {
    const result = runCli(["bug", "--help"], cwd);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Open the cppkg-cli issue tracker/);
  });
});

test("get help exposes version selection options", async () => {
  await withTempDir(async (cwd) => {
    const result = runCli(["get", "--help"], cwd);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /--tag <tag>/);
    assert.match(result.stdout, /--branch <branch>/);
    assert.match(result.stdout, /--version-range <range>/);
    assert.match(result.stdout, /--version-policy <policy>/);
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
    assert.match(result.stdout, /--version-range <range>/);
    assert.match(result.stdout, /--version-policy <policy>/);
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
    assert.match(result.stdout, /--version-range <range>/);
    assert.match(result.stdout, /--version-policy <policy>/);
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

test("compile help exposes host and Docker compiler options", async () => {
  await withTempDir(async (cwd) => {
    const result = runCli(["compile", "--help"], cwd);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Compile C\/C\+\+ source files/);
    assert.match(result.stdout, /--compiler <command>/);
    assert.match(result.stdout, /--toolchain <name>/);
    assert.match(result.stdout, /--docker/);
    assert.match(result.stdout, /--docker-image <image>/);
    assert.match(result.stdout, /--dry-run/);
  });
});

test("build help exposes CMake and Docker compiler environment options", async () => {
  await withTempDir(async (cwd) => {
    const result = runCli(["build", "--help"], cwd);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Configure and build a CMake project/);
    assert.match(result.stdout, /--build-dir <path>/);
    assert.match(result.stdout, /--toolchain <name>/);
    assert.match(result.stdout, /--docker/);
    assert.match(result.stdout, /--docker-image <image>/);
    assert.match(result.stdout, /--dry-run/);
  });
});

test("compiler help exposes version management subcommands", async () => {
  await withTempDir(async (cwd) => {
    const result = runCli(["compiler", "--help"], cwd);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Manage compiler versions/);
    assert.match(result.stdout, /list/);
    assert.match(result.stdout, /install/);
    assert.match(result.stdout, /use/);
  });
});

test("inspect help exposes project include inspection command", async () => {
  await withTempDir(async (cwd) => {
    const result = runCli(["inspect", "--help"], cwd);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Inspect C\/C\+\+ source includes/);
    assert.match(result.stdout, /--add/);
    assert.match(result.stdout, /--install/);
  });
});

test("cache help exposes archive cache subcommands", async () => {
  await withTempDir(async (cwd) => {
    const result = runCli(["cache", "--help"], cwd);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Manage downloaded archive cache/);
    assert.match(result.stdout, /list/);
    assert.match(result.stdout, /clean/);
  });
});

test("cmake help exposes integration helper generation", async () => {
  await withTempDir(async (cwd) => {
    const result = runCli(["cmake", "--help"], cwd);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Generate a cppkg\.cmake integration helper/);
    assert.match(result.stdout, /--output <path>/);
    assert.match(result.stdout, /--force/);
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

test("server help exposes web server options", async () => {
  await withTempDir(async (cwd) => {
    const result = runCli(["server", "--help"], cwd);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Start a local web server/);
    assert.match(result.stdout, /--host <host>/);
    assert.match(result.stdout, /--port <port>/);
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
      /Options --tag and --branch can only be used with GitHub.*repository URLs/,
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

test("uninstall alias for remove works", async () => {
  await withTempDir(async (cwd) => {
    const result = runCli(["uninstall", "--help"], cwd);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Remove an installed package/);
  });
});

test("exec runs a command with CPPKG environment variables", async () => {
  await withTempDir(async (cwd) => {
    const result = runCli(["exec", "echo", "$CPPKG_INCLUDE_DIR"], cwd);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /cpp_libs\/include/);
  });
});

test("exec help exposes subprocess command", async () => {
  await withTempDir(async (cwd) => {
    const result = runCli(["exec", "--help"], cwd);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Run a command with CPPKG_INCLUDE_DIR/);
  });
});

test("inspect --json outputs valid JSON", async () => {
  await withTempDir(async (cwd) => {
    const result = runCli(["inspect", "--json"], cwd);

    assert.equal(result.status, 0);
    const parsed = JSON.parse(result.stdout);
    assert.equal(typeof parsed.filesScanned, "number");
    assert.equal(typeof parsed.includeCount, "number");
    assert.ok(Array.isArray(parsed.packages));
  });
});

test("diagnose --json outputs valid JSON", async () => {
  await withTempDir(async (cwd) => {
    const result = runCli(["diagnose", "--json"], cwd);

    assert.equal(result.status, 0);
    const parsed = JSON.parse(result.stdout);
    assert.equal(typeof parsed.nodeVersion, "string");
    assert.equal(typeof parsed.platform, "string");
    assert.equal(typeof parsed.manifestExists, "boolean");
    assert.equal(typeof parsed.lockfileExists, "boolean");
  });
});

test("diagnose command displays environment info", async () => {
  await withTempDir(async (cwd) => {
    const result = runCli(["diagnose"], cwd);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Node\.js/);
    assert.match(result.stdout, /Platform/);
  });
});

test("verify --json outputs valid JSON", async () => {
  await withTempDir(async (cwd) => {
    const result = runCli(["verify", "--json"], cwd);

    assert.equal(result.status, 0);
    const parsed = JSON.parse(result.stdout);
    assert.equal(typeof parsed.verified, "number");
    assert.equal(typeof parsed.passed, "number");
    assert.ok(Array.isArray(parsed.issues));
  });
});

test("clean --json outputs valid JSON in dry-run mode", async () => {
  await withTempDir(async (cwd) => {
    const result = runCli(["clean", "--json", "--dry-run"], cwd);

    assert.equal(result.status, 0);
    const parsed = JSON.parse(result.stdout);
    assert.ok(Array.isArray(parsed.items));
    assert.equal(typeof parsed.dryRun, "boolean");
    assert.equal(typeof parsed.confirmed, "boolean");
  });
});

test("graph --json outputs valid JSON", async () => {
  await withTempDir(async (cwd) => {
    const result = runCli(["graph", "--json"], cwd);

    assert.equal(result.status, 0);
    const parsed = JSON.parse(result.stdout);
    assert.ok(Array.isArray(parsed));
    for (const entry of parsed) {
      assert.equal(typeof entry.name, "string");
      assert.equal(typeof entry.version, "string");
      assert.equal(typeof entry.repository, "string");
      assert.ok(Array.isArray(entry.children));
    }
  });
});

test("diff --json outputs valid JSON", async () => {
  await withTempDir(async (cwd) => {
    const result = runCli(["diff", "--json"], cwd);

    assert.equal(result.status, 0);
    const parsed = JSON.parse(result.stdout);
    assert.equal(typeof parsed.lockfileMissing, "boolean");
    assert.equal(typeof parsed.manifestChanged, "boolean");
    assert.ok(Array.isArray(parsed.entries));
  });
});

test("audit --json outputs valid JSON", async () => {
  await withTempDir(async (cwd) => {
    const result = runCli(["audit", "--json"], cwd);

    assert.equal(result.status, 0);
    const parsed = JSON.parse(result.stdout);
    assert.ok(Array.isArray(parsed.results));
    assert.equal(typeof parsed.totalAdvisories, "number");
  });
});

test("rebuild help exposes reinstall command", async () => {
  await withTempDir(async (cwd) => {
    const result = runCli(["rebuild", "--help"], cwd);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Reinstall all packages from scratch/);
  });
});

test("licenses --json outputs valid JSON", async () => {
  await withTempDir(async (cwd) => {
    const result = runCli(["licenses", "--json"], cwd);

    assert.equal(result.status, 0);
    assert.doesNotThrow(() => JSON.parse(result.stdout));
    assert.ok(Array.isArray(JSON.parse(result.stdout)));
  });
});

test("status --json outputs valid JSON", async () => {
  await withTempDir(async (cwd) => {
    const result = runCli(["status", "--json"], cwd);

    assert.equal(result.status, 0);
    assert.doesNotThrow(() => JSON.parse(result.stdout));
    const parsed = JSON.parse(result.stdout) as { issues: unknown[] };
    assert.ok(Array.isArray(parsed.issues));
  });
});

test("verify --fix exposes re-download option", async () => {
  await withTempDir(async (cwd) => {
    const result = runCli(["verify", "--help"], cwd);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Re-download packages that fail checksum verification/);
  });
});

test("remove reports missing dependency metadata cleanly", async () => {
  await withTempDir(async (cwd) => {
    const result = runCli(["remove", "missing"], cwd);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /No installed packages found/);
  });
});

test("lockfile help exposes subcommands", async () => {
  await withTempDir(async (cwd) => {
    const result = runCli(["lockfile", "--help"], cwd);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Manage cppkg-lock\.json/);
    assert.match(result.stdout, /check/);
    assert.match(result.stdout, /regenerate/);
    assert.match(result.stdout, /dedupe/);
  });
});

test("lockfile check validates lockfile consistency", async () => {
  await withTempDir(async (cwd) => {
    // No lockfile or manifest exists yet
    const result = runCli(["lockfile", "check"], cwd);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Cannot find cppkg-lock\.json/);
  });
});

test("lockfile dedupe succeeds when lockfile has no duplicates", async () => {
  await withTempDir(async (cwd) => {
    // Write a minimal cppkg.json and cppkg-lock.json
    await fs.writeFile(path.join(cwd, "cppkg.json"), JSON.stringify({ dependencies: {} }), "utf8");
    await fs.writeFile(
      path.join(cwd, "cppkg-lock.json"),
      JSON.stringify({ lockfileVersion: 1, dependencies: [] }),
      "utf8",
    );

    const result = runCli(["lockfile", "dedupe"], cwd);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /No duplicate entries/);
  });
});

test("pack help exposes tarball creation command", async () => {
  await withTempDir(async (cwd) => {
    const result = runCli(["pack", "--help"], cwd);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Create a distributable tarball/);
    assert.match(result.stdout, /--output <path>/);
  });
});

test("pack fails without cppkg.json", async () => {
  await withTempDir(async (cwd) => {
    const result = runCli(["pack"], cwd);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /No cppkg\.json found/);
  });
});

test("pack creates a tarball with cppkg.json present", async () => {
  await withTempDir(async (cwd) => {
    await fs.writeFile(
      path.join(cwd, "cppkg.json"),
      JSON.stringify({ name: "test-lib", version: "1.0.0", dependencies: {} }),
      "utf8",
    );
    await fs.writeFile(
      path.join(cwd, "cppkg-lock.json"),
      JSON.stringify({ lockfileVersion: 1, dependencies: [] }),
      "utf8",
    );

    const result = runCli(["pack"], cwd);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /test-lib-1\.0\.0\.tgz/);
  });
});

test("pack --output writes to specified path", async () => {
  await withTempDir(async (cwd) => {
    await fs.writeFile(
      path.join(cwd, "cppkg.json"),
      JSON.stringify({ name: "mylib", version: "2.0.0", dependencies: {} }),
      "utf8",
    );
    await fs.writeFile(
      path.join(cwd, "cppkg-lock.json"),
      JSON.stringify({ lockfileVersion: 1, dependencies: [] }),
      "utf8",
    );

    const outPath = path.join(cwd, "dist", "mylib.tgz");
    const result = runCli(["pack", "--output", outPath], cwd);

    assert.equal(result.status, 0);
    const exists = await fs.stat(outPath).then(() => true).catch(() => false);
    assert.equal(exists, true);
  });
});

test("publish --dry-run requires git repo", async () => {
  await withTempDir(async (cwd) => {
    await fs.writeFile(
      path.join(cwd, "cppkg.json"),
      JSON.stringify({ name: "test", version: "1.0.0", dependencies: {} }),
      "utf8",
    );

    const result = runCli(["publish", "--dry-run"], cwd);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /not a git repository/);
  });
});

test("publish help shows --dry-run option", async () => {
  await withTempDir(async (cwd) => {
    const result = runCli(["publish", "--help"], cwd);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /--dry-run/);
    assert.match(result.stdout, /Preview what would be published/);
  });
});

test("completion powershell generates PowerShell completion script", async () => {
  await withTempDir(async (cwd) => {
    const result = runCli(["completion", "powershell"], cwd);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Register-ArgumentCompleter/);
    assert.match(result.stdout, /cppkg-cli/);
  });
});

test("completion rejects invalid shell", async () => {
  await withTempDir(async (cwd) => {
    const result = runCli(["completion", "invalid"], cwd);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Unsupported shell/);
  });
});

test("init --template cmake-header-only scaffolds header-only project", async () => {
  await withTempDir(async (cwd) => {
    const result = runCli(["init", "--template", "cmake-header-only"], cwd);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Scaffolded cmake-header-only/);

    const cmakeExists = await fs.stat(path.join(cwd, "CMakeLists.txt")).then(() => true).catch(() => false);
    assert.equal(cmakeExists, true);

    const headerExists = await fs.stat(path.join(cwd, "include", "my-library", "my-library.hpp")).then(() => true).catch(() => false);
    assert.equal(headerExists, true);
  });
});

test("init --template cmake-executable scaffolds executable project", async () => {
  await withTempDir(async (cwd) => {
    const result = runCli(["init", "--template", "cmake-executable"], cwd);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Scaffolded cmake-executable/);

    const mainCppExists = await fs.stat(path.join(cwd, "src", "main.cpp")).then(() => true).catch(() => false);
    assert.equal(mainCppExists, true);
  });
});

test("init --template cmake-library scaffolds compiled library project", async () => {
  await withTempDir(async (cwd) => {
    const result = runCli(["init", "--template", "cmake-library"], cwd);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Scaffolded cmake-library/);
  });
});

test("init --template rejects unknown template", async () => {
  await withTempDir(async (cwd) => {
    const result = runCli(["init", "--template", "nonexistent"], cwd);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Unknown template/);
  });
});
