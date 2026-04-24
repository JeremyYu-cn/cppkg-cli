import type { ResolvedInputSource } from "./types";
import type { ProviderRelease, PreparedArchive } from "./types";
import { promises as fsp } from "node:fs";
import path from "node:path";
import { getPublicIncludePath } from "../../public/packagePath";
import { normalizeTrackedPath, upsertInstalledDependency } from "../deps";
import { logger } from "../logger";
import { buildInstalledDependency } from "./metadata";

const HEADER_EXTENSIONS = new Set([
  ".h",
  ".hh",
  ".hpp",
  ".hxx",
  ".inc",
  ".ipp",
  ".tpp",
]);

/**
 * Recursively checks whether a directory contains at least one header file.
 */
async function directoryContainsHeaders(dirPath: string): Promise<boolean> {
  const entries = await fsp.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      if (await directoryContainsHeaders(entryPath)) {
        return true;
      }
      continue;
    }

    if (HEADER_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      return true;
    }
  }

  return false;
}

/**
 * Finds the most relevant include directories inside an extracted archive.
 */
export async function collectIncludeDirs(rootPath: string): Promise<string[]> {
  const entries = await fsp.readdir(rootPath, { withFileTypes: true });
  const includeDirs: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name !== "include") {
      continue;
    }

    const entryPath = path.join(rootPath, entry.name);

    if (await directoryContainsHeaders(entryPath)) {
      includeDirs.push(entryPath);
    }
  }

  return includeDirs;
}

/**
 * Copies the selected include directories into the shared include root and records installed paths.
 */
async function mergeIncludeDirs(
  includeDirs: string[],
  targetIncludeDir: string,
) {
  await fsp.mkdir(targetIncludeDir, { recursive: true });

  const installedEntries = new Set<string>();

  for (const includeDir of includeDirs) {
    const entries = await fsp.readdir(includeDir, { withFileTypes: true });

    for (const entry of entries) {
      const sourcePath = path.join(includeDir, entry.name);
      const targetPath = path.join(targetIncludeDir, entry.name);
      const relativePath = normalizeTrackedPath(entry.name);

      if (entry.isDirectory()) {
        await fsp.cp(sourcePath, targetPath, {
          force: true,
          recursive: true,
        });
      } else {
        await fsp.cp(sourcePath, targetPath, {
          force: true,
        });
      }

      installedEntries.add(relativePath);
    }
  }

  return {
    headers: [...installedEntries].sort(),
    paths: [...installedEntries].sort(),
  };
}

/**
 * Installs one prepared archive into the shared include directory and records metadata.
 */
export async function installIncludePackage(
  inputSource: ResolvedInputSource,
  release: ProviderRelease | null,
  preparedArchive: PreparedArchive,
) {
  const installRootPath = getPublicIncludePath();
  const installPath = path.relative(process.cwd(), installRootPath) || "cpp_libs";
  const installed = await mergeIncludeDirs(
    preparedArchive.includeDirs,
    installRootPath,
  );
  const installedDependency = buildInstalledDependency(
    inputSource,
    installPath,
    release,
    preparedArchive.archive,
    installed.headers,
    installed.paths,
    "header-only",
    "include",
  );

  await upsertInstalledDependency(installedDependency);

  logger.success(`Installed ${inputSource.packageName} into ${installPath}`);
  logger.detail("Headers", installed.headers.join(", "));
  logger.detail(
    "Recorded dependency metadata in",
    path.relative(process.cwd(), path.join(installRootPath, "..", "deps.json")),
  );
}
