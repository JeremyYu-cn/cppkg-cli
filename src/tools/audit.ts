import type { InstalledDependency } from "../types/global";
import { promises as fsp } from "node:fs";
import path from "node:path";
import os from "node:os";
import axios from "axios";
import { readInstalledDependencies } from "./deps";
import { logger } from "./logger";
import { getGitHubToken } from "./request";

export type SeverityLevel = "low" | "medium" | "high" | "critical";

export type AdvisoryResult = {
  dependency: InstalledDependency;
  advisories: AdvisoryEntry[];
};

export type AdvisoryEntry = {
  id: string;
  cveId: string | null;
  severity: SeverityLevel;
  summary: string;
  description: string;
  publishedAt: string;
  updatedAt: string;
  url: string;
};

export type AuditResult = {
  results: AdvisoryResult[];
  totalAdvisories: number;
};

export type AuditOptions = {
  level?: SeverityLevel;
  fix?: boolean;
  json?: boolean;
};

const SEVERITY_ORDER: Record<SeverityLevel, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

function getCacheFilePath() {
  return path.join(os.tmpdir(), "cppkg-cli-advisory-cache.json");
}

async function readAdvisoryCache(): Promise<Record<string, AdvisoryEntry[]>> {
  const cachePath = getCacheFilePath();

  try {
    const stat = await fsp.stat(cachePath);
    const ageMs = Date.now() - stat.mtimeMs;

    if (ageMs > 24 * 60 * 60 * 1000) {
      return {};
    }

    const content = await fsp.readFile(cachePath, "utf8");
    return JSON.parse(content) as Record<string, AdvisoryEntry[]>;
  } catch {
    return {};
  }
}

async function writeAdvisoryCache(cache: Record<string, AdvisoryEntry[]>) {
  const cachePath = getCacheFilePath();
  await fsp.mkdir(path.dirname(cachePath), { recursive: true });
  await fsp.writeFile(cachePath, JSON.stringify(cache, null, 2), "utf8");
}

function normalizePackageName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
}

function getDependencySearchNames(dependency: InstalledDependency): string[] {
  const names = new Set<string>();
  const normalized = normalizePackageName(dependency.name);

  names.add(normalized);

  const repoPath = dependency.repository.path.replace(/^\/+/, "");
  const pathParts = repoPath.split("/");

  if (pathParts.length === 2) {
    names.add(normalizePackageName(pathParts[1]!));
  }

  return [...names];
}

interface GitHubAdvisoryResponse {
  id: number;
  ghsa_id: string;
  cve_id: string | null;
  severity: string;
  summary: string;
  description: string;
  published_at: string;
  updated_at: string;
  html_url: string;
}

interface GitHubAdvisorySearchResult {
  items?: GitHubAdvisoryResponse[];
}

async function fetchAdvisoriesForPackage(
  packageName: string,
  token: string,
): Promise<AdvisoryEntry[]> {
  const apiUrl = `https://api.github.com/advisories`;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const response = await axios.get<GitHubAdvisorySearchResult | GitHubAdvisoryResponse[]>(
      apiUrl,
      {
        params: {
          per_page: 100,
          type: "reviewed",
        },
        headers,
      },
    );

    const advisories = Array.isArray(response.data)
      ? response.data
      : response.data.items ?? [];

    const matched: AdvisoryEntry[] = [];

    for (const advisory of advisories) {
      const advisoryText = JSON.stringify(advisory).toLowerCase();
      const searchName = packageName.toLowerCase();

      if (
        advisoryText.includes(searchName) ||
        (advisory.summary &&
          advisory.summary.toLowerCase().includes(searchName)) ||
        (advisory.description &&
          advisory.description.toLowerCase().includes(searchName))
      ) {
        const severity = advisory.severity?.toLowerCase() as SeverityLevel;

        if (
          severity !== "low" &&
          severity !== "medium" &&
          severity !== "high" &&
          severity !== "critical"
        ) {
          continue;
        }

        matched.push({
          id: advisory.ghsa_id,
          cveId: advisory.cve_id || null,
          severity,
          summary: advisory.summary || "",
          description: advisory.description || "",
          publishedAt: advisory.published_at,
          updatedAt: advisory.updated_at,
          url: advisory.html_url,
        });
      }
    }

    return matched;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 403) {
      logger.warn(
        `GitHub API rate limit reached. Provide a GITHUB_TOKEN for higher limits.`,
      );
    }

    return [];
  }
}

function meetsSeverityThreshold(
  severity: SeverityLevel,
  threshold?: SeverityLevel,
): boolean {
  if (!threshold) {
    return true;
  }

  return SEVERITY_ORDER[severity] >= SEVERITY_ORDER[threshold];
}

/**
 * Audits installed packages against the GitHub Advisory Database.
 */
export async function auditPackages(
  options: AuditOptions = {},
): Promise<AuditResult> {
  const installed = await readInstalledDependencies();

  if (!installed.dependencies.length) {
    if (!options.json) {
      logger.warn("No installed packages found to audit.");
    }
    return { results: [], totalAdvisories: 0 };
  }

  const cache = await readAdvisoryCache();
  const token = getGitHubToken();
  const results: AdvisoryResult[] = [];
  let totalAdvisories = 0;

  if (!options.json) {
    logger.info(
      `Auditing ${installed.dependencies.length} package(s) against the GitHub Advisory Database...`,
    );
  }

  for (const dependency of installed.dependencies) {
    const searchNames = getDependencySearchNames(dependency);
    let allAdvisories: AdvisoryEntry[] = [];

    for (const searchName of searchNames) {
      if (cache[searchName]) {
        allAdvisories = allAdvisories.concat(cache[searchName]!);
        continue;
      }

      const fetched = await fetchAdvisoriesForPackage(searchName, token);

      cache[searchName] = fetched;
      allAdvisories = allAdvisories.concat(fetched);
    }

    const uniqueAdvisories = allAdvisories.filter(
      (advisory, index, self) =>
        index === self.findIndex((a) => a.id === advisory.id),
    );

    const filteredAdvisories = uniqueAdvisories.filter((advisory) =>
      meetsSeverityThreshold(advisory.severity, options.level),
    );

    if (filteredAdvisories.length > 0) {
      results.push({
        dependency,
        advisories: filteredAdvisories,
      });
      totalAdvisories += filteredAdvisories.length;
    }
  }

  await writeAdvisoryCache(cache);

  if (options.json) {
    return { results, totalAdvisories };
  }

  if (!results.length) {
    logger.success("No vulnerabilities found for installed packages.");
  } else {
    logger.warn(
      `Found ${totalAdvisories} advisory/advisories across ${results.length} package(s).`,
    );

    for (const result of results) {
      logger.raw("");
      logger.raw(`${result.dependency.name} (${result.dependency.version}):`);

      for (const advisory of result.advisories) {
        const severityColor =
          advisory.severity === "critical" || advisory.severity === "high"
            ? "\x1b[31m"
            : advisory.severity === "medium"
              ? "\x1b[33m"
              : "\x1b[0m";

        logger.raw(
          `  ${severityColor}[${advisory.severity.toUpperCase()}]\x1b[0m ${advisory.summary}`,
        );
        logger.raw(`    URL: ${advisory.url}`);

        if (advisory.cveId) {
          logger.raw(`    CVE: ${advisory.cveId}`);
        }
      }
    }

    if (options.fix) {
      logger.info(
        "Run 'cppkg-cli update' to update packages to their latest versions.",
      );
    }
  }

  return { results, totalAdvisories };
}
