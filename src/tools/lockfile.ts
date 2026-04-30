import type {
  GetPkgOptions,
  InstalledDependency,
  SourceRequest,
} from "../types/global";
import type { ManifestDependency } from "../public/manifest";
import { promises as fsp } from "node:fs";
import path from "node:path";
import { resolveInputSource } from "./download/sources";

export const LOCK_FILE_NAME = "cppkg-lock.json";

export type LockedDependency = Omit<InstalledDependency, "installedAt">;

export type PackageLockFile = {
  dependencies: LockedDependency[];
  lockfileVersion: 1;
};

function getDependencyIdentity(dependency: Pick<InstalledDependency, "repository">) {
  return (
    dependency.repository.url.trim().replace(/\/+$/, "").replace(/\.git$/i, "") ||
    dependency.repository.path
  );
}

function sortLockedDependencies(dependencies: LockedDependency[]) {
  return [...dependencies].sort((left, right) => {
    const byName = left.name.localeCompare(right.name);

    if (byName !== 0) {
      return byName;
    }

    return (
      left.repository.path.localeCompare(right.repository.path) ||
      getDependencyIdentity(left).localeCompare(getDependencyIdentity(right))
    );
  });
}

function toLockedDependency(dependency: InstalledDependency): LockedDependency {
  return {
    install: dependency.install,
    name: dependency.name,
    release: dependency.release,
    repository: dependency.repository,
    source: dependency.source,
    type: dependency.type,
    version: dependency.version,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readManifestSourceRequest(dependency: ManifestDependency): SourceRequest {
  if (dependency.tag) {
    return {
      type: "tag",
      value: dependency.tag,
    };
  }

  if (dependency.branch) {
    return {
      type: "branch",
      value: dependency.branch,
    };
  }

  return {
    type: "latest-release",
    value: null,
    ...(dependency.prerelease ? { includePrerelease: true } : {}),
  };
}

function sourceRequestsEqual(left: SourceRequest | undefined, right: SourceRequest) {
  return (
    left?.type === right.type &&
    (left.value ?? null) === (right.value ?? null) &&
    Boolean(left.includePrerelease) === Boolean(right.includePrerelease)
  );
}

function resolveManifestSourceIdentity(dependency: ManifestDependency) {
  return resolveInputSource(dependency.source).repositoryUrl
    .trim()
    .replace(/\/+$/, "")
    .replace(/\.git$/i, "");
}

function getDependencyLabel(dependency: ManifestDependency) {
  return dependency.name || resolveInputSource(dependency.source).packageName;
}

function findLockedDependency(
  lockfile: PackageLockFile,
  dependency: ManifestDependency,
) {
  const sourceIdentity = resolveManifestSourceIdentity(dependency);

  return lockfile.dependencies.find(
    (locked) => getDependencyIdentity(locked) === sourceIdentity,
  );
}

function compactOptions(options: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(options).filter(([, value]) => value !== undefined),
  ) as GetPkgOptions;
}

export function getLockFilePath() {
  return path.resolve(process.cwd(), LOCK_FILE_NAME);
}

export async function readPackageLock(options: { allowMissing?: boolean } = {}) {
  const lockFilePath = getLockFilePath();

  try {
    const parsed = JSON.parse(await fsp.readFile(lockFilePath, "utf8")) as unknown;

    if (!isRecord(parsed) || parsed.lockfileVersion !== 1) {
      throw new Error(`${LOCK_FILE_NAME} must contain lockfileVersion 1.`);
    }

    if (!Array.isArray(parsed.dependencies)) {
      throw new Error(`${LOCK_FILE_NAME} must define dependencies.`);
    }

    return {
      dependencies: sortLockedDependencies(
        parsed.dependencies as LockedDependency[],
      ),
      lockfileVersion: 1,
    } satisfies PackageLockFile;
  } catch (error: unknown) {
    const nodeError = error as NodeJS.ErrnoException;

    if (nodeError.code === "ENOENT" && options.allowMissing) {
      return null;
    }

    if (nodeError.code === "ENOENT") {
      throw new Error(`Cannot find ${LOCK_FILE_NAME}. Run "cppkg-cli install" first.`);
    }

    throw error;
  }
}

export async function writePackageLockFromDependencies(
  dependencies: InstalledDependency[],
) {
  const lockFilePath = getLockFilePath();
  const lockfile: PackageLockFile = {
    dependencies: sortLockedDependencies(dependencies.map(toLockedDependency)),
    lockfileVersion: 1,
  };

  await fsp.writeFile(
    lockFilePath,
    `${JSON.stringify(lockfile, null, 2)}\n`,
    "utf8",
  );
}

export async function requireLockedManifestDependencies(
  dependencies: ManifestDependency[],
) {
  const lockfile = await readPackageLock();

  if (!lockfile) {
    throw new Error(`Cannot find ${LOCK_FILE_NAME}. Run "cppkg-cli install" first.`);
  }

  return dependencies.map((dependency) => {
    const locked = findLockedDependency(lockfile, dependency);
    const label = getDependencyLabel(dependency);

    if (!locked) {
      throw new Error(
        `Lockfile is missing dependency ${label}. Run "cppkg-cli install" to update ${LOCK_FILE_NAME}.`,
      );
    }

    const expectedRequest = readManifestSourceRequest(dependency);

    if (!sourceRequestsEqual(locked.source.requested, expectedRequest)) {
      throw new Error(
        `Lockfile entry for ${label} does not match cppkg.json. Run "cppkg-cli install" to update ${LOCK_FILE_NAME}.`,
      );
    }

    if (dependency.fullProject && locked.install.mode !== "full-project") {
      throw new Error(
        `Lockfile entry for ${label} was not resolved as a full project. Run "cppkg-cli install" to update ${LOCK_FILE_NAME}.`,
      );
    }

    return locked;
  });
}

export function getFrozenManifestDependencyOptions(
  dependency: ManifestDependency,
  locked: LockedDependency,
  cliOptions: Pick<GetPkgOptions, "cache" | "httpProxy" | "httpsProxy"> = {},
): GetPkgOptions {
  const requested = locked.source.requested;
  const options = compactOptions({
    cache: cliOptions.cache,
    fullProject: dependency.fullProject || locked.install.mode === "full-project",
    httpProxy: cliOptions.httpProxy,
    httpsProxy: cliOptions.httpsProxy,
    prerelease: requested?.includePrerelease || undefined,
  });

  if (requested?.type === "tag" && requested.value) {
    options.tag = requested.value;
  } else if (requested?.type === "branch" && requested.value) {
    options.branch = requested.value;
  } else if (requested?.type === "latest-release") {
    const lockedTag = locked.release.tagName || locked.release.name;

    if (lockedTag) {
      options.tag = lockedTag;
      delete options.prerelease;
    }
  }

  return options;
}
