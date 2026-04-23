import { Command } from "commander";
import { getVCPkg } from "../tools/download/main";

/**
 * Registers the package download command on the root CLI program.
 */
export function registerGetCommand(program: Command) {
  program
    .command("get")
    .description(
      "Download GitHub repositories or remote zip archives into the local cpp_libs directory",
    )
    .argument(
      "<repo-url>",
      "GitHub repository URL, GitHub API repository URL, or direct zip archive URL, for example https://github.com/nlohmann/json or https://example.com/downloads/lib.zip",
    )
    .option("--http-proxy <url>", "HTTP request proxy")
    .option("--https-proxy <url>", "HTTPS request proxy")
    .action(async (repoURL, options) => {
      await getVCPkg(repoURL, options);
    });
}
