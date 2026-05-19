import { Command } from "commander";
import path from "node:path";
import { scanLicenses } from "../tools/licenses";
import { logger } from "../tools/logger";

type LicensesOptions = {
  full?: boolean;
  json?: boolean;
};

export function registerLicensesCommand(program: Command) {
  program
    .command("licenses")
    .description("Scan installed packages for open-source licenses")
    .option("--full", "Show full license text")
    .option("--json", "Output as JSON")
    .action(async (options: LicensesOptions) => {
      const licenses = await scanLicenses();

      if (!licenses.length) {
        if (options.json) {
          logger.raw(JSON.stringify([]));
          return;
        }
        logger.warn("No installed packages found.");
        return;
      }

      if (options.json) {
        const jsonOutput = licenses.map((l) => ({
          package: l.packageName,
          version: l.version,
          license: l.licenseFile ? path.relative(process.cwd(), l.licenseFile) : "not found",
          licenseContent: options.full ? l.licenseContent : undefined,
          repository: l.repository,
        }));
        logger.raw(JSON.stringify(jsonOutput, null, 2));
        return;
      }

      logger.table(
        licenses.map((l) => ({
          package: l.packageName,
          version: l.version,
          license: l.licenseFile ? path.relative(process.cwd(), l.licenseFile) : "not found",
          repository: l.repository,
        })),
      );

      if (options.full) {
        for (const l of licenses) {
          if (l.licenseContent) {
            logger.raw("");
            logger.info(`License for ${l.packageName}:`);
            logger.raw(l.licenseContent);
          }
        }
      }

      logger.info(`Total: ${licenses.length} package(s)`);
    });
}
