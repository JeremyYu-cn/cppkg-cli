import { Command } from "commander";
import path from "node:path";
import {
  createPackageManifest,
  MANIFEST_FILE_NAME,
} from "../public/manifest";
import { logger } from "../tools/logger";

type InitOptions = {
  force?: boolean;
};

/**
 * Registers the command that creates a project package manifest.
 */
export function registerInitCommand(program: Command) {
  program
    .command("init")
    .description(`Create a ${MANIFEST_FILE_NAME} package manifest`)
    .option("-f, --force", `Overwrite an existing ${MANIFEST_FILE_NAME}`)
    .action((options: InitOptions) => {
      const result = createPackageManifest({
        force: Boolean(options.force),
      });
      const manifestPath =
        path.relative(process.cwd(), result.manifestFilePath) ||
        MANIFEST_FILE_NAME;

      logger.success(`Created ${manifestPath}.`);
      logger.detail(
        "Next",
        `Add dependencies, then run cppkg-cli install`,
      );
    });
}
