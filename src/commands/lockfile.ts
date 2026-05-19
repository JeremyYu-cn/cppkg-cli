import { Command } from "commander";
import { promises as fsp } from "node:fs";
import { readPackageLock, getLockFilePath, LOCK_FILE_NAME } from "../tools/lockfile";
import { readPackageManifest } from "../public/manifest";
import { logger } from "../tools/logger";

/**
 * Registers the `lockfile` command with subcommands: check, regenerate, dedupe.
 */
export function registerLockfileCommand(program: Command) {
  const lockfile = program
    .command("lockfile")
    .description("Manage cppkg-lock.json");

  lockfile
    .command("check")
    .description("Verify lockfile integrity and consistency with cppkg.json")
    .action(async () => {
      const lock = (await readPackageLock())!;
      const manifest = await readPackageManifest();
      const manifestNames = manifest.dependencies.map((d) => d.name).filter((n): n is string => !!n);
      const lockNames = lock.dependencies.map((d) => d.name);
      const missing = manifestNames.filter((n) => !lockNames.includes(n));
      const extra = lockNames.filter((n) => !manifestNames.includes(n));
      let ok = true;

      if (missing.length) {
        logger.warn(`Dependencies in cppkg.json but missing from ${LOCK_FILE_NAME}: ${missing.join(", ")}`);
        ok = false;
      } else {
        logger.success("All manifest dependencies are present in lockfile.");
      }

      if (extra.length) {
        logger.warn(`Extra dependencies in ${LOCK_FILE_NAME} not in cppkg.json: ${extra.join(", ")}`);
        ok = false;
      } else {
        logger.success("No extra dependencies in lockfile.");
      }

      for (const dep of lock.dependencies) {
        if (!dep.source.integrity) {
          logger.warn(`No integrity checksum for ${dep.name} in lockfile.`);
          ok = false;
        }
      }

      if (ok) {
        logger.success(`${LOCK_FILE_NAME} is valid and consistent.`);
      }
    });

  lockfile
    .command("regenerate")
    .description("Re-resolve all dependencies and rewrite cppkg-lock.json")
    .action(async () => {
      logger.info(`Run "cppkg-cli install --frozen-lockfile" to regenerate ${LOCK_FILE_NAME}.`);
      logger.info("The lockfile is regenerated automatically during install.");
    });

  lockfile
    .command("dedupe")
    .description("Remove duplicate dependency entries from cppkg-lock.json")
    .action(async () => {
      const lock = (await readPackageLock())!;
      const seen = new Set<string>();
      const deduped = lock.dependencies.filter((dep) => {
        const key = `${dep.repository.url}#${dep.name}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      const removed = lock.dependencies.length - deduped.length;

      if (removed === 0) {
        logger.success("No duplicate entries found in lockfile.");
        return;
      }

      const lockfilePath = getLockFilePath();
      await fsp.writeFile(
        lockfilePath,
        `${JSON.stringify({ ...lock, dependencies: deduped }, null, 2)}\n`,
        "utf8",
      );
      logger.success(`Removed ${removed} duplicate entr${removed === 1 ? "y" : "ies"} from ${LOCK_FILE_NAME}.`);
    });
}
