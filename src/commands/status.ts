import { Command } from "commander";
import { getProjectStatus } from "../tools/status";
import { logger } from "../tools/logger";

type StatusOptions = {
  json?: boolean;
};

export function registerStatusCommand(program: Command) {
  program
    .command("status")
    .alias("doctor")
    .description("Check cppkg manifest, lockfile, metadata, and installed files")
    .option("--json", "Output as JSON")
    .action(async (options: StatusOptions) => {
      const status = await getProjectStatus();

      if (options.json) {
        logger.raw(JSON.stringify(status, null, 2));
        return;
      }

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
