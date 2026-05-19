import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import { MANIFEST_FILE_NAME } from "../public/manifest";
import { importConanDependencies, importVcpkgDependencies } from "../tools/import";
import { logger } from "../tools/logger";

type MigrateOptions = {
  dryRun?: boolean;
  format?: "vcpkg" | "conan";
  out?: string;
};

async function exportToVcpkg(dryRun: boolean, outFile?: string) {
  const manifestPath = path.resolve(process.cwd(), MANIFEST_FILE_NAME);
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`${MANIFEST_FILE_NAME} not found.`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const deps = manifest.dependencies || {};
  const vcpkgDeps: string[] = [];

  for (const [name, entry] of Object.entries(deps)) {
    if (typeof entry === "string") {
      vcpkgDeps.push(`  "${name}"`);
    } else if (typeof entry === "object" && entry !== null) {
      const e = entry as Record<string, unknown>;
      vcpkgDeps.push(`  "${e.name || name}"`);
    }
  }

  const output = JSON.stringify({ dependencies: vcpkgDeps.map((d) => JSON.parse(d)) }, null, 2) + "\n";

  if (dryRun) {
    logger.info("Would generate vcpkg.json:");
    logger.raw(output);
    return;
  }

  const outputPath = outFile ? path.resolve(outFile) : path.resolve("vcpkg.json");
  fs.writeFileSync(outputPath, output, "utf8");
  logger.success(`Exported to ${outputPath}`);
}

async function exportToConan(dryRun: boolean, outFile?: string) {
  const manifestPath = path.resolve(process.cwd(), MANIFEST_FILE_NAME);
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`${MANIFEST_FILE_NAME} not found.`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const deps = manifest.dependencies || {};
  const lines: string[] = ["[requires]"];

  for (const [name] of Object.entries(deps)) {
    lines.push(`${name}/1.0.0`);
  }

  const output = lines.join("\n") + "\n";

  if (dryRun) {
    logger.info("Would generate conanfile.txt:");
    logger.raw(output);
    return;
  }

  const outputPath = outFile ? path.resolve(outFile) : path.resolve("conanfile.txt");
  fs.writeFileSync(outputPath, output, "utf8");
  logger.success(`Exported to ${outputPath}`);
}

export function registerMigrateCommand(program: Command) {
  const migrate = program
    .command("migrate")
    .description("Migrate packages to/from vcpkg and Conan formats");

  migrate
    .command("import")
    .description("Import dependencies from vcpkg.json or conanfile.txt into cppkg.json")
    .argument("<file>", "Path to vcpkg.json or conanfile.txt")
    .option("--dry-run", "Show what would be imported without writing")
    .option("--replace", "Replace existing dependencies instead of merging")
    .action((file: string, options: { dryRun?: boolean; replace?: boolean }) => {
      const filePath = path.resolve(file);
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }
      const basename = path.basename(filePath).toLowerCase();
      let importedDeps;
      if (basename.startsWith("vcpkg")) {
        importedDeps = importVcpkgDependencies(filePath);
      } else if (basename.startsWith("conanfile")) {
        importedDeps = importConanDependencies(filePath);
      } else {
        throw new Error("Unrecognized file format. Expected vcpkg.json or conanfile.txt");
      }
      if (!importedDeps.length) {
        logger.info("No dependencies found.");
        return;
      }
      if (options.dryRun) {
        logger.info(`Would import ${importedDeps.length} package(s):`);
        for (const dep of importedDeps) {
          logger.detail("package", `${dep.name} -> ${dep.source}`);
        }
        return;
      }

      const seen = new Set<string>();
      const deduped = importedDeps.filter((dep) => {
        const name = dep.name || "unknown";
        if (seen.has(name)) return false;
        seen.add(name);
        return true;
      });

      const manifestPath = path.resolve(process.cwd(), MANIFEST_FILE_NAME);
      let existingDeps: Record<string, unknown> = {};
      if (fs.existsSync(manifestPath)) {
        const existing = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
        existingDeps = (existing.dependencies as Record<string, unknown>) || {};
      }
      for (const dep of deduped) {
        const name = dep.name || "unknown";
        if (options.replace || !(name in existingDeps)) {
          existingDeps[name] = dep.source;
        }
      }
      const outputManifest: Record<string, unknown> = { dependencies: existingDeps };
      fs.writeFileSync(manifestPath, JSON.stringify(outputManifest, null, 2) + "\n", "utf8");
      logger.success(`Imported ${deduped.length} package(s) into ${MANIFEST_FILE_NAME}.`);
    });

  migrate
    .command("export")
    .description("Export cppkg.json dependencies to vcpkg or Conan format")
    .option("--format <format>", "Target format: vcpkg or conan", "vcpkg")
    .option("--out <file>", "Output file path")
    .option("--dry-run", "Show what would be exported without writing")
    .action(async (options: MigrateOptions) => {
      if (options.format === "conan") {
        await exportToConan(!!options.dryRun, options.out);
      } else {
        await exportToVcpkg(!!options.dryRun, options.out);
      }
    });
}
