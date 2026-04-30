import { Command } from "commander";
import {
  addPackageManifestDependency,
  getManifestDependencyOptions,
  type AddManifestDependencyOptions,
} from "../public/manifest";
import type { GetPkgOptions } from "../types/global";
import { getVCPkg } from "../tools/download/main";
import { logger } from "../tools/logger";

type AddOptions = AddManifestDependencyOptions &
  Pick<GetPkgOptions, "cache" | "httpProxy" | "httpsProxy"> & {
    install?: boolean;
  };

/**
 * Registers the command that adds one dependency to cppkg.json.
 */
export function registerAddCommand(program: Command) {
  program
    .command("add")
    .description("Add one dependency to cppkg.json, optionally installing it")
    .argument(
      "<source>",
      "GitHub owner/repo, GitHub/Gitee repository URL, or direct zip archive URL",
    )
    .option("--name <name>", "Dependency name to write in cppkg.json")
    .option("--tag <tag>", "Install a specific release tag or repository tag")
    .option("--branch <branch>", "Install a specific repository branch")
    .option(
      "--prerelease",
      "Allow prerelease versions when selecting the latest release",
    )
    .option(
      "--full-project",
      "Install the package as a full project and skip include-directory detection",
    )
    .option("--install", "Install the dependency after writing cppkg.json")
    .option("-f, --force", "Replace an existing manifest dependency")
    .option("--no-cache", "Bypass cached archives when used with --install")
    .option("--http-proxy <url>", "HTTP request proxy, overrides config")
    .option("--https-proxy <url>", "HTTPS request proxy, overrides config")
    .action(async (source: string, options: AddOptions) => {
      const result = await addPackageManifestDependency(source, options);

      logger.success(`Added ${result.dependency.name} to cppkg.json.`);

      if (!options.install) {
        return;
      }

      await getVCPkg(
        result.dependency.source,
        getManifestDependencyOptions(result.dependency, options),
      );
    });
}
