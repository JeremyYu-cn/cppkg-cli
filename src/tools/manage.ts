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
import { resolveInputSource } from "./download/sources";
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

function getDependencyIdentity(dependency: InstalledDependency) {
  return (
    dependency.repository.url.trim().replace(/\/+$/, "").replace(/\.git$/i, "") ||
    dependency.repository.path
  );
}

function addSelectorVariant(variants: Set<string>, value: string | undefined) {
  const normalized = value?.trim().replace(/\/+$/, "");

  if (!normalized) {
    return;
  }

  variants.add(normalized);
  variants.add(normalized.replace(/\.git$/i, ""));
}

function getRepositoryProvider(value: string) {
  try {
    const parsed = new URL(value);

    if (["github.com", "www.github.com", "api.github.com"].includes(parsed.hostname)) {
      return "github" as const;
    }

    if (["gitee.com", "www.gitee.com"].includes(parsed.hostname)) {
      return "gitee" as const;
    }
  } catch {
    // Plain owner/repo selectors are provider-neutral.
  }

  return null;
}

function addRepositoryPathVariants(
  variants: Set<string>,
  repositoryPath: string,
  providers: Array<"github" | "gitee"> = [],
  includeBarePath = true,
) {
  const normalizedPath = repositoryPath.trim().replace(/^\/+|\/+$/g, "")
    .replace(/\.git$/i, "");

  if (!normalizedPath) {
    return;
  }

  if (includeBarePath) {
    addSelectorVariant(variants, normalizedPath);
    addSelectorVariant(variants, `/${normalizedPath}`);
  }

  if (providers.includes("github")) {
    addSelectorVariant(variants, `github.com/${normalizedPath}`);
    addSelectorVariant(variants, `https://github.com/${normalizedPath}`);
  }

  if (providers.includes("gitee")) {
    addSelectorVariant(variants, `gitee.com/${normalizedPath}`);
    addSelectorVariant(variants, `https://gitee.com/${normalizedPath}`);
    addSelectorVariant(variants, `https://gitee.com/${normalizedPath}.git`);
  }
}

function resolveURLLikeSelector(value: string) {
  try {
    return resolveInputSource(value);
  } catch {
    if (/^(?:www\.)?(?:github|gitee)\.com\//i.test(value)) {
      try {
        return resolveInputSource(`https://${value}`);
      } catch {
        return null;
      }
    }

    return null;
  }
}

function addURLVariants(variants: Set<string>, value: string) {
  const source = resolveURLLikeSelector(value);

  if (!source) {
    return;
  }

  addSelectorVariant(variants, source.repositoryUrl);

  if (source.kind === "github-repository") {
    addRepositoryPathVariants(variants, source.repositoryPath, ["github"], false);
  } else if (source.kind === "gitee-repository") {
    addRepositoryPathVariants(variants, source.repositoryPath, ["gitee"], false);
  }
}

/**
 * Expands a package selector into the supported lookup forms.
 */
function getSelectorVariants(selector: string) {
  const variants = new Set<string>();
  const normalizedSelector = selector.trim().replace(/\/+$/, "");
  const resolvedSource = resolveURLLikeSelector(normalizedSelector);

  addSelectorVariant(variants, normalizedSelector);

  if (resolvedSource) {
    addURLVariants(variants, normalizedSelector);
    return [...variants];
  }

  addRepositoryPathVariants(
    variants,
    normalizedSelector
      .replace(/^https?:\/\/(?:www\.)?github\.com\//i, "")
      .replace(/^github\.com\//i, "")
      .replace(/^https?:\/\/(?:www\.)?gitee\.com\//i, "")
      .replace(/^gitee\.com\//i, "")
      .replace(/^https?:\/\/api\.github\.com\/repos\//i, "")
      .replace(/^https?:\/\/gitee\.com\/api\/v5\/repos\//i, ""),
  );

  return [...variants];
}

function getDependencyRepositoryVariants(dependency: InstalledDependency) {
  const variants = new Set<string>();
  const provider = getRepositoryProvider(dependency.repository.url);

  addSelectorVariant(variants, dependency.repository.path);
  addSelectorVariant(variants, dependency.repository.url);
  addURLVariants(variants, dependency.repository.url);
  addRepositoryPathVariants(
    variants,
    dependency.repository.path,
    provider ? [provider] : [],
  );

  return variants;
}

function getDependencySelectorVariants(dependency: InstalledDependency) {
  const variants = getDependencyRepositoryVariants(dependency);

  addSelectorVariant(variants, dependency.name);

  return variants;
}

/**
 * Checks whether one installed dependency matches a user-provided selector.
 */
function matchesDependencySelector(
  dependency: InstalledDependency,
  selector: string,
) {
  const variants = getSelectorVariants(selector);
  const dependencyVariants = getDependencySelectorVariants(dependency);

  return variants.some((variant) => dependencyVariants.has(variant));
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
    const repositoryVariants = getDependencyRepositoryVariants(dependency);

    return variants.some((variant) => repositoryVariants.has(variant));
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

function hasExplicitVersionOption(options: GetPkgOptions) {
  return Boolean(options.tag || options.branch);
}

function getUpdatedPackageOptions(
  dependency: InstalledDependency,
  options: GetPkgOptions,
) {
  const updatedOptions: GetPkgOptions = {
    ...options,
    fullProject: options.fullProject || dependency.install.mode === "full-project",
  };
  const requested = dependency.source.requested;

  if (options.tag) {
    updatedOptions.tag = options.tag;
    delete updatedOptions.branch;
    return updatedOptions;
  }

  if (options.branch) {
    updatedOptions.branch = options.branch;
    delete updatedOptions.tag;
    return updatedOptions;
  }

  if (requested?.type === "tag" && requested.value) {
    updatedOptions.tag = requested.value;
    delete updatedOptions.branch;
  } else if (requested?.type === "branch" && requested.value) {
    updatedOptions.branch = requested.value;
    delete updatedOptions.tag;
  }

  if (requested?.includePrerelease && options.prerelease === undefined) {
    updatedOptions.prerelease = true;
  }

  return updatedOptions;
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
    (item) => getDependencyIdentity(item) !== getDependencyIdentity(dependency),
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
  if (!selector && hasExplicitVersionOption(options)) {
    throw new Error("Options --tag and --branch require a package selector.");
  }

  const installed = await readInstalledDependencies();

  if (!installed.dependencies.length) {
    logger.warn(`No installed packages found in ${resolvePackageRootPath()}.`);
    return {
      updatedDependencies: [],
    };
  }

  const targetSelectors = selector
    ? [
        resolveInstalledDependency(installed.dependencies, selector).repository
          .url,
      ]
    : installed.dependencies.map((dependency) => dependency.repository.url);

  const updatedDependencies: InstalledDependency[] = [];

  for (const targetSelector of targetSelectors) {
    const current = await readInstalledDependencies();
    const dependency = resolveInstalledDependency(
      current.dependencies,
      targetSelector,
    );
    const otherDependencies = current.dependencies.filter(
      (item) => getDependencyIdentity(item) !== getDependencyIdentity(dependency),
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

    await getVCPkg(
      dependency.repository.url,
      getUpdatedPackageOptions(dependency, options),
    );
    updatedDependencies.push(dependency);
  }

  return {
    updatedDependencies,
  };
}
