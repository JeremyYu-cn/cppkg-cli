import { Command } from "commander";
import path from "node:path";
import {
  getConfigFilePath,
  getConfigValue,
  listConfigEntries,
  removeConfigValue,
  setConfigValue,
} from "../public/config";
import { logger } from "../tools/logger";

function formatConfigValue(value: string) {
  return JSON.stringify(value);
}

export function registerConfigCommand(program: Command) {
  const configProgram = program
    .command("config")
    .description("Manage project-level cppkg settings in ./cppkg.config.json");

  configProgram
    .command("get")
    .description("Print one resolved config value")
    .argument("<key>", "config key")
    .action((key) => {
      logger.raw(getConfigValue(key));
    });

  configProgram
    .command("set")
    .description("Persist one config override into ./cppkg.config.json")
    .argument("<key>", "config key")
    .argument("<value>", "config value")
    .action((key, value) => {
      const result = setConfigValue(key, value);
      const configFilePath =
        path.relative(process.cwd(), getConfigFilePath()) || "cppkg.config.json";

      logger.success(`Set ${result.key}=${result.value}`);
      logger.detail("Saved to", configFilePath);
    });

  configProgram
    .command("list")
    .description("List all resolved config values")
    .action(() => {
      const configFilePath =
        path.relative(process.cwd(), getConfigFilePath()) || "cppkg.config.json";

      logger.info(`Resolved config for ${configFilePath}:`);
      logger.table(listConfigEntries());
    });

  configProgram
    .command("remove")
    .description("Remove one config override and fall back to the default value")
    .argument("<key>", "config key")
    .action((key) => {
      const result = removeConfigValue(key);

      if (!result.hadValue) {
        logger.warn(
          `${result.key} is already using its default value: ${formatConfigValue(result.value)}`,
        );
        return;
      }

      logger.success(
        `Removed ${result.key}; current default is ${formatConfigValue(result.value)}`,
      );
    });
}
