import type { InstalledDependency } from "../../types/global";
import type {
  ArchiveDescriptor,
  ProviderRelease,
  ResolvedInputSource,
} from "./types";

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
    },
    install: {
      mode: installMode,
      target: installPath,
      headers: installedHeaders,
      paths: installedPaths,
    },
  };
}
