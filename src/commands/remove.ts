import { Command } from "commander";
import { removeInstalledPackage } from "../tools/manage";
import { logger } from "../tools/logger";

/**
 * Registers the command that removes one installed package by selector.
 */
export function registerRemoveCommand(program: Command) {
  program
    .command("remove")
    .description("Remove an installed package from the configured install directory")
    .argument(
      "<package>",
      "Installed package name, repository path, owner/repo, or GitHub/Gitee repository URL",
    )
    .action(async (selector) => {
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
