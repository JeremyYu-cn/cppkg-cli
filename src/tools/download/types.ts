import type { GitHubRelease } from "../../types/github";
import type { InstalledDependency } from "../../types/global";

export type GitHubReleaseAsset = GitHubRelease["assets"][number];

export type GitHubRepository = {
  default_branch: string;
  full_name: string;
  html_url: string;
};

export type GiteeRelease = {
  name: string | null;
  published_at?: string | null;
  prerelease: boolean;
  tag_name: string | null;
};

export type GiteeRepository = {
  default_branch: string;
  full_name: string;
  html_url: string;
};

export type ProviderRelease = GitHubRelease | GiteeRelease;

export type ArchiveDescriptor = {
  kind: InstalledDependency["source"]["type"];
  label: string;
  url: string;
};

export type PreparedArchive = {
  archive: ArchiveDescriptor;
  includeDirs: string[];
  integrity: {
    sha256: string;
  };
  sourceRootPath: string;
};

export type ResolvedGitHubRepositoryInput = {
  kind: "github-repository";
  packageName: string;
  projectInstallDirName: string;
  repositoryPath: string;
  repositoryUrl: string;
};

export type ResolvedGiteeRepositoryInput = {
  kind: "gitee-repository";
  packageName: string;
  projectInstallDirName: string;
  repositoryPath: string;
  repositoryUrl: string;
};

export type ResolvedArchiveURLInput = {
  archive: ArchiveDescriptor;
  kind: "archive-url";
  packageName: string;
  projectInstallDirName: string;
  repositoryPath: string;
  repositoryUrl: string;
};

export type ResolvedInputSource =
  | ResolvedArchiveURLInput
  | ResolvedGiteeRepositoryInput
  | ResolvedGitHubRepositoryInput;
