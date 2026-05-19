import { Command } from "commander";
import { logger } from "../tools/logger";
import { getErrorMessage } from "../tools/errors";
import { openUrl } from "../tools/open";

const HOME_URL = "https://github.com/JeremyYu-cn/cppkg-cli";

export function registerHomeCommand(program: Command) {
  program
    .command("home")
    .description("Open the cppkg-cli GitHub repository in the default browser")
    .action(async () => {
      try {
        openUrl(HOME_URL);
        logger.info(`Opened ${HOME_URL}`);
      } catch (error: unknown) {
        logger.error(`Failed to open browser: ${getErrorMessage(error)}`);
      }
    });
}
