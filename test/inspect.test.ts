import { test } from "vitest";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const cliPath = path.resolve(process.cwd(), "dist/main.js");

function stripAnsi(text: string) {
  return text.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "");
}

async function withTempDir(callback: TempDirCallback) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cppkg-inspect-test-"));

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

function createInstalledDependency(name: string, repositoryPath: string) {
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
      headers: ["nlohmann"],
      paths: ["nlohmann"],
    },
  };
}

test("inspect reports installed declared and missing package candidates", async () => {
  await withTempDir(async (cwd) => {
    await fs.mkdir(path.join(cwd, "src"), { recursive: true });
    await fs.mkdir(path.join(cwd, "cpp_libs"), { recursive: true });
    await fs.writeFile(
      path.join(cwd, "src", "main.cpp"),
      [
        "#include <vector>",
        "#include \"local.hpp\"",
        "#include <fmt/core.h>",
        "#include <nlohmann/json.hpp>",
        "#include <sqlite3.h>",
        "// #include <boost/asio.hpp>",
        "/* #include <catch2/catch_test_macros.hpp> */",
        "int main() { return 0; }",
      ].join("\n"),
      "utf8",
    );
    await fs.writeFile(path.join(cwd, "src", "local.hpp"), "#pragma once\n", "utf8");
    await fs.writeFile(
      path.join(cwd, "cppkg.json"),
      `${JSON.stringify(
        {
          dependencies: {
            fmt: "https://github.com/fmtlib/fmt",
          },
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    await fs.writeFile(
      path.join(cwd, "cpp_libs", "deps.json"),
      `${JSON.stringify(
        {
          dependencies: [
            createInstalledDependency("json", "/nlohmann/json"),
          ],
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const result = runCli(["inspect"], cwd);
    const output = stripAnsi(result.stdout);

    assert.equal(result.status, 0);
    assert.match(output, /Inspected 2 C\/C\+\+ file\(s\)/);
    assert.match(output, /fmt\s+declared\s+fmt\/core\.h/);
    assert.match(output, /nlohmann\s+installed\s+nlohmann\/json\.hpp/);
    assert.match(output, /sqlite3\s+missing\s+sqlite3\.h/);
    assert.match(output, /sqlite -> https:\/\/github\.com\/sqlite\/sqlite/);
    assert.doesNotMatch(output, /vector/);
    assert.doesNotMatch(output, /local\.hpp/);
    assert.doesNotMatch(output, /boost/);
    assert.doesNotMatch(output, /catch2/);
  });
});

test("inspect add writes recommended missing packages to the manifest", async () => {
  await withTempDir(async (cwd) => {
    await fs.mkdir(path.join(cwd, "src"), { recursive: true });
    await fs.writeFile(
      path.join(cwd, "src", "main.cpp"),
      [
        "#include <fmt/core.h>",
        "#include <nlohmann/json.hpp>",
        "int main() { return 0; }",
      ].join("\n"),
      "utf8",
    );

    const result = runCli(["inspect", "--add"], cwd);
    const manifest = JSON.parse(
      await fs.readFile(path.join(cwd, "cppkg.json"), "utf8"),
    );

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Added fmt to cppkg\.json/);
    assert.match(result.stdout, /Added json to cppkg\.json/);
    assert.deepEqual(manifest.dependencies, {
      fmt: "https://github.com/fmtlib/fmt",
      json: "https://github.com/nlohmann/json",
    });
  });
});

test("inspect warns when no C++ source files are found", async () => {
  await withTempDir(async (cwd) => {
    const result = runCli(["inspect"], cwd);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /No C\/C\+\+ source files found/);
  });
});
