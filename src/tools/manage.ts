import type { GetPkgOptions, InstalledDependency } from "../types/global";
import { promises as fsp } from "node:fs";
import path from "node:path";
import { resolvePackageRootPath } from "../public/packagePath";
import {
  getTrackedInstallPaths,
  normalizeTrackedPath,
  readInstalledDependencies,
  writeInstalledDependencies,
} from "./deps";
import { getVCPkg } from "./download/main";
import { logger } from "./logger";

type RemoveFilesResult = {
  installPath: string;
  removedPaths: string[];
  skippedPaths: string[];
};

/**
 * Measures the nesting depth of a tracked path for delete ordering.
 */
function getPathDepth(targetPath: string) {
  return normalizeTrackedPath(targetPath).split("/").filter(Boolean).length;
}

/**
 * Sorts deeper paths first so nested files and directories are removed safely.
 */
function compareByDepthDescending(left: string, right: string) {
  return getPathDepth(right) - getPathDepth(left) || left.localeCompare(right);
}

/**
 * Expands a package selector into the supported lookup forms.
 */
function getSelectorVariants(selector: string) {
  const normalizedSelector = selector.trim().replace(/\/+$/, "");

  return [
    normalizedSelector,
    normalizedSelector.replace(/^https:\/\/github\.com/i, ""),
    normalizedSelector.replace(/^github\.com\//i, ""),
  ]
    .map((value) => value.trim())
    .filter(Boolean);
}

/**
 * Checks whether one installed dependency matches a user-provided selector.
 */
function matchesDependencySelector(
  dependency: InstalledDependency,
  selector: string,
) {
  const variants = getSelectorVariants(selector);

  return variants.some((variant) => {
    return (
      dependency.repository.path === variant ||
      dependency.repository.path.slice(1) === variant ||
      dependency.repository.url.replace(/\/+$/, "") === variant ||
      dependency.name === variant
    );
  });
}

/**
 * Resolves one installed dependency record from a selector and rejects ambiguous matches.
 */
function resolveInstalledDependency(
  dependencies: InstalledDependency[],
  selector: string,
) {
  const matches = dependencies.filter((dependency) =>
    matchesDependencySelector(dependency, selector),
  );

  if (!matches.length) {
    throw new Error(`Cannot find installed package: ${selector}`);
  }

  const exactRepositoryMatch = matches.find((dependency) => {
    const variants = getSelectorVariants(selector);

    return variants.some(
      (variant) =>
        dependency.repository.path === variant ||
        dependency.repository.path.slice(1) === variant ||
        dependency.repository.url.replace(/\/+$/, "") === variant,
    );
  });

  if (exactRepositoryMatch) {
    return exactRepositoryMatch;
  }

  if (matches.length > 1) {
    throw new Error(
      `Package selector "${selector}" is ambiguous. Use one of: ${matches.map((dependency) => dependency.repository.path).join(", ")}`,
    );
  }

  return matches[0]!;
}

/**
 * Converts a tracked install path back into a filesystem path under the include root.
 */
function toFilesystemPath(includeRootPath: string, trackedPath: string) {
  return path.join(
    includeRootPath,
    ...normalizeTrackedPath(trackedPath).split("/"),
  );
}

/**
 * Checks whether another package still claims a directory or anything below it.
 */
function directoryClaimedByOthers(
  directoryPath: string,
  claimedPaths: Set<string>,
) {
  for (const claimedPath of claimedPaths) {
    if (
      claimedPath === directoryPath ||
      claimedPath.startsWith(`${directoryPath}/`)
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Collects parent directories that may become empty after files are removed.
 */
function collectParentDirectories(paths: string[]) {
  const directories = new Set<string>();

  for (const targetPath of paths) {
    let current = path.posix.dirname(normalizeTrackedPath(targetPath));

    while (current && current !== ".") {
      directories.add(current);
      current = path.posix.dirname(current);
    }
  }

  return [...directories].sort(compareByDepthDescending);
}

/**
 * Removes tracked files for one package while preserving paths still used by others.
 */
async function removeDependencyFiles(
  dependency: InstalledDependency,
  otherDependencies: InstalledDependency[],
): Promise<RemoveFilesResult> {
  const installRootPath = path.resolve(
    process.cwd(),
    dependency.install.target,
  );
  const installPath =
    path.relative(process.cwd(), installRootPath) || dependency.install.target;
  const ownPaths = getTrackedInstallPaths(dependency).sort(
    compareByDepthDescending,
  );
  const otherClaimedPaths = new Set(
    otherDependencies
      .filter(
        (item) =>
          normalizeTrackedPath(item.install.target) ===
          normalizeTrackedPath(dependency.install.target),
      )
      .flatMap((item) => getTrackedInstallPaths(item)),
  );
  const removedPaths: string[] = [];
  const skippedPaths: string[] = [];

  for (const targetPath of ownPaths) {
    const filesystemPath = toFilesystemPath(installRootPath, targetPath);

    try {
      const stat = await fsp.lstat(filesystemPath);

      if (stat.isDirectory()) {
        if (directoryClaimedByOthers(targetPath, otherClaimedPaths)) {
          skippedPaths.push(targetPath);
          continue;
        }

        await fsp.rm(filesystemPath, {
          force: true,
          recursive: true,
        });
        removedPaths.push(targetPath);
        continue;
      }

      if (otherClaimedPaths.has(targetPath)) {
        skippedPaths.push(targetPath);
        continue;
      }

      await fsp.rm(filesystemPath, {
        force: true,
      });
      removedPaths.push(targetPath);
    } catch (error: unknown) {
      const nodeError = error as NodeJS.ErrnoException;

      if (nodeError.code === "ENOENT") {
        continue;
      }

      throw error;
    }
  }

  const directoriesToPrune = collectParentDirectories([
    ...dependency.install.headers,
    ...removedPaths,
  ]);

  for (const directoryPath of directoriesToPrune) {
    if (directoryClaimedByOthers(directoryPath, otherClaimedPaths)) {
      continue;
    }

    const filesystemPath = toFilesystemPath(installRootPath, directoryPath);

    try {
      const entries = await fsp.readdir(filesystemPath);

      if (!entries.length) {
        await fsp.rmdir(filesystemPath);
      }
    } catch (error: unknown) {
      const nodeError = error as NodeJS.ErrnoException;

      if (
        nodeError.code === "ENOENT" ||
        nodeError.code === "ENOTDIR" ||
        nodeError.code === "ENOTEMPTY"
      ) {
        continue;
      }

      throw error;
    }
  }

  try {
    const rootEntries = await fsp.readdir(installRootPath);

    if (!rootEntries.length) {
      await fsp.rmdir(installRootPath);
    }
  } catch (error: unknown) {
    const nodeError = error as NodeJS.ErrnoException;

    if (
      nodeError.code !== "ENOENT" &&
      nodeError.code !== "ENOTDIR" &&
      nodeError.code !== "ENOTEMPTY"
    ) {
      throw error;
    }
  }

  return {
    installPath,
    removedPaths: removedPaths.sort(compareByDepthDescending),
    skippedPaths: skippedPaths.sort(compareByDepthDescending),
  };
}

/**
 * Deletes one installed package from the shared include tree and updates deps.json.
 */
export async function removeInstalledPackage(selector: string) {
  const installed = await readInstalledDependencies();

  if (!installed.dependencies.length) {
    throw new Error(
      `No installed packages found in ${resolvePackageRootPath()}`,
    );
  }

  const dependency = resolveInstalledDependency(
    installed.dependencies,
    selector,
  );
  const remainingDependencies = installed.dependencies.filter(
    (item) => item.repository.path !== dependency.repository.path,
  );
  const removeResult = await removeDependencyFiles(
    dependency,
    remainingDependencies,
  );

  await writeInstalledDependencies(remainingDependencies);

  return {
    dependency,
    ...removeResult,
  };
}

/**
 * Refreshes one tracked package or every tracked package by reinstalling from GitHub.
 */
export async function updateInstalledPackages(
  selector: string | undefined,
  options: GetPkgOptions = {},
) {
  const installed = await readInstalledDependencies();

  if (!installed.dependencies.length) {
    logger.warn(`No installed packages found in ${resolvePackageRootPath()}.`);
    return {
      updatedDependencies: [],
    };
  }

  const targetRepositoryPaths = selector
    ? [
        resolveInstalledDependency(installed.dependencies, selector).repository
          .path,
      ]
    : installed.dependencies.map((dependency) => dependency.repository.path);

  const updatedDependencies: InstalledDependency[] = [];

  for (const repositoryPath of targetRepositoryPaths) {
    const current = await readInstalledDependencies();
    const dependency = resolveInstalledDependency(
      current.dependencies,
      repositoryPath,
    );
    const otherDependencies = current.dependencies.filter(
      (item) => item.repository.path !== dependency.repository.path,
    );
    const removeResult = await removeDependencyFiles(
      dependency,
      otherDependencies,
    );

    logger.info(
      `Refreshing ${dependency.name} from ${dependency.repository.url} (${removeResult.removedPaths.length} tracked paths cleaned)`,
    );

    if (removeResult.skippedPaths.length) {
      logger.warn(
        `Preserved ${removeResult.skippedPaths.length} shared path(s): ${removeResult.skippedPaths.join(", ")}`,
      );
    }

    await getVCPkg(dependency.repository.url, {
      ...options,
      fullProject:
        options.fullProject || dependency.install.mode === "full-project",
    });
    updatedDependencies.push(dependency);
  }

  return {
    updatedDependencies,
  };
}
