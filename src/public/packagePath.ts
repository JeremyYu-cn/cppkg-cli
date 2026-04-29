import fs from "node:fs";
import path from "node:path";
import { resolveCliConfig } from "./config";

/**
 * Creates a directory when it does not exist and returns the same path.
 */
function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }

  return dirPath;
}

/**
 * Resolves the root directory used to store package data in the current project.
 */
export function resolvePackageRootPath() {
  return path.resolve(process.cwd(), resolveCliConfig().packageRootDir);
}

/**
 * Returns the package root path and creates it when necessary.
 */
export function getPackageRootPath() {
  return ensureDir(resolvePackageRootPath());
}

/**
 * Resolves the shared include directory path without creating it.
 */
export function resolvePublicIncludePath() {
  return path.join(
    resolvePackageRootPath(),
    resolveCliConfig().includeDirName,
  );
}

/**
 * Returns the shared include directory path and creates it when necessary.
 */
export function getPublicIncludePath() {
  return ensureDir(resolvePublicIncludePath());
}

/**
 * Resolves the root directory used to store extracted project sources.
 */
export function resolveProjectsRootPath() {
  return path.join(
    resolvePackageRootPath(),
    resolveCliConfig().projectsDirName,
  );
}

/**
 * Returns the project source root path and creates it when necessary.
 */
export function getProjectsRootPath() {
  return ensureDir(resolveProjectsRootPath());
}

/**
 * Resolves the directory used to cache downloaded archives.
 */
export function resolveArchiveCachePath() {
  return path.join(
    resolvePackageRootPath(),
    resolveCliConfig().cacheDirName,
  );
}

/**
 * Returns the archive cache directory path and creates it when necessary.
 */
export function getArchiveCachePath() {
  return ensureDir(resolveArchiveCachePath());
}

/**
 * Returns the path of the dependency metadata file stored under the configured package root.
 */
export function getDepsFilePath() {
  return path.join(resolvePackageRootPath(), resolveCliConfig().depsFileName);
}
