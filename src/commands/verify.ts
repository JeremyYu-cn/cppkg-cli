import { Command } from "commander";
import { verifyPackages } from "../tools/verify";
import { logger } from "../tools/logger";

type VerifyOptions = {
  fix?: boolean;
  json?: boolean;
};

export function registerVerifyCommand(program: Command) {
  program
    .command("verify")
    .description("Verify installed packages checksums against lockfile")
    .option("--fix", "Re-download packages that fail checksum verification")
    .option("--json", "Output result as JSON")
    .action(async (options: VerifyOptions) => {
      let result;
      try {
        result = await verifyPackages(options.fix);
      } catch (error: unknown) {
        if (options.json) {
          logger.raw(JSON.stringify({ error: error instanceof Error ? error.message : String(error), issues: [], verified: 0, passed: 0 }, null, 2));
          return;
        }
        throw error;
      }

      if (options.json) {
        logger.raw(JSON.stringify(result, null, 2));
        return;
      }

      if (!result.verified) {
        logger.warn("No packages to verify. Run cppkg-cli install first.");
        return;
      }

      logger.info(`Verified ${result.verified} package(s), ${result.passed} passed.`);

      if (result.issues.length) {
        logger.table(
          result.issues.map((issue) => ({
            severity: issue.severity,
            code: issue.code,
            package: issue.packageName,
            message: issue.message,
          })),
        );
        if (!options.fix) {
          process.exitCode = 1;
        }
      } else {
        logger.success("All packages verified successfully.");
      }
    });
}
