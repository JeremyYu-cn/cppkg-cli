import { Command } from "commander";
import { spawnSync } from "node:child_process";
import { resolvePublicIncludePath, resolveProjectsRootPath } from "../public/packagePath";

export function registerExecCommand(program: Command) {
  program
    .command("exec")
    .description("Run a command with CPPKG_INCLUDE_DIR and CPPKG_PROJECTS_DIR in environment")
    .argument("<command...>", "Command and arguments to execute")
    .action((args: string[]) => {
      const includeDir = resolvePublicIncludePath();
      const projectsDir = resolveProjectsRootPath();

      const env: Record<string, string | undefined> = {
        ...process.env,
        CPPKG_INCLUDE_DIR: includeDir,
        CPPKG_PROJECTS_DIR: projectsDir,
        CPATH: process.env.CPATH
          ? `${includeDir}:${process.env.CPATH}`
          : includeDir,
        C_INCLUDE_PATH: process.env.C_INCLUDE_PATH
          ? `${includeDir}:${process.env.C_INCLUDE_PATH}`
          : includeDir,
        CPLUS_INCLUDE_PATH: process.env.CPLUS_INCLUDE_PATH
          ? `${includeDir}:${process.env.CPLUS_INCLUDE_PATH}`
          : includeDir,
      };

      const result = spawnSync(args[0]!, args.slice(1), {
        stdio: "inherit",
        env,
        shell: true,
      });

      process.exitCode = result.status ?? 1;
    });
}
