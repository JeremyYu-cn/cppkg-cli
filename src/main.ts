#!/usr/bin/env node

import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import { registerAddCommand } from "./commands/add";
import { registerConfigCommand } from "./commands/config";
import { registerGetCommand } from "./commands/get";
import { registerInitCommand } from "./commands/init";
import { registerInstallCommand } from "./commands/install";
import { registerListCommand } from "./commands/list";
import { registerRemoveCommand } from "./commands/remove";
import { registerSearchCommand } from "./commands/search";
import { registerStatusCommand } from "./commands/status";
import { registerUpdateCommand } from "./commands/update";
import { logger } from "./tools/logger";

function getPackageVersion() {
  const packageJsonPath = path.resolve(__dirname, "../package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
    version?: unknown;
  };

  return typeof packageJson.version === "string" && packageJson.version.trim()
    ? packageJson.version
    : "0.0.0";
}

/**
 * Bootstraps the CLI and registers all supported commands.
 */
async function main() {
  const program = new Command();

  program
    .name("cppkg-cli")
    .description(
      "Download C/C++ packages into a shared include directory or project workspace",
    )
    .version(getPackageVersion());

  registerAddCommand(program);
  registerGetCommand(program);
  registerInitCommand(program);
  registerInstallCommand(program);
  registerListCommand(program);
  registerRemoveCommand(program);
  registerSearchCommand(program);
  registerStatusCommand(program);
  registerUpdateCommand(program);
  registerConfigCommand(program);

  await program.parseAsync();
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  logger.error(`cppkg-cli failed: ${message}`);
  process.exitCode = 1;
});
