import { test } from "vitest";
import assert from "node:assert/strict";
import { resolveInputSource } from "../src/tools/download/sources";

const repoUrl = "https://github.com/nlohmann/json";
const archiveUrl = "https://github.com/nlohmann/json/archive/refs/tags/v3.11.3.zip";

test("resolveInputSource parses full GitHub URL", () => {
  const result = resolveInputSource(repoUrl);
  assert.equal(result.packageName, "json");
  assert.ok(result.repositoryUrl.includes("nlohmann/json"));
});

test("resolveInputSource parses direct archive URL", () => {
  const result = resolveInputSource(archiveUrl);
  assert.equal(result.repositoryUrl, archiveUrl);
});

test("resolveInputSource handles .git suffix", () => {
  const result = resolveInputSource("https://github.com/nlohmann/json.git");
  assert.equal(result.packageName, "json");
  assert.ok(result.repositoryUrl.includes("nlohmann/json"));
});

test("resolveInputSource handles Bitbucket URL", () => {
  const result = resolveInputSource("https://bitbucket.org/owner/repo");
  assert.equal(result.kind, "bitbucket-repository");
});

test("resolveInputSource handles GitLab URL", () => {
  const result = resolveInputSource("https://gitlab.com/owner/repo");
  assert.equal(result.kind, "gitlab-repository");
});

/*
 * To run benchmarks instead of tests:
 *   npx vitest bench --run test/benchmarks.test.ts
 *
 * Benchmarks cover:
 *   - resolveInputSource
 *   - readPackageLock (lockfile parsing)
 *   - package download planning
 */
