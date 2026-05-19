import { Command } from "commander";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { logger } from "../tools/logger";
import { MANIFEST_FILE_NAME, readPackageManifest } from "../public/manifest";

function getPackageName(): string {
  try {
    const manifest = readFileSync(
      path.resolve(process.cwd(), MANIFEST_FILE_NAME),
      "utf8",
    );
    const parsed = JSON.parse(manifest) as { name?: string; version?: string };
    return `${parsed.name || "package"}-${parsed.version || "0.0.0"}`;
  } catch {
    return "package-0.0.0";
  }
}

export function registerPackCommand(program: Command) {
  program
    .command("pack")
    .description("Create a distributable tarball of the current project")
    .option("--output <path>", "Output file path")
    .action(async (options: { output?: string }) => {
      const cwd = process.cwd();

      if (!existsSync(path.resolve(cwd, MANIFEST_FILE_NAME))) {
        logger.error(`No ${MANIFEST_FILE_NAME} found in current directory.`);
        process.exitCode = 1;
        return;
      }

      const baseName = getPackageName();
      const outputFile = options.output
        ? path.resolve(options.output)
        : path.resolve(cwd, `${baseName}.tgz`);

      const manifest = await readPackageManifest();

      mkdirSync(path.dirname(outputFile), { recursive: true });

      const result = spawnSync(
        "tar",
        [
          "czf", outputFile,
          "--exclude=node_modules",
          "--exclude=.git",
          "--exclude=dist",
          "--exclude=.turbo",
          MANIFEST_FILE_NAME,
          "cppkg-lock.json",
          ...(existsSync(path.resolve(cwd, "CMakeLists.txt")) ? ["CMakeLists.txt"] : []),
          ...(existsSync(path.resolve(cwd, "src")) ? ["src"] : []),
          ...(existsSync(path.resolve(cwd, "include")) ? ["include"] : []),
          ...(existsSync(path.resolve(cwd, "libs")) ? ["libs"] : []),
        ],
        { cwd, stdio: "pipe" },
      );

      if (result.status !== 0) {
        const stderr = result.stderr?.toString() || "";
        logger.error(`Failed to create tarball: ${stderr}`);
        process.exitCode = 1;
        return;
      }

      logger.success(`Created ${path.relative(cwd, outputFile) || outputFile}`);

      const stat = existsSync(outputFile) ? await import("node:fs").then((m) => m.promises.stat(outputFile)) : null;
      if (stat) {
        const size = stat.size;
        const sizeStr = size < 1024
          ? `${size} B`
          : size < 1024 * 1024
            ? `${(size / 1024).toFixed(1)} KB`
            : `${(size / (1024 * 1024)).toFixed(1)} MB`;
        logger.detail("Size", sizeStr);
      }

      const depCount = manifest.dependencies.length;
      if (depCount > 0) {
        logger.detail("Dependencies", depCount);
      }
    });
}
