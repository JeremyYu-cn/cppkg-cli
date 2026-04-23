import type {
  InstalledDependenciesFile,
  InstalledDependency,
} from "../types/global";
import { promises as fsp } from "node:fs";
import path from "node:path";
import { getDepsFilePath } from "../public/packagePath";

const EMPTY_DEPENDENCIES_FILE: InstalledDependenciesFile = {
  dependencies: [],
};

/**
 * Keeps dependency records stable by sorting them by name and repository path.
 */
function sortDependencies(dependencies: InstalledDependency[]) {
  return [...dependencies].sort((left, right) => {
    const byName = left.name.localeCompare(right.name);

    if (byName !== 0) {
      return byName;
    }

    return left.repository.path.localeCompare(right.repository.path);
  });
}

/**
 * Normalizes tracked paths so metadata uses forward slashes and no leading dot segments.
 */
export function normalizeTrackedPath(targetPath: string) {
  return targetPath.replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/^\/+/, "");
}

/**
 * De-duplicates and sorts tracked paths after normalization.
 */
function getUniqueSortedPaths(paths: string[]) {
  return [...new Set(paths.map(normalizeTrackedPath).filter(Boolean))].sort();
}

/**
 * Collapses tracked paths to their top-level installed entry names.
 */
function getUniqueSortedTopLevelPaths(paths: string[]) {
  return getUniqueSortedPaths(paths.map((targetPath) => {
    const normalizedPath = normalizeTrackedPath(targetPath);

    return normalizedPath.split("/").filter(Boolean)[0] ?? normalizedPath;
  }));
}

/**
 * Fills backward-compatible defaults for dependency install metadata.
 */
function normalizeInstalledDependency(
  dependency: InstalledDependency,
): InstalledDependency {
  const headersSource =
    dependency.install?.headers?.length
      ? dependency.install.headers
      : dependency.install?.paths ?? [];
  const headers = getUniqueSortedTopLevelPaths(headersSource);
  const paths = getUniqueSortedTopLevelPaths(
    dependency.install?.paths?.length ? dependency.install.paths : headers,
  );

  return {
    ...dependency,
    install: {
      target: dependency.install?.target || "cpp_libs/include",
      headers,
      paths,
    },
  };
}

/**
 * Returns the tracked top-level installed paths recorded for one package.
 */
export function getTrackedInstallPaths(dependency: InstalledDependency) {
  return dependency.install.paths;
}

/**
 * Reads and normalizes the dependency metadata file from cpp_libs/deps.json.
 */
export async function readInstalledDependencies() {
  const depsFilePath = getDepsFilePath();

  try {
    const content = await fsp.readFile(depsFilePath, "utf8");
    const parsed = JSON.parse(content) as Partial<InstalledDependenciesFile>;

    if (!Array.isArray(parsed.dependencies)) {
      return EMPTY_DEPENDENCIES_FILE;
    }

    return {
      dependencies: sortDependencies(
        (parsed.dependencies as InstalledDependency[]).map(
          normalizeInstalledDependency,
        ),
      ),
    };
  } catch (error: unknown) {
    const nodeError = error as NodeJS.ErrnoException;

    if (nodeError.code === "ENOENT") {
      return EMPTY_DEPENDENCIES_FILE;
    }

    throw error;
  }
}

/**
 * Persists the full dependency metadata file back to disk.
 */
export async function writeInstalledDependencies(
  dependencies: InstalledDependency[],
) {
  const depsFilePath = getDepsFilePath();

  await fsp.mkdir(path.dirname(depsFilePath), {
    recursive: true,
  });
  await fsp.writeFile(
    depsFilePath,
    `${JSON.stringify(
      {
        dependencies: sortDependencies(
          dependencies.map(normalizeInstalledDependency),
        ),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

/**
 * Inserts or replaces one installed package record in deps.json.
 */
export async function upsertInstalledDependency(
  dependency: InstalledDependency,
) {
  const installed = await readInstalledDependencies();
  const dependencies = installed.dependencies.filter(
    (item) => item.repository.path !== dependency.repository.path,
  );

  dependencies.push(normalizeInstalledDependency(dependency));

  await writeInstalledDependencies(dependencies);
}
