import type { GetPkgOptions } from "../types/global";
import { promises as fsp } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { readPackageLock, type LockedDependency } from "./lockfile";
import { resolvePackageRootPath } from "../public/packagePath";
import { getVCPkg } from "./download/main";

export type VerifyIssue = {
  packageName: string;
  severity: "error" | "warn";
  code: string;
  message: string;
};

export type VerifyResult = {
  issues: VerifyIssue[];
  verified: number;
  passed: number;
};

function lockedDepToOptions(
  dep: LockedDependency,
): GetPkgOptions {
  const requested = dep.source.requested;
  const options: GetPkgOptions = {};

  if (requested) {
    if (requested.type === "tag" && requested.value) {
      options.tag = requested.value;
    } else if (requested.type === "branch" && requested.value) {
      options.branch = requested.value;
    } else if (requested.type === "latest-release" || requested.type === "version-range") {
      const lockedTag = dep.release.tagName || dep.release.name;
      if (lockedTag) {
        options.tag = lockedTag;
      }
    } else if (requested.type === "default-branch") {
      const archiveName = dep.source.archiveName.replace(/\.zip$/i, "");
      if (archiveName) {
        options.branch = archiveName;
      }
    }

    if (requested.includePrerelease) options.prerelease = true;
    if (requested.includePath?.length) options.includePath = requested.includePath;
    if (requested.stripPrefix) options.stripPrefix = requested.stripPrefix;
    if (requested.patches?.length) options.patches = requested.patches;
    if (requested.components?.length) options.components = requested.components;
    if (requested.checksum) options.checksum = requested.checksum;
  }

  if (dep.install.mode === "full-project") options.fullProject = true;

  return options;
}

export async function verifyPackages(fix?: boolean): Promise<VerifyResult> {
  let lockfile;
  try {
    lockfile = await readPackageLock();
  } catch {
    return { issues: [], verified: 0, passed: 0 };
  }
  const issues: VerifyIssue[] = [];
  let verified = 0;
  let passed = 0;

  if (!lockfile) {
    return { issues: [], verified: 0, passed: 0 };
  }

  const fixQueue: LockedDependency[] = [];

  for (const dep of lockfile.dependencies) {
    verified++;
    const expectedChecksum = dep.source.integrity?.sha256;

    if (!expectedChecksum) {
      issues.push({
        packageName: dep.name,
        severity: "warn",
        code: "no-checksum",
        message: `No checksum recorded in lockfile for ${dep.name}`,
      });
      continue;
    }

    let allFilesMatch = true;

    for (const trackedPath of dep.install.paths) {
      const fullPath = path.resolve(resolvePackageRootPath(), trackedPath);

      try {
        const stat = await fsp.stat(fullPath);
        if (!stat.isFile() && !stat.isDirectory()) continue;

        if (stat.isFile()) {
          const content = await fsp.readFile(fullPath);
          const actualHash = createHash("sha256").update(content).digest("hex");

          if (actualHash !== expectedChecksum) {
            allFilesMatch = false;
            issues.push({
              packageName: dep.name,
              severity: "error",
              code: "checksum-mismatch",
              message: `Checksum mismatch for ${dep.name}: ${trackedPath}`,
            });
          }
        }
      } catch (error: unknown) {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError.code === "ENOENT") {
          allFilesMatch = false;
          issues.push({
            packageName: dep.name,
            severity: "error",
            code: "missing-path",
            message: `Missing tracked path for ${dep.name}: ${trackedPath}`,
          });
        }
      }
    }

    if (allFilesMatch) {
      passed++;
    } else if (fix) {
      fixQueue.push(dep);
    }
  }

  if (fix && fixQueue.length > 0) {
    for (const dep of fixQueue) {
      issues.push({
        packageName: dep.name,
        severity: "warn",
        code: "reinstalling",
        message: `Reinstalling ${dep.name}...`,
      });
      try {
        const options = lockedDepToOptions(dep);
        await getVCPkg(dep.repository.url, options);
        issues.push({
          packageName: dep.name,
          severity: "warn",
          code: "reinstalled",
          message: `Successfully reinstalled ${dep.name}`,
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        issues.push({
          packageName: dep.name,
          severity: "error",
          code: "reinstall-failed",
          message: `Failed to reinstall ${dep.name}: ${message}`,
        });
      }
    }
  }

  return { issues, verified, passed };
}


