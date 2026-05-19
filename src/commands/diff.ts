import { Command } from "commander";
import { diffLockfile } from "../tools/diff";
import { logger } from "../tools/logger";

export function registerDiffCommand(program: Command) {
  program
    .command("diff")
    .description("Show differences between manifest and lockfile")
    .option("--json", "Output result as JSON")
    .action(async (options: { json?: boolean }) => {
      const result = await diffLockfile();

      if (options.json) {
        logger.raw(JSON.stringify(result, null, 2));
        return;
      }

      if (result.lockfileMissing) {
        logger.warn("No lockfile found. Run cppkg-cli install first.");
        return;
      }

      if (!result.manifestChanged) {
        logger.success("Lockfile is in sync with manifest.");
        return;
      }

      if (!result.entries.length) {
        logger.info("Manifest structure differs but no specific version changes detected.");
        return;
      }

      logger.warn("Lockfile differs from manifest:");
      logger.table(
        result.entries.map((e) => ({
          package: e.name,
          field: e.field,
          from: e.oldValue,
          to: e.newValue,
        })),
      );
      process.exitCode = 1;
    });
}
