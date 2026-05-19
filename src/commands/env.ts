import { Command } from "commander";
import { getSystemDiagnostics } from "../tools/env";
import { logger } from "../tools/logger";

type EnvOptions = {
  json?: boolean;
};

export function registerEnvCommand(program: Command) {
  program
    .command("env")
    .description("Show system environment diagnostics")
    .option("--json", "Output as JSON")
    .action(async (options: EnvOptions) => {
      const diag = getSystemDiagnostics();

      if (options.json) {
        const jsonObject = Object.fromEntries(diag.map((d) => [d.key, d.value]));
        logger.raw(JSON.stringify(jsonObject, null, 2));
        return;
      }

      logger.info("System Environment Diagnostics:");
      for (const d of diag) {
        logger.detail(d.key, d.value);
      }
    });
}
