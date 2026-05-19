import { Command } from "commander";
import { auditPackages, type AuditOptions, type SeverityLevel } from "../tools/audit";
import { logger } from "../tools/logger";

/**
 * Registers the command that audits installed packages against the GitHub Advisory Database.
 */
export function registerAuditCommand(program: Command) {
  program
    .command("audit")
    .description("Check installed packages against known vulnerabilities")
    .option(
      "--level <severity>",
      "Filter advisories by minimum severity (low, medium, high, critical)",
    )
    .option("--fix", "Suggest updates for packages with vulnerabilities")
    .option("--json", "Output results as JSON")
    .action(async (options: { level?: string; fix?: boolean; json?: boolean }) => {
      const auditOptions: AuditOptions = {};

      if (options.level) {
        const level = options.level.toLowerCase();

        if (
          level !== "low" &&
          level !== "medium" &&
          level !== "high" &&
          level !== "critical"
        ) {
          throw new Error(
            `Invalid severity level: ${options.level}. Use low, medium, high, or critical.`,
          );
        }

        auditOptions.level = level as SeverityLevel;
      }

      if (options.fix) {
        auditOptions.fix = true;
      }

      auditOptions.json = !!options.json;

      const result = await auditPackages(auditOptions);

      if (options.json) {
        logger.raw(JSON.stringify(result, null, 2));
      }
    });
}
