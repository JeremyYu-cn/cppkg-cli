export type GetPkgOptions = {
  httpProxy?: string;
  httpsProxy?: string;
  cache?: boolean;
  fullProject?: boolean;
  tag?: string;
  branch?: string;
  prerelease?: boolean;
};

export type SourceRequest = {
  type: "archive-url" | "branch" | "latest-release" | "tag";
  value: string | null;
  includePrerelease?: boolean;
};

export type InstalledDependency = {
  name: string;
  version: string;
  installedAt: string;
  type: "header-only" | "need-compile";
  repository: {
    path: string;
    url: string;
  };
  release: {
    tagName: string | null;
    name: string | null;
    publishedAt: string | null;
  };
  source: {
    type:
      | "archive-url"
      | "gitee-release"
      | "gitee-repository"
      | "github-release"
      | "github-repository";
    archiveName: string;
    archiveUrl: string;
    requested?: SourceRequest;
  };
  install: {
    mode: "include" | "full-project";
    target: string;
    headers: string[];
    paths: string[];
  };
};

export type InstalledDependenciesFile = {
  dependencies: InstalledDependency[];
};
