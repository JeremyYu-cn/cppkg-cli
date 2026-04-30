import type {
  InstalledDependency,
  SourceRequest,
} from "../types/global";
import type { ManifestDependency } from "../public/manifest";
import { promises as fsp } from "node:fs";
import path from "node:path";
import { MANIFEST_FILE_NAME, readPackageManifest } from "../public/manifest";
import { getTrackedInstallPaths, readInstalledDependencies } from "./deps";
import {
  LOCK_FILE_NAME,
  type LockedDependency,
  readPackageLock,
} from "./lockfile";
import { resolveInputSource } from "./download/sources";

export type ProjectStatusIssue = {
  code: string;
  message: string;
  packageName: string;
  severity: "error" | "warn";
};

export type ProjectStatus = {
  issues: ProjectStatusIssue[];
};

function getDependencyIdentity(
  dependency: Pick<InstalledDependency | LockedDependency, "repository">,
) {
  return (
    dependency.repository.url.trim().replace(/\/+$/, "").replace(/\.git$/i, "") ||
    dependency.repository.path
  );
}

function getManifestDependencyIdentity(dependency: ManifestDependency) {
  return resolveInputSource(dependency.source).repositoryUrl
    .trim()
    .replace(/\/+$/, "")
    .replace(/\.git$/i, "");
}

function getManifestDependencyName(dependency: ManifestDependency) {
  return dependency.name || resolveInputSource(dependency.source).packageName;
}

function getManifestSourceRequest(dependency: ManifestDependency): SourceRequest {
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

async function pathExists(targetPath: string) {
  try {
    await fsp.access(targetPath);
    return true;
  } catch (error: unknown) {
    const nodeError = error as NodeJS.ErrnoException;

    if (nodeError.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

function toIssue(
  severity: ProjectStatusIssue["severity"],
  code: string,
  packageName: string,
  message: string,
): ProjectStatusIssue {
  return {
    code,
    message,
    packageName,
    severity,
  };
}

export async function getProjectStatus(): Promise<ProjectStatus> {
  const issues: ProjectStatusIssue[] = [];
  let manifestDependencies: ManifestDependency[] = [];

  try {
    manifestDependencies = (await readPackageManifest()).dependencies;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);

    issues.push(
      toIssue(
        "error",
        "manifest",
        MANIFEST_FILE_NAME,
        message,
      ),
    );
  }

  const installed = await readInstalledDependencies();
  const lockfile = await readPackageLock({ allowMissing: true });
  const manifestIdentities = new Map(
    manifestDependencies.map((dependency) => [
      getManifestDependencyIdentity(dependency),
      dependency,
    ]),
  );
  const installedIdentities = new Map(
    installed.dependencies.map((dependency) => [
      getDependencyIdentity(dependency),
      dependency,
    ]),
  );
  const lockedIdentities = new Map(
    (lockfile?.dependencies ?? []).map((dependency) => [
      getDependencyIdentity(dependency),
      dependency,
    ]),
  );

  for (const dependency of manifestDependencies) {
    const identity = getManifestDependencyIdentity(dependency);
    const packageName = getManifestDependencyName(dependency);
    const installedDependency = installedIdentities.get(identity);
    const lockedDependency = lockedIdentities.get(identity);

    if (!installedDependency) {
      issues.push(
        toIssue(
          "error",
          "missing-install",
          packageName,
          "Declared in cppkg.json but not installed.",
        ),
      );
    }

    if (!lockfile) {
      issues.push(
        toIssue(
          "warn",
          "missing-lock",
          packageName,
          `${LOCK_FILE_NAME} does not exist.`,
        ),
      );
    } else if (!lockedDependency) {
      issues.push(
        toIssue(
          "warn",
          "missing-lock",
          packageName,
          `Declared in cppkg.json but missing from ${LOCK_FILE_NAME}.`,
        ),
      );
    } else if (
      !sourceRequestsEqual(
        lockedDependency.source.requested,
        getManifestSourceRequest(dependency),
      )
    ) {
      issues.push(
        toIssue(
          "warn",
          "stale-lock",
          packageName,
          `${LOCK_FILE_NAME} does not match cppkg.json.`,
        ),
      );
    }
  }

  for (const dependency of installed.dependencies) {
    const identity = getDependencyIdentity(dependency);

    if (!manifestIdentities.has(identity)) {
      issues.push(
        toIssue(
          "warn",
          "extraneous-install",
          dependency.name,
          "Installed but not declared in cppkg.json.",
        ),
      );
    }

    for (const trackedPath of getTrackedInstallPaths(dependency)) {
      const filesystemPath = path.join(
        path.resolve(process.cwd(), dependency.install.target),
        trackedPath,
      );

      if (!await pathExists(filesystemPath)) {
        issues.push(
          toIssue(
            "error",
            "missing-path",
            dependency.name,
            `Tracked path is missing: ${path.join(dependency.install.target, trackedPath)}`,
          ),
        );
      }
    }
  }

  return {
    issues,
  };
}
