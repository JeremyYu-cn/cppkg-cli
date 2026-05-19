import { Command } from "commander";
import { readInstalledDependencies } from "../tools/deps";
import { checkPackageOutdated } from "../tools/outdated";
import { getErrorMessage } from "../tools/errors";
import { logger } from "../tools/logger";
import type { GetPkgOptions } from "../types/global";

type OutdatedOptions = Pick<GetPkgOptions, "httpProxy" | "httpsProxy"> & {
  prerelease?: boolean;
  json?: boolean;
};

/**
 * Registers the command that checks for outdated packages.
 */
export function registerOutdatedCommand(program: Command) {
  program
    .command("outdated")
    .description("Check installed packages for newer available versions")
    .argument(
      "[packages...]",
      "Optional package names to check; checks all if omitted",
    )
    .option("--http-proxy <url>", "HTTP request proxy, overrides config")
    .option("--https-proxy <url>", "HTTPS request proxy, overrides config")
    .option("--prerelease", "Include prerelease versions when checking")
    .option("--json", "Output as JSON")
    .action(async (selectors: string[], options: OutdatedOptions) => {
      const installed = await readInstalledDependencies();

      if (!installed.dependencies.length) {
        logger.warn("No installed packages found.");
        return;
      }

      const toCheck = selectors.length
        ? installed.dependencies.filter((dep) =>
            selectors.some(
              (s) =>
                dep.name === s ||
                dep.repository.url.includes(s) ||
                dep.repository.path.includes(s),
            ),
          )
        : installed.dependencies;

      if (!toCheck.length) {
        logger.warn("No matching packages found.");
        return;
      }

      if (selectors.length) {
        logger.info(`Checking ${toCheck.length} package(s) for updates.`);
      } else {
        logger.info(`Checking ${toCheck.length} installed package(s) for updates.`);
      }

      if (options.json) {
        const results: Array<Record<string, unknown>> = [];

        for (const dep of toCheck) {
          try {
            const result = await checkPackageOutdated(dep, options);
            const entry: Record<string, unknown> = {
              name: dep.name,
              current: result.currentVersion,
              outdated: result.outdated,
              source: dep.repository.url,
            };
            if (result.latestVersion !== undefined) entry.latest = result.latestVersion;
            if (result.error !== undefined) entry.error = result.error;
            results.push(entry);
          } catch (error: unknown) {
            const entry: Record<string, unknown> = {
              name: dep.name,
              current: dep.version || "unknown",
              outdated: false,
              source: dep.repository.url,
            };
            entry.error = getErrorMessage(error);
            results.push(entry);
          }
        }

        logger.raw(JSON.stringify(results, null, 2));
        return;
      }

      let foundOutdated = false;

      for (const dep of toCheck) {
        try {
          const result = await checkPackageOutdated(dep, options);

          if (result.outdated) {
            foundOutdated = true;
            logger.table([
              {
                name: dep.name,
                current: result.currentVersion,
                latest: result.latestVersion,
                source: dep.repository.url,
              },
            ]);
          } else if (result.error) {
            logger.warn(`${dep.name}: ${result.error}`);
          } else {
            logger.detail(dep.name, "up to date");
          }
        } catch (error: unknown) {
          logger.warn(`${dep.name}: ${getErrorMessage(error)}`);
        }
      }

      if (!foundOutdated) {
        logger.success("All packages are up to date.");
      } else {
        logger.info('Use "cppkg-cli update <package>" to upgrade.');
      }
    });
}
