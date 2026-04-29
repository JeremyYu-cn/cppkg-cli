import { Command } from "commander";
import { updateInstalledPackages } from "../tools/manage";
import { logger } from "../tools/logger";

/**
 * Registers the command that refreshes one tracked package or all of them.
 */
export function registerUpdateCommand(program: Command) {
  program
    .command("update")
    .description(
      "Update one installed package, or all tracked packages when no selector is provided",
    )
    .argument(
      "[package]",
      "Installed package name, repository path, owner/repo, or GitHub/Gitee repository URL",
    )
    .option(
      "--full-project",
      "Force full-project reinstall; without this flag the recorded install mode is reused",
    )
    .option(
      "--tag <tag>",
      "Update one package from a specific release tag or repository tag",
    )
    .option("--branch <branch>", "Update one package from a specific branch")
    .option(
      "--prerelease",
      "Allow prerelease versions when selecting the latest release",
    )
    .option("--no-cache", "Bypass cached archives and refresh downloads")
    .option("--http-proxy <url>", "HTTP request proxy, overrides config")
    .option("--https-proxy <url>", "HTTPS request proxy, overrides config")
    .action(async (selector, options) => {
      const result = await updateInstalledPackages(selector, options);

      if (!result.updatedDependencies.length) {
        return;
      }

      logger.success(`Updated ${result.updatedDependencies.length} package(s).`);
    });
}
