import type { PreparedArchive, ProviderRelease, ResolvedInputSource } from "./types";
import { promises as fsp } from "node:fs";
import path from "node:path";
import { getProjectsRootPath } from "../../public/packagePath";
import { normalizeTrackedPath, upsertInstalledDependency } from "../deps";
import { buildInstalledDependency } from "./metadata";

/**
 * Copies the full extracted project into a dedicated project directory.
 */
async function installWholeProject(
  sourceRootPath: string,
  targetProjectPath: string,
) {
  await fsp.rm(targetProjectPath, { force: true, recursive: true });
  await fsp.mkdir(targetProjectPath, { recursive: true });

  const entries = await fsp.readdir(sourceRootPath, { withFileTypes: true });
  const installedEntries = new Set<string>();

  for (const entry of entries) {
    const sourcePath = path.join(sourceRootPath, entry.name);
    const targetPath = path.join(targetProjectPath, entry.name);
    const relativePath = normalizeTrackedPath(entry.name);

    await fsp.cp(sourcePath, targetPath, {
      force: true,
      recursive: entry.isDirectory(),
    });

    installedEntries.add(relativePath);
  }

  return {
    headers: [...installedEntries].sort(),
    paths: [...installedEntries].sort(),
  };
}

/**
 * Installs one prepared archive as a full project and records metadata.
 */
export async function installProjectPackage(
  inputSource: ResolvedInputSource,
  release: ProviderRelease | null,
  preparedArchive: PreparedArchive,
) {
  const projectsRootPath = getProjectsRootPath();
  const installRootPath = path.join(
    projectsRootPath,
    inputSource.projectInstallDirName,
  );
  const installPath =
    path.relative(process.cwd(), installRootPath) || inputSource.projectInstallDirName;
  const installed = await installWholeProject(
    preparedArchive.sourceRootPath,
    installRootPath,
  );
  const installedDependency = buildInstalledDependency(
    inputSource,
    installPath,
    release,
    preparedArchive.archive,
    installed.headers,
    installed.paths,
    "need-compile",
  );

  await upsertInstalledDependency(installedDependency);

  console.log(
    `Installed full project ${inputSource.packageName} into ${installPath}`,
  );
  console.log(`Entries: ${installed.headers.join(", ")}`);
  console.log(
    `Recorded dependency metadata in ${path.relative(process.cwd(), path.join(projectsRootPath, "..", "deps.json"))}`,
  );
}
