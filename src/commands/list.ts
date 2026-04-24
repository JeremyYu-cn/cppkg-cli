import { Command } from "commander";
import path from "node:path";
import { resolvePackageRootPath } from "../public/packagePath";
import { readInstalledDependencies } from "../tools/deps";
import { logger } from "../tools/logger";

/**
 * Registers the command that prints tracked packages from the configured deps file.
 */
export function registerListCommand(program: Command) {
  program
    .command("list")
    .description("List installed packages tracked in the configured deps file")
    .action(async () => {
      const installed = await readInstalledDependencies();
      const packageRootPath =
        path.relative(process.cwd(), resolvePackageRootPath()) || ".";

      if (!installed.dependencies.length) {
        logger.warn(`No installed packages found in ${packageRootPath}.`);
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
          target: dependency.install.target,
          repository: dependency.repository.url,
          headers: dependency.install.headers.join(", "),
        })),
      );
    });
}
