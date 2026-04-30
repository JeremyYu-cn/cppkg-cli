import type {
  GetPkgOptions,
  InstalledDependency,
  SourceRequest,
} from "../../types/global";
import type {
  ArchiveDescriptor,
  ProviderRelease,
  ResolvedInputSource,
} from "./types";

function getSourceRequest(
  inputSource: ResolvedInputSource,
  options: GetPkgOptions,
): SourceRequest {
  if (inputSource.kind === "archive-url") {
    return {
      type: "archive-url",
      value: inputSource.repositoryUrl,
    };
  }

  if (options.tag) {
    return {
      type: "tag",
      value: options.tag,
    };
  }

  if (options.branch) {
    return {
      type: "branch",
      value: options.branch,
    };
  }

  return {
    type: "latest-release",
    value: null,
    ...(options.prerelease ? { includePrerelease: true } : {}),
  };
}

/**
 * Builds the metadata record written to cpp_libs/deps.json after installation.
 */
export function buildInstalledDependency(
  inputSource: ResolvedInputSource,
  installPath: string,
  release: ProviderRelease | null,
  archive: ArchiveDescriptor,
  installedHeaders: string[],
  installedPaths: string[],
  installType: InstalledDependency["type"],
  installMode: InstalledDependency["install"]["mode"],
  options: GetPkgOptions = {},
  integritySha256?: string,
): InstalledDependency {
  const releaseMetadata =
    archive.kind === "github-release" || archive.kind === "gitee-release"
      ? release
      : null;

  return {
    name: inputSource.packageName,
    version:
      releaseMetadata?.tag_name ||
      releaseMetadata?.name ||
      archive.label.replace(/\.zip$/i, ""),
    installedAt: new Date().toISOString(),
    type: installType,
    repository: {
      path: inputSource.repositoryPath,
      url: inputSource.repositoryUrl,
    },
    release: {
      tagName: releaseMetadata?.tag_name || null,
      name: releaseMetadata?.name || null,
      publishedAt: releaseMetadata?.published_at || null,
    },
    source: {
      type: archive.kind,
      archiveName: archive.label,
      archiveUrl: archive.url,
      ...(integritySha256 ? { integrity: { sha256: integritySha256 } } : {}),
      requested: getSourceRequest(inputSource, options),
    },
    install: {
      mode: installMode,
      target: installPath,
      headers: installedHeaders,
      paths: installedPaths,
    },
  };
}
