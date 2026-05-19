import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import { registerAddCommand } from "./commands/add";
import { registerAuditCommand } from "./commands/audit";
import { registerBugCommand } from "./commands/bug";
import { registerBuildCommand } from "./commands/build";
import { registerCacheCommand } from "./commands/cache";
import { registerCleanCommand } from "./commands/clean";
import { registerCMakeCommand } from "./commands/cmake";
import { registerCompileCommand } from "./commands/compile";
import { registerCompilerCommand } from "./commands/compiler";
import { registerCompletionCommand } from "./commands/completion";
import { registerConfigCommand } from "./commands/config";
import { registerCreateCommand } from "./commands/create";
import { registerDiffCommand } from "./commands/diff";
import { registerDiagnoseCommand } from "./commands/diagnose";
import { registerDocsCommand } from "./commands/docs";
import { registerHomeCommand } from "./commands/home";
import { registerEnvCommand } from "./commands/env";
import { registerExecCommand } from "./commands/exec";
import { registerGetCommand } from "./commands/get";
import { registerGraphCommand } from "./commands/graph";
import { registerImportCommand } from "./commands/import";
import { registerInfoCommand } from "./commands/info";
import { registerInitCommand } from "./commands/init";
import { registerInstallCommand } from "./commands/install";
import { registerInspectCommand } from "./commands/inspect";
import { registerIntegrateCommand } from "./commands/integrate";
import { registerLicensesCommand } from "./commands/licenses";
import { registerListCommand } from "./commands/list";
import { registerLockfileCommand } from "./commands/lockfile";
import { registerMigrateCommand } from "./commands/migrate";
import { registerOutdatedCommand } from "./commands/outdated";
import { registerPackCommand } from "./commands/pack";
import { registerPublishCommand } from "./commands/publish";
import { registerRebuildCommand } from "./commands/rebuild";
import { registerRemoveCommand } from "./commands/remove";
import { registerSearchCommand } from "./commands/search";
import { registerSelfUpdateCommand } from "./commands/selfUpdate";
import { registerServerCommand } from "./commands/server";
import { registerStatusCommand } from "./commands/status";
import { registerUpdateCommand } from "./commands/update";
import { registerVendorCommand } from "./commands/vendor";
import { registerVerifyCommand } from "./commands/verify";
import { registerWhyCommand } from "./commands/why";
import { setLogLevel } from "./tools/logger";

export function getPackageVersion() {
  const packageJsonPath = path.resolve(__dirname, "../package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
    version?: unknown;
  };

  return typeof packageJson.version === "string" && packageJson.version.trim()
    ? packageJson.version
    : "0.0.0";
}

/**
 * Creates the CLI program with every supported command registered.
 */
export function createProgram(version = getPackageVersion()) {
  const program = new Command();

  program
    .name("cppkg-cli")
    .description(
      "Download C/C++ packages into a shared include directory or project workspace",
    )
    .version(version)
    .option("--verbose", "Enable verbose output")
    .option("--quiet", "Suppress non-error output");

  program.hook("preAction", (thisCommand: Command) => {
    const rootOpts = thisCommand.opts();
    if (rootOpts.quiet) setLogLevel("quiet");
    else if (rootOpts.verbose) setLogLevel("verbose");
  });

  registerAddCommand(program);
  registerAuditCommand(program);
  registerGetCommand(program);
  registerImportCommand(program);
  registerInitCommand(program);
  registerCompileCommand(program);
  registerBugCommand(program);
  registerBuildCommand(program);
  registerCompilerCommand(program);
  registerCreateCommand(program);
  registerInstallCommand(program);
  registerIntegrateCommand(program);
  registerInspectCommand(program);
  registerListCommand(program);
  registerLockfileCommand(program);
  registerPackCommand(program);
  registerPublishCommand(program);
  registerRebuildCommand(program);
  registerRemoveCommand(program);
  registerSearchCommand(program);
  registerServerCommand(program);
  registerStatusCommand(program);
  registerUpdateCommand(program);
  registerVendorCommand(program);
  registerCacheCommand(program);
  registerCleanCommand(program);
  registerCMakeCommand(program);
  registerCompletionCommand(program);
  registerConfigCommand(program);
  registerDiffCommand(program);
  registerDiagnoseCommand(program);
  registerDocsCommand(program);
  registerHomeCommand(program);
  registerEnvCommand(program);
  registerExecCommand(program);
  registerGraphCommand(program);
  registerInfoCommand(program);
  registerLicensesCommand(program);
  registerMigrateCommand(program);
  registerOutdatedCommand(program);
  registerSelfUpdateCommand(program);
  registerVerifyCommand(program);
  registerWhyCommand(program);

  return program;
}
