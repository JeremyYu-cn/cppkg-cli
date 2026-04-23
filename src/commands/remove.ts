import { Command } from "commander";
import { removeInstalledPackage } from "../tools/manage";

/**
 * Registers the command that removes one installed package by selector.
 */
export function registerRemoveCommand(program: Command) {
  program
    .command("remove")
    .description("Remove an installed package from ./cpp_libs and deps.json")
    .argument(
      "<package>",
      "Installed package name, repository path, owner/repo, or GitHub repository URL",
    )
    .action(async (selector) => {
      const result = await removeInstalledPackage(selector);

      console.log(`Removed ${result.dependency.name} from ${result.installPath}.`);
      console.log(`Deleted tracked paths: ${result.removedPaths.length}`);

      if (result.skippedPaths.length) {
        console.log(
          `Preserved shared paths: ${result.skippedPaths.join(", ")}`,
        );
      }
    });
}
