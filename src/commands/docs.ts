import { Command } from "commander";
import { logger } from "../tools/logger";
import { getErrorMessage } from "../tools/errors";
import { openUrl } from "../tools/open";

const DOCS_URL = "https://jeremyyu-cn.github.io/cppkg-cli/";

export function registerDocsCommand(program: Command) {
  program
    .command("docs")
    .description("Open the cppkg-cli documentation site in the default browser")
    .action(async () => {
      try {
        openUrl(DOCS_URL);
        logger.info(`Opened ${DOCS_URL}`);
      } catch (error: unknown) {
        logger.error(`Failed to open browser: ${getErrorMessage(error)}`);
      }
    });
}
