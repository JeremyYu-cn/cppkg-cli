import fs from "node:fs";
import path from "node:path";

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
  return path.resolve(process.cwd(), "cpp_libs");
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
  return path.join(resolvePackageRootPath(), "include");
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
  return path.join(resolvePackageRootPath(), "projects");
}

/**
 * Returns the project source root path and creates it when necessary.
 */
export function getProjectsRootPath() {
  return ensureDir(resolveProjectsRootPath());
}

/**
 * Returns the path of the dependency metadata file stored under cpp_libs.
 */
export function getDepsFilePath() {
  return path.join(resolvePackageRootPath(), "deps.json");
}
