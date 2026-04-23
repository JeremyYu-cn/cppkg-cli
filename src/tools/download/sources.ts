import type { GitHubRelease } from "../../types/github";
import type { GetPkgOptions } from "../../types/global";
import axios from "axios";
import path from "node:path";
import { getRequestProxy } from "../request";
import type {
  ArchiveDescriptor,
  GiteeRelease,
  GiteeRepository,
  GitHubReleaseAsset,
  GitHubRepository,
  ResolvedInputSource,
} from "./types";

const ZIP_CONTENT_TYPES = new Set([
  "application/octet-stream",
  "application/x-zip-compressed",
  "application/zip",
]);

/**
 * Returns the GitHub repository path when one repository root URL is provided.
 */
function tryParseGitHubRepoPath(inputURL: string) {
  const repo = new URL(inputURL);

  const isRepositoryPage = ["github.com", "www.github.com"].includes(
    repo.hostname,
  );
  const isApiRepository = repo.hostname === "api.github.com";

  if (!isRepositoryPage && !isApiRepository) {
    return null;
  }

  const parts = repo.pathname.replace(/\/+$/, "").split("/").filter(Boolean);

  if (isApiRepository) {
    if (parts.length !== 3 || parts[0] !== "repos") {
      return null;
    }

    const owner = parts[1]!;
    const repoName = parts[2]!.replace(/\.git$/, "");

    return `/${owner}/${repoName}`;
  }

  if (parts.length !== 2) {
    return null;
  }

  const owner = parts[0]!;
  const repoName = parts[1]!.replace(/\.git$/, "");

  return `/${owner}/${repoName}`;
}

/**
 * Returns the Gitee repository path when one repository root URL is provided.
 */
function tryParseGiteeRepoPath(inputURL: string) {
  const repo = new URL(inputURL);

  const isRepositoryPage = ["gitee.com", "www.gitee.com"].includes(
    repo.hostname,
  );
  const isApiRepository = repo.hostname === "gitee.com";

  if (!isRepositoryPage && !isApiRepository) {
    return null;
  }

  const parts = repo.pathname.replace(/\/+$/, "").split("/").filter(Boolean);

  if (parts[0] === "api" && parts[1] === "v5") {
    if (parts.length !== 5 || parts[2] !== "repos") {
      return null;
    }

    const owner = parts[3]!;
    const repoName = parts[4]!.replace(/\.git$/, "");

    return `/${owner}/${repoName}`;
  }

  if (parts.length !== 2) {
    return null;
  }

  const owner = parts[0]!;
  const repoName = parts[1]!.replace(/\.git$/, "");

  return `/${owner}/${repoName}`;
}

/**
 * Derives a package display name from the repository path.
 */
function getPackageName(repoPath: string) {
  return repoPath.split("/").filter(Boolean).at(-1) ?? "package";
}

/**
 * Rebuilds the canonical GitHub repository URL from the repository path.
 */
function getGitHubRepositoryURL(repoPath: string) {
  return `https://github.com${repoPath}`;
}

/**
 * Rebuilds the canonical Gitee repository URL from the repository path.
 */
function getGiteeRepositoryURL(repoPath: string) {
  return `https://gitee.com${repoPath}.git`;
}

/**
 * Creates a stable directory name for one installed project.
 */
function getProjectInstallDirName(identifier: string) {
  return identifier
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120) || "project";
}

/**
 * Derives a readable archive file name from one remote archive URL.
 */
function getArchiveNameFromURL(archiveURL: string) {
  const parsed = new URL(archiveURL);
  const rawName = decodeURIComponent(path.posix.basename(parsed.pathname));

  if (!rawName) {
    return `${parsed.hostname}.zip`;
  }

  return rawName.endsWith(".zip") ? rawName : `${rawName}.zip`;
}

/**
 * Derives one package display name from a remote archive URL.
 */
function getArchivePackageName(archiveURL: string) {
  const archiveName = getArchiveNameFromURL(archiveURL);
  return archiveName.replace(/\.zip$/i, "") || "package";
}

/**
 * Resolves the user input into either a GitHub repository source or a direct archive source.
 */
export function resolveInputSource(inputURL: string): ResolvedInputSource {
  const parsed = new URL(inputURL);

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only http and https URLs are supported");
  }

  const githubRepoPath = tryParseGitHubRepoPath(inputURL);

  if (githubRepoPath) {
    return {
      kind: "github-repository",
      packageName: getPackageName(githubRepoPath),
      projectInstallDirName: getProjectInstallDirName(
        githubRepoPath.split("/").filter(Boolean).join("_"),
      ),
      repositoryPath: githubRepoPath,
      repositoryUrl: getGitHubRepositoryURL(githubRepoPath),
    };
  }

  const giteeRepoPath = tryParseGiteeRepoPath(inputURL);

  if (giteeRepoPath) {
    return {
      kind: "gitee-repository",
      packageName: getPackageName(giteeRepoPath),
      projectInstallDirName: getProjectInstallDirName(
        giteeRepoPath.split("/").filter(Boolean).join("_"),
      ),
      repositoryPath: giteeRepoPath,
      repositoryUrl: getGiteeRepositoryURL(giteeRepoPath),
    };
  }

  const canonicalArchiveURL = parsed.toString();

  return {
    archive: {
      kind: "archive-url",
      label: getArchiveNameFromURL(canonicalArchiveURL),
      url: canonicalArchiveURL,
    },
    kind: "archive-url",
    packageName: getArchivePackageName(canonicalArchiveURL),
    projectInstallDirName: getProjectInstallDirName(
      `${parsed.hostname}${parsed.pathname.replace(/\.zip$/i, "")}${parsed.search}`,
    ),
    repositoryPath: canonicalArchiveURL,
    repositoryUrl: canonicalArchiveURL,
  };
}

