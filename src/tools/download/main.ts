import type { GetPkgOptions } from "../../types/global";
import type {
  ArchiveDescriptor,
  ProviderRelease,
  ResolvedGiteeRepositoryInput,
  ResolvedGitHubRepositoryInput,
} from "./types";
import { promises as fsp } from "node:fs";
import os from "node:os";
import path from "node:path";
import { prepareArchive } from "./archive";
import { installIncludePackage } from "./include";
import { installProjectPackage } from "./project";
import {
  fetchGiteeRepository,
  fetchGitHubRepository,
  fetchLatestGiteeRelease,
  fetchLatestGitHubRelease,
  pickGiteeReleaseArchive,
  pickGiteeRepositoryArchive,
  pickGitHubReleaseArchive,
  pickGitHubRepositoryArchive,
  resolveInputSource,
} from "./sources";

type ReleaseBackedRepositoryContext<TRelease extends ProviderRelease> = {
  inputSource: ResolvedGiteeRepositoryInput | ResolvedGitHubRepositoryInput;
  options: GetPkgOptions;
  packageName: string;
  release: TRelease | null;
  releaseArchive: (release: TRelease) => ArchiveDescriptor;
  repoPath: string;
  repositoryArchive: ArchiveDescriptor;
  tempDir: string;
};

/**
 * Finds the first archive candidate that contains a usable include directory.
 */
async function selectHeaderArchive(
  tempDir: string,
  packageName: string,
  archives: ArchiveDescriptor[],
  options: GetPkgOptions = {},
) {
  const attemptedArchiveURLs = new Set<string>();
  let attemptIndex = 0;

  for (const archive of archives) {
    if (attemptedArchiveURLs.has(archive.url)) {
      continue;
    }

    attemptedArchiveURLs.add(archive.url);

    const prepared = await prepareArchive(
      tempDir,
      packageName,
      archive,
      `probe-${attemptIndex}`,
      options,
    );

    attemptIndex += 1;

    if (prepared.includeDirs.length) {
      return prepared;
    }

    console.log(
      archive.kind === "github-release" || archive.kind === "gitee-release"
        ? `Release archive ${archive.label} does not contain a usable include directory`
        : `Repository archive ${archive.label} does not contain a usable include directory`,
    );
  }

  return null;
}

/**
 * Handles one repository source that may resolve to either header installation or full project installation.
 */
async function installReleaseAwareRepository<TRelease extends ProviderRelease>(
  context: ReleaseBackedRepositoryContext<TRelease>,
) {
  const {
    inputSource,
    options,
    packageName,
    release,
    releaseArchive,
    repoPath,
    repositoryArchive,
    tempDir,
  } = context;

  console.log(`Resolving install mode for ${repoPath}`);

  if (!release) {
    console.log(
      `No published release found for ${repoPath}, installing the repository archive from ${repositoryArchive.label.replace(/\.zip$/i, "")}`,
    );

    const prepared = await prepareArchive(
      tempDir,
      packageName,
      repositoryArchive,
      "project",
      options,
    );
    await installProjectPackage(inputSource, null, prepared);
    return;
  }

  console.log(
    `Found release ${release.tag_name || release.name || "latest"}, installing reusable headers`,
  );

  const preparedHeaderArchive = await selectHeaderArchive(
    tempDir,
    packageName,
    [releaseArchive(release), repositoryArchive],
    options,
  );

  if (!preparedHeaderArchive) {
    throw new Error(
      `No usable include directory was found for ${repoPath} even though a release exists.`,
    );
  }

  await installIncludePackage(inputSource, release, preparedHeaderArchive);
}

/**
 * Downloads, extracts, installs, and records one GitHub-hosted or direct-archive C/C++ package.
 */
export async function getVCPkg(repoURL: string, options: GetPkgOptions = {}) {
  const inputSource = resolveInputSource(repoURL);
  const packageName = inputSource.packageName;
  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), "cppkg-cli-"));

  try {
    if (inputSource.kind === "archive-url") {
      console.log(`Resolving install mode for ${inputSource.repositoryUrl}`);
      console.log(
        `No GitHub releases API is available for ${inputSource.repositoryUrl}, installing the archive as a full project`,
      );

      const prepared = await prepareArchive(
        tempDir,
        packageName,
        inputSource.archive,
        "project",
        options,
      );
      await installProjectPackage(inputSource, null, prepared);
      return;
    }

    if (inputSource.kind === "gitee-repository") {
      const repository = await fetchGiteeRepository(
        inputSource.repositoryPath,
        options,
      );
      const release = await fetchLatestGiteeRelease(
        inputSource.repositoryPath,
        options,
      );

      await installReleaseAwareRepository({
        inputSource,
        options,
        packageName,
        release,
        releaseArchive: (nextRelease) =>
          pickGiteeReleaseArchive(inputSource.repositoryPath, nextRelease),
        repoPath: inputSource.repositoryPath,
        repositoryArchive: pickGiteeRepositoryArchive(
          inputSource.repositoryPath,
          repository,
        ),
        tempDir,
      });
      return;
    }

    const repository = await fetchGitHubRepository(
      inputSource.repositoryPath,
      options,
    );
    const release = await fetchLatestGitHubRelease(
      inputSource.repositoryPath,
      options,
    );

    await installReleaseAwareRepository({
      inputSource,
      options,
      packageName,
      release,
      releaseArchive: pickGitHubReleaseArchive,
      repoPath: inputSource.repositoryPath,
      repositoryArchive: pickGitHubRepositoryArchive(
        inputSource.repositoryPath,
        repository,
      ),
      tempDir,
    });
  } finally {
    await fsp.rm(tempDir, { force: true, recursive: true });
  }
}
