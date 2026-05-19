import { Command } from "commander";
import { getPackageInfo } from "../tools/info";
import { logger } from "../tools/logger";

/**
 * Registers the command that shows detailed info about an installed package.
 */
export function registerInfoCommand(program: Command) {
  program
    .command("info")
    .description("Show detailed information about an installed package")
    .argument("<package>", "Installed package name or selector")
    .option("--json", "Output result as JSON")
    .action(async (selector: string, options: { json?: boolean }) => {
      const info = await getPackageInfo(selector);

      if (!info) {
        if (options.json) {
          logger.raw(JSON.stringify({ found: false, reason: `Package "${selector}" is not installed.` }));
          return;
        }
        throw new Error(`Package "${selector}" is not installed.`);
      }

      if (options.json) {
        logger.raw(JSON.stringify(info, null, 2));
        return;
      }

      logger.info(`Package: ${info.name}`);
      logger.detail("Version", info.version);
      logger.detail("Type", info.type);
      logger.detail("Install mode", info.install.mode);
      logger.detail("Repository", info.repository.url);
      logger.detail("Source URL", info.source.archiveUrl);
      logger.detail("Install target", info.install.target);

      if (info.release.tagName) {
        logger.detail("Release tag", info.release.tagName);
      }
      if (info.release.name) {
        logger.detail("Release name", info.release.name);
      }
      if (info.release.publishedAt) {
        logger.detail("Published at", info.release.publishedAt);
      }

      if (info.install.headers.length) {
        logger.detail("Headers", info.install.headers.join(", "));
      }
      if (info.install.paths.length) {
        logger.detail("Tracked paths", info.install.paths.length);
        for (const p of info.install.paths) {
          logger.detail("  ", p);
        }
      }

      if (info.transitiveDeps?.length) {
        logger.detail("Transitive deps", info.transitiveDeps.join(", "));
      }

      logger.detail("Installed at", info.installedAt);
    });
}