/**
 * Checks whether a release asset looks like a usable zip archive.
 */
function isZipAsset(asset: GitHubReleaseAsset) {
  const assetName = asset.name.toLowerCase();
  return (
    ZIP_CONTENT_TYPES.has(asset.content_type.toLowerCase()) ||
    assetName.endsWith(".zip")
  );
}

/**
 * Picks the latest non-draft and non-prerelease GitHub release.
 */
function pickGitHubRelease(releases: GitHubRelease[]) {
  return releases.find((release) => !release.draft && !release.prerelease);
}

/**
 * Picks the latest non-prerelease Gitee release.
 */
function pickGiteeRelease(releases: GiteeRelease[]) {
  return releases.find((release) => !release.prerelease) ?? null;
}

/**
 * Selects the preferred downloadable archive for a GitHub release.
 */
export function pickGitHubReleaseArchive(release: GitHubRelease) {
  const zipAsset = release.assets.find(isZipAsset);

  if (zipAsset) {
    return {
      kind: "github-release" as const,
      label: zipAsset.name,
      url: zipAsset.browser_download_url,
    };
  }

  return {
    kind: "github-release" as const,
    label: `${release.tag_name || release.name || "source"}.zip`,
    url: release.zipball_url,
  };
}

/**
 * Builds a default-branch GitHub repository archive descriptor.
 */
export function pickGitHubRepositoryArchive(
  repoPath: string,
  repository: GitHubRepository,
) {
  return {
    kind: "github-repository" as const,
    label: `${repository.default_branch}.zip`,
    url: `https://api.github.com/repos${repoPath}/zipball/${repository.default_branch}`,
  };
}

/**
 * Builds a release archive descriptor for one Gitee release.
 */
export function pickGiteeReleaseArchive(repoPath: string, release: GiteeRelease) {
  const tagName = release.tag_name || release.name || "release";

  return {
    kind: "gitee-release" as const,
    label: `${tagName}.zip`,
    url: `https://gitee.com${repoPath}/repository/archive/${encodeURIComponent(tagName)}.zip`,
  };
}

/**
 * Builds a default-branch Gitee repository archive descriptor.
 */
export function pickGiteeRepositoryArchive(
  repoPath: string,
  repository: GiteeRepository,
) {
  return {
    kind: "gitee-repository" as const,
    label: `${repository.default_branch}.zip`,
    url: `https://gitee.com${repoPath}/repository/archive/${encodeURIComponent(repository.default_branch)}.zip`,
  };
}

/**
 * Fetches GitHub repository metadata needed for whole-project downloads and release fallbacks.
 */
export async function fetchGitHubRepository(
  repoPath: string,
  options: GetPkgOptions = {},
) {
  const res = await axios<GitHubRepository>(
    `https://api.github.com/repos${repoPath}`,
    {
      method: "GET",
      headers: {
        "content-type": "application/json",
        "user-agent": "cppkg-cli",
      },
      ...getRequestProxy(options.httpProxy, options.httpsProxy),
    },
  );

  return res.data;
}

/**
 * Fetches Gitee repository metadata needed for whole-project downloads and release fallbacks.
 */
export async function fetchGiteeRepository(
  repoPath: string,
  options: GetPkgOptions = {},
) {
  const res = await axios<GiteeRepository>(
    `https://gitee.com/api/v5/repos${repoPath}`,
    {
      method: "GET",
      headers: {
        "content-type": "application/json",
        "user-agent": "cppkg-cli",
      },
      ...getRequestProxy(options.httpProxy, options.httpsProxy),
    },
  );

  return res.data;
}

/**
 * Fetches GitHub releases and returns the latest published one when available.
 */
export async function fetchLatestGitHubRelease(
  repoPath: string,
  options: GetPkgOptions = {},
) {
  const res = await axios<GitHubRelease[]>(
    `https://api.github.com/repos${repoPath}/releases`,
    {
      method: "GET",
      headers: {
        "content-type": "application/json",
        "user-agent": "cppkg-cli",
      },
      ...getRequestProxy(options.httpProxy, options.httpsProxy),
    },
  );

  return pickGitHubRelease(res.data) ?? null;
}

/**
 * Fetches Gitee releases and returns the latest published one when available.
 */
export async function fetchLatestGiteeRelease(
  repoPath: string,
  options: GetPkgOptions = {},
) {
  const res = await axios<GiteeRelease[]>(
    `https://gitee.com/api/v5/repos${repoPath}/releases`,
    {
      method: "GET",
      headers: {
        "content-type": "application/json",
        "user-agent": "cppkg-cli",
      },
      ...getRequestProxy(options.httpProxy, options.httpsProxy),
    },
  );

  return pickGiteeRelease(res.data);
}
