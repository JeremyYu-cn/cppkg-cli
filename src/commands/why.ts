import { Command } from "commander";
import type { InstalledDependency } from "../types/global";
import { readInstalledDependencies } from "../tools/deps";
import { logger } from "../tools/logger";

function normalizeUrl(url: string) {
  return url.trim().replace(/\/+$/, "").replace(/\.git$/i, "").toLowerCase();
}

function findDependency(
  deps: InstalledDependency[],
  packageName: string,
): InstalledDependency | undefined {
  const normalized = packageName.toLowerCase();

  return deps.find((d) => {
    if (d.name.toLowerCase() === normalized) return true;
    const repoName =
      d.repository.url.split("/").filter(Boolean).at(-1) ?? "";
    return repoName.toLowerCase() === normalized;
  });
}

function buildDepMap(deps: InstalledDependency[]) {
  const map = new Map<string, InstalledDependency>();

  for (const dep of deps) {
    map.set(normalizeUrl(dep.repository.url), dep);
  }

  return map;
}

function isDirectDependency(
  targetUrl: string,
  deps: InstalledDependency[],
): boolean {
  return !deps.some((d) =>
    d.transitiveDeps?.some(
      (childUrl) => normalizeUrl(childUrl) === targetUrl,
    ),
  );
}

type DepChain = InstalledDependency[];

function findChainsToTarget(
  targetUrl: string,
  deps: InstalledDependency[],
): DepChain[] {
  const depMap = buildDepMap(deps);
  const chains: DepChain[] = [];

  function walk(
    currentUrl: string,
    path: InstalledDependency[],
    visited: Set<string>,
  ) {
    if (visited.has(currentUrl)) return;

    const current = depMap.get(currentUrl);
    if (!current) return;

    const newPath = [...path, current];

    if (currentUrl === targetUrl) {
      chains.push(newPath);
      return;
    }

    visited.add(currentUrl);

    if (current.transitiveDeps && current.transitiveDeps.length) {
      for (const childUrl of current.transitiveDeps) {
        walk(normalizeUrl(childUrl), newPath, new Set(visited));
      }
    }
  }

  const rootDeps = deps.filter((d) =>
    isDirectDependency(normalizeUrl(d.repository.url), deps),
  );

  for (const root of rootDeps) {
    walk(normalizeUrl(root.repository.url), [], new Set());
  }

  return chains;
}

function formatChain(chain: DepChain) {
  return chain.map((d) => d.name).join(" -> ");
}

/**
 * Registers the `cppkg why <package>` command.
 */
export function registerWhyCommand(program: Command) {
  program
    .command("why")
    .description(
      "Show which dependency (or dependencies) require the specified package",
    )
    .argument("<package>", "Package name or repository URL to trace")
    .option("--json", "Output result as JSON")
    .action(async (packageName: string, options: { json?: boolean }) => {
      const installed = await readInstalledDependencies();

      if (!installed.dependencies.length) {
        if (options.json) {
          logger.raw(JSON.stringify({ found: false, reason: "No installed packages found." }));
          return;
        }
        logger.warn("No installed packages found.");
        return;
      }

      const target = findDependency(installed.dependencies, packageName);

      if (!target) {
        if (options.json) {
          logger.raw(JSON.stringify({ found: false, reason: `Package "${packageName}" is not installed.` }));
          return;
        }
        logger.warn(`Package "${packageName}" is not installed.`);
        return;
      }

      const targetUrl = normalizeUrl(target.repository.url);

      if (isDirectDependency(targetUrl, installed.dependencies)) {
        if (options.json) {
          logger.raw(JSON.stringify({ found: true, name: target.name, version: target.version, repository: target.repository.url, direct: true }));
          return;
        }
        logger.info(`"${target.name}" is a direct dependency.`);
        logger.detail("Version", target.version);
        logger.detail("Repository", target.repository.url);
        return;
      }

      const chains = findChainsToTarget(targetUrl, installed.dependencies);

      if (options.json) {
        logger.raw(JSON.stringify({
          found: true,
          name: target.name,
          version: target.version,
          repository: target.repository.url,
          direct: false,
          chains: chains.map((c) => c.map((d) => ({ name: d.name, version: d.version, repository: d.repository.url }))),
        }));
        return;
      }

      if (!chains.length) {
        logger.info(
          `"${target.name}" is installed but the dependency chain could not be traced.`,
        );
        logger.detail("Version", target.version);
        logger.detail("Repository", target.repository.url);
        return;
      }

      logger.info(`"${target.name}" is required by:`);

      for (const chain of chains) {
        logger.detail("chain", formatChain(chain));
      }
    });
}
