import { Command } from "commander";
import { execSync } from "node:child_process";
import { logger } from "../tools/logger";
import { getErrorMessage } from "../tools/errors";

export function registerRebuildCommand(program: Command) {
  program
    .command("rebuild")
    .description("Reinstall all packages from scratch (clean + install)")
    .action(async () => {
      const cliPath = process.argv[1];

      logger.info("Running cppkg-cli clean --all --force...");
      try {
        execSync(`${process.execPath} "${cliPath}" clean --all --force`, {
          stdio: "inherit",
          timeout: 60000,
        });
      } catch (error: unknown) {
        logger.error(`Clean step failed: ${getErrorMessage(error)}`);
        process.exitCode = 1;
        return;
      }

      logger.info("Running cppkg-cli install...");
      try {
        execSync(`${process.execPath} "${cliPath}" install`, {
          stdio: "inherit",
          timeout: 120000,
        });
      } catch (error: unknown) {
        logger.error(`Install step failed: ${getErrorMessage(error)}`);
        process.exitCode = 1;
        return;
      }

      logger.success("Rebuild complete.");
    });
}
