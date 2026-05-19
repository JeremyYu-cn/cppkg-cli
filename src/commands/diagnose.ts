import { Command } from "commander";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { MANIFEST_FILE_NAME } from "../public/manifest";
import { LOCK_FILE_NAME } from "../tools/lockfile";
import { logger } from "../tools/logger";

function checkCommand(cmd: string): boolean {
  try {
    execSync(`which ${cmd} 2>/dev/null`, { encoding: "utf8", timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

export function registerDiagnoseCommand(program: Command) {
  program
    .command("diagnose")
    .description("Diagnose the environment for cppkg-cli")
    .option("--json", "Output result as JSON")
    .action((options: { json?: boolean }) => {
      const cwd = process.cwd();
      const checks = {
        nodeVersion: process.version,
        platform: os.platform(),
        arch: os.arch(),
        manifestExists: fs.existsSync(path.resolve(cwd, MANIFEST_FILE_NAME)),
        lockfileExists: fs.existsSync(path.resolve(cwd, LOCK_FILE_NAME)),
        gitAvailable: checkCommand("git"),
        cmakeAvailable: checkCommand("cmake"),
        vcpkgAvailable: checkCommand("vcpkg"),
      };

      if (options.json) {
        logger.raw(JSON.stringify(checks, null, 2));
        return;
      }

      logger.info(`Node.js: ${checks.nodeVersion}`);
      logger.info(`Platform: ${checks.platform} (${checks.arch})`);
      logger.info(`Manifest: ${checks.manifestExists ? "found" : "not found"}`);
      logger.info(`Lockfile: ${checks.lockfileExists ? "found" : "not found"}`);
      logger.info(`Git: ${checks.gitAvailable ? "yes" : "no"}`);
      logger.info(`CMake: ${checks.cmakeAvailable ? "yes" : "no"}`);
      logger.info(`vcpkg: ${checks.vcpkgAvailable ? "yes" : "no"}`);

      const ok = checks.manifestExists || checks.lockfileExists;
      if (ok) {
        logger.success("Environment looks healthy.");
      } else {
        logger.warn("No cppkg project detected. Run 'cppkg-cli init' to create one.");
      }
    });
}
