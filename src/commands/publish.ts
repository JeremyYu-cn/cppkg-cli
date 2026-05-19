import { Command } from "commander";
import { publishPackage, type PublishOptions } from "../tools/publish";

/**
 * Registers the command that publishes the current project as a package archive.
 */
export function registerPublishCommand(program: Command) {
  program
    .command("publish")
    .description("Publish the project as a package archive to GitHub releases")
    .option("--registry <url>", "GitHub API base URL for publishing")
    .option("--tag <tag>", "Release tag (defaults to latest git tag or v0.0.0)")
    .option("--name <name>", "Release name (defaults to the release tag)")
    .option("--dry-run", "Preview what would be published without actually publishing")
    .action(async (options: PublishOptions) => {
      await publishPackage(options);
    });
}
