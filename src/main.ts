#!/usr/bin/env node

import { Command } from "commander";
import { registerConfigCommand } from "./commands/config";
import { registerGetCommand } from "./commands/get";
import { registerInitCommand } from "./commands/init";
import { registerInstallCommand } from "./commands/install";
import { registerListCommand } from "./commands/list";
import { registerRemoveCommand } from "./commands/remove";
import { registerUpdateCommand } from "./commands/update";
import { logger } from "./tools/logger";

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
    .version("0.1.1");

  registerGetCommand(program);
  registerInitCommand(program);
  registerInstallCommand(program);
  registerListCommand(program);
  registerRemoveCommand(program);
  registerUpdateCommand(program);
  registerConfigCommand(program);

  await program.parseAsync();
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  logger.error(`cppkg-cli failed: ${message}`);
  process.exitCode = 1;
});
