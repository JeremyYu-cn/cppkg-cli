import { Command } from "commander";
import type { GetPkgOptions } from "../types/global";
import { getVCPkg } from "../tools/download/main";
import { logger } from "../tools/logger";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Registers the package download command on the root CLI program.
 */
export function registerGetCommand(program: Command) {
  program
    .command("get")
    .description(
      "Download GitHub repositories or remote zip archives into the configured package directory",
    )
    .argument(
      "<repo-urls...>",
      "One or more GitHub repository URLs, GitHub API repository URLs, Gitee repository URLs, or direct zip archive URLs separated by spaces",
    )
    .option(
      "--full-project",
      "Install the package as a full project and skip include-directory detection",
    )
    .option("--http-proxy <url>", "HTTP request proxy, overrides config")
    .option("--https-proxy <url>", "HTTPS request proxy, overrides config")
    .action(async (repoURLs: string[], options: GetPkgOptions) => {
      if (repoURLs.length === 1) {
        await getVCPkg(repoURLs[0]!, options);
        return;
      }

      logger.info(`Installing ${repoURLs.length} package(s).`);

      const results = await Promise.allSettled(
        repoURLs.map(async (repoURL, index) => {
          logger.step(index + 1, repoURLs.length, `Installing ${repoURL}`);
          await getVCPkg(repoURL, options);
        }),
      );
      const failures = results.flatMap((result, index) => {
        if (result.status === "fulfilled") {
          return [];
        }

        return [
          {
            message: getErrorMessage(result.reason),
            repoURL: repoURLs[index]!,
          },
        ];
      });

      if (!failures.length) {
        logger.success(`Installed ${repoURLs.length} package(s).`);
        return;
      }

      const installedCount = repoURLs.length - failures.length;

      if (installedCount > 0) {
        logger.warn(`Installed ${installedCount} of ${repoURLs.length} package(s).`);
      }

      for (const failure of failures) {
        logger.error(`Failed to install ${failure.repoURL}: ${failure.message}`);
      }

      throw new Error(
        `Failed to install ${failures.length} of ${repoURLs.length} package(s).`,
      );
    });
}
