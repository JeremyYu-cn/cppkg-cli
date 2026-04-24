import { Command } from "commander";
import path from "node:path";
import { resolvePackageRootPath } from "../public/packagePath";
import { readInstalledDependencies } from "../tools/deps";

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
        console.log(`No installed packages found in ${packageRootPath}.`);
        return;
      }

      console.log(`Installed packages in ${packageRootPath}:`);
      console.table(
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
