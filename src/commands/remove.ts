import { Command } from "commander";
import { removeInstalledPackage } from "../tools/manage/index";
import { logger } from "../tools/logger";

type RemoveOptions = {
  dryRun?: boolean;
};

/**
 * Registers the command that removes one installed package by selector.
 */
export function registerRemoveCommand(program: Command) {
  program
    .command("remove")
    .alias("uninstall")
    .description("Remove an installed package from the configured install directory")
    .argument(
      "<package>",
      "Installed package name, repository path, owner/repo, or GitHub/Gitee repository URL",
    )
    .option("--dry-run", "Log what would be removed without deleting")
    .action(async (selector, options: RemoveOptions) => {
      if (options.dryRun) {
        logger.info(`Dry run: would remove package matching selector "${selector}"`);
        return;
      }

      const result = await removeInstalledPackage(selector);

      logger.success(`Removed ${result.dependency.name} from ${result.installPath}.`);
      logger.detail("Deleted tracked paths", result.removedPaths.length);

      if (result.skippedPaths.length) {
        logger.warn(
          `Preserved shared paths: ${result.skippedPaths.join(", ")}`,
        );
      }
    });
}
