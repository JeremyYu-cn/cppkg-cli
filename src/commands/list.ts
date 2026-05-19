import { Command } from "commander";
import path from "node:path";
import type { InstalledDependency } from "../types/global";
import { resolvePackageRootPath } from "../public/packagePath";
import { readInstalledDependencies } from "../tools/deps";
import { logger } from "../tools/logger";
import type { SourceRequest } from "../types/global";

function normalizeUrl(url: string) {
  return url.trim().replace(/\/+$/, "").replace(/\.git$/i, "").toLowerCase();
}

function formatSourceRequest(request: SourceRequest | undefined) {
  if (!request) {
    return "";
  }

  if (request.type === "tag" || request.type === "branch") {
    return `${request.type}:${request.value}`;
  }

  if (request.type === "latest-release" && request.includePrerelease) {
    return "latest-release+prerelease";
  }

  return request.type;
}

function buildDepMap(deps: InstalledDependency[]) {
  const map = new Map<string, InstalledDependency>();

  for (const dep of deps) {
    map.set(normalizeUrl(dep.repository.url), dep);
  }

  return map;
}

function printTree(
  deps: InstalledDependency[],
  rootDeps: InstalledDependency[],
) {
  const depMap = buildDepMap(deps);
  const printed = new Set<string>();

  function printNode(
    dep: InstalledDependency,
    prefix: string,
    isLast: boolean,
  ) {
    const depUrl = normalizeUrl(dep.repository.url);
    const connector = isLast ? "└── " : "├── ";
    const line = `${prefix}${connector}${dep.name} (${dep.version})`;

    if (printed.has(depUrl)) {
      logger.info(`${line} [already shown]`);
      return;
    }

    printed.add(depUrl);
    logger.info(line);

    if (dep.transitiveDeps && dep.transitiveDeps.length) {
      const children = dep.transitiveDeps
        .map((childUrl) => depMap.get(normalizeUrl(childUrl)))
        .filter((d): d is InstalledDependency => d !== undefined && !printed.has(normalizeUrl(d.repository.url)));

      if (children.length) {
        const childPrefix = isLast ? `${prefix}    ` : `${prefix}│   `;

        for (let i = 0; i < children.length; i++) {
          printNode(children[i]!, childPrefix, i < children.length - 1);
        }
      }
    }
  }

  for (let i = 0; i < rootDeps.length; i++) {
    const isLast = i === rootDeps.length - 1;
    printNode(rootDeps[i]!, isLast ? "" : "", isLast);
  }
}

/**
 * Registers the command that prints tracked packages from the configured deps file.
 */
export function registerListCommand(program: Command) {
  program
    .command("list")
    .description("List installed packages tracked in the configured deps file")
    .option("--tree", "Show a tree view of installed dependencies")
    .option("--graph", "Alias for --tree")
    .option("--json", "Output as JSON")
    .action(async (options: { tree?: boolean; graph?: boolean; json?: boolean }) => {
      const installed = await readInstalledDependencies();
      const packageRootPath =
        path.relative(process.cwd(), resolvePackageRootPath()) || ".";

      if (!installed.dependencies.length) {
        if (options.json) {
          logger.raw(JSON.stringify({ dependencies: [], packageRoot: packageRootPath }));
          return;
        }
        logger.warn(`No installed packages found in ${packageRootPath}.`);
        return;
      }

      if (options.json) {
        const jsonOutput = installed.dependencies.map((dependency) => ({
          name: dependency.name,
          mode: dependency.install.mode,
          type: dependency.type,
          version: dependency.version,
          installedAt: dependency.installedAt,
          requested: formatSourceRequest(dependency.source.requested),
          target: dependency.install.target,
          repository: dependency.repository.url,
          headers: dependency.install.headers,
        }));
        logger.raw(JSON.stringify(jsonOutput, null, 2));
        return;
      }

      const showTree = options.tree || options.graph;

      if (showTree) {
        logger.info(`Installed packages in ${packageRootPath}:`);

        const depMap = buildDepMap(installed.dependencies);
        const rootDeps = installed.dependencies.filter((d) => {
          const url = normalizeUrl(d.repository.url);

          return !installed.dependencies.some((other) =>
            other.transitiveDeps?.some(
              (childUrl) => normalizeUrl(childUrl) === url,
            ),
          );
        });

        printTree(installed.dependencies, rootDeps.length ? rootDeps : installed.dependencies);
        return;
      }

      logger.info(`Installed packages in ${packageRootPath}:`);
      logger.table(
        installed.dependencies.map((dependency) => ({
          name: dependency.name,
          mode: dependency.install.mode,
          type: dependency.type,
          version: dependency.version,
          installedAt: dependency.installedAt,
          requested: formatSourceRequest(dependency.source.requested),
          target: dependency.install.target,
          repository: dependency.repository.url,
          headers: dependency.install.headers.join(", "),
        })),
      );
    });
}
