import type { LockedDependency, PackageLockFile } from "./lockfile";
import { readPackageLock } from "./lockfile";
import type { ManifestDependency } from "../public/manifest";
import { readPackageManifest, MANIFEST_FILE_NAME } from "../public/manifest";
import { resolveInputSource } from "./download/sources";

export type DiffEntry = {
  name: string;
  field: string;
  oldValue: string;
  newValue: string;
};

export type DiffResult = {
  entries: DiffEntry[];
  manifestChanged: boolean;
  lockfileMissing: boolean;
};

function getManifestSourceIdentity(dep: ManifestDependency): string {
  return resolveInputSource(dep.source).repositoryUrl
    .trim()
    .replace(/\/+$/, "")
    .replace(/\.git$/i, "");
}

export async function diffLockfile(): Promise<DiffResult> {
  const manifest = await readPackageManifest().catch(() => null);
  const lockfile = await readPackageLock({ allowMissing: true });

  const entries: DiffEntry[] = [];

  if (!lockfile) {
    return { entries, manifestChanged: true, lockfileMissing: true };
  }

  if (!manifest || !manifest.dependencies.length) {
    return { entries, manifestChanged: true, lockfileMissing: false };
  }

  const lockfileMap = new Map<string, LockedDependency>();
  for (const dep of lockfile.dependencies) {
    const identity = dep.repository.url.trim().replace(/\/+$/, "").replace(/\.git$/i, "");
    lockfileMap.set(identity.toLowerCase(), dep);
  }

  function addDiff(name: string, field: string, oldValue: string, newValue: string) {
    if (oldValue !== newValue) {
      entries.push({ name, field, oldValue, newValue });
    }
  }

  for (const manifestDep of manifest.dependencies) {
    const identity = getManifestSourceIdentity(manifestDep).toLowerCase();
    const locked = lockfileMap.get(identity);

    if (!locked) {
      entries.push({
        name: manifestDep.name || "unknown",
        field: "status",
        oldValue: "not in lockfile",
        newValue: "in manifest",
      });
      continue;
    }

    const name = manifestDep.name || locked.name;
    const req = locked.source.requested;

    addDiff(name, "tag", req?.type === "tag" ? (req.value ?? "") : "", manifestDep.tag ?? "");
    addDiff(name, "branch", req?.type === "branch" ? (req.value ?? "") : "", manifestDep.branch ?? "");
    addDiff(name, "versionRange", req?.type === "version-range" ? (req.value ?? "") : "", manifestDep.versionRange ?? "");
    addDiff(name, "versionPolicy", req?.type ?? "latest-release", manifestDep.versionPolicy ?? "latest-release");
    addDiff(name, "prerelease", String(req?.includePrerelease ?? false), String(manifestDep.prerelease ?? false));
    addDiff(name, "includePath", JSON.stringify(req?.includePath ?? []), JSON.stringify(manifestDep.includePath ?? []));
    addDiff(name, "stripPrefix", req?.stripPrefix ?? "", manifestDep.stripPrefix ?? "");
    addDiff(name, "patches", JSON.stringify(req?.patches ?? []), JSON.stringify(manifestDep.patches ?? []));
    addDiff(name, "components", JSON.stringify(req?.components ?? []), JSON.stringify(manifestDep.components ?? []));
    addDiff(name, "checksum", req?.checksum ?? "", manifestDep.checksum ?? "");
  }

  return {
    entries,
    manifestChanged: entries.length > 0,
    lockfileMissing: false,
  };
}
