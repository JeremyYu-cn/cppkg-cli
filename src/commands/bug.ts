import { Command } from "commander";
import { logger } from "../tools/logger";
import { getErrorMessage } from "../tools/errors";
import { openUrl } from "../tools/open";

const BUG_URL = "https://github.com/JeremyYu-cn/cppkg-cli/issues";

export function registerBugCommand(program: Command) {
  program
    .command("bug")
    .description("Open the cppkg-cli issue tracker in the default browser")
    .action(async () => {
      try {
        openUrl(BUG_URL);
        logger.info(`Opened ${BUG_URL}`);
      } catch (error: unknown) {
        logger.error(`Failed to open browser: ${getErrorMessage(error)}`);
      }
    });
}
