import { Command } from "commander";
import { getProjectStatus } from "../tools/status";
import { logger } from "../tools/logger";

/**
 * Registers the command that checks manifest, lockfile, metadata, and files.
 */
export function registerStatusCommand(program: Command) {
  program
    .command("status")
    .alias("doctor")
    .description("Check cppkg manifest, lockfile, metadata, and installed files")
    .action(async () => {
      const status = await getProjectStatus();

      if (!status.issues.length) {
        logger.success("Project status is clean.");
        return;
      }

      logger.warn(`Found ${status.issues.length} project status issue(s).`);
      logger.table(
        status.issues.map((issue) => ({
          severity: issue.severity,
          code: issue.code,
          package: issue.packageName,
          message: issue.message,
        })),
      );
      process.exitCode = 1;
    });
}
