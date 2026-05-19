import { Command } from "commander";
import type { GetPkgOptions } from "../types/global";
import type { InspectedPackage, PackageRecommendation } from "../tools/inspect";
import {
  addPackageManifestDependency,
  type AddManifestDependencyOptions,
  getManifestDependencyOptions,
  type ManifestDependency,
} from "../public/manifest";
import { getVCPkg } from "../tools/download/main";
import {
  getRejectedPackageDownloadTasks,
  normalizePackageDownloadJobs,
  runPackageDownloadTasks,
} from "../tools/download/tasks";
import { getErrorMessage } from "../tools/errors";
import { inspectProjectPackages } from "../tools/inspect";
import { logger } from "../tools/logger";

type InspectOptions = Pick<GetPkgOptions, "cache" | "httpProxy" | "httpsProxy"> & {
  add?: boolean;
  force?: boolean;
  install?: boolean;
};

type RecommendedPackage = {
  recommendation: PackageRecommendation;
  packages: InspectedPackage[];
};

function getRecommendedMissingPackages(packages: InspectedPackage[]) {
  const recommended = new Map<string, RecommendedPackage>();

  for (const item of packages) {
    if (item.status !== "missing" || !item.recommendation) {
      continue;
    }

    const key = `${item.recommendation.name}\0${item.recommendation.source}`;
    const existing = recommended.get(key);

    if (existing) {
      existing.packages.push(item);
      continue;
    }

    recommended.set(key, {
      packages: [item],
      recommendation: item.recommendation,
    });
  }

  return [...recommended.values()].sort((left, right) =>
    left.recommendation.name.localeCompare(right.recommendation.name),
  );
}

async function addRecommendedPackages(
  packages: RecommendedPackage[],
  options: InspectOptions,
) {
  const dependencies: ManifestDependency[] = [];

  for (const item of packages) {
    const addOptions: AddManifestDependencyOptions = {
      name: item.recommendation.name,
    };

    if (options.force !== undefined) {
      addOptions.force = options.force;
    }

    const result = await addPackageManifestDependency(
      item.recommendation.source,
      addOptions,
    );

    dependencies.push(result.dependency);
    logger.success(`Added ${result.dependency.name} to cppkg.json.`);
  }

  return dependencies;
}

async function installRecommendedPackages(
  dependencies: ManifestDependency[],
  options: InspectOptions,
) {
  if (!dependencies.length) {
    return;
  }

  const getInstallOptions = (dependency: ManifestDependency) =>
    getManifestDependencyOptions(
      dependency,
      {
        ...(options.cache !== undefined ? { cache: options.cache } : {}),
        ...(options.httpProxy ? { httpProxy: options.httpProxy } : {}),
        ...(options.httpsProxy ? { httpsProxy: options.httpsProxy } : {}),
      },
    );

  if (dependencies.length === 1) {
    const dependency = dependencies[0]!;

    await getVCPkg(dependency.source, getInstallOptions(dependency));
    return;
  }

  logger.info(`Installing ${dependencies.length} recommended package(s).`);

  const results = await runPackageDownloadTasks(
    dependencies.map((dependency) => ({
      item: dependency,
      label: dependency.name || dependency.source,
      run: () => getVCPkg(dependency.source, getInstallOptions(dependency)),
    })),
    { jobs: normalizePackageDownloadJobs(undefined, dependencies.length) },
  );
  const failures = getRejectedPackageDownloadTasks(results);

  if (!failures.length) {
    logger.success(`Installed ${dependencies.length} recommended package(s).`);
    return;
  }

  for (const failure of failures) {
    logger.error(
      `Failed to install ${failure.item.name || failure.item.source}: ${getErrorMessage(failure.reason)}`,
    );
  }

  throw new Error(
    `Failed to install ${failures.length} of ${dependencies.length} recommended package(s).`,
  );
}

/**
 * Registers the command that inspects project source includes and package needs.
 */
export function registerInspectCommand(program: Command) {
  program
    .command("inspect")
    .description("Inspect C/C++ source includes and report package needs")
    .option("--add", "Add recommended missing package candidates to cppkg.json")
    .option(
      "--install",
      "Add and install recommended missing package candidates",
    )
    .option("-f, --force", "Replace existing manifest dependencies when adding")
    .option("--no-cache", "Bypass cached archives when used with --install")
    .option("--http-proxy <url>", "HTTP request proxy, overrides config")
    .option("--https-proxy <url>", "HTTPS request proxy, overrides config")
    .option("--json", "Output result as JSON")
    .action(async (options: InspectOptions & { json?: boolean }) => {
      const inspection = await inspectProjectPackages();

      if (options.json) {
        logger.raw(JSON.stringify(inspection, null, 2));
        return;
      }

      if (!inspection.filesScanned) {
        logger.warn("No C/C++ source files found in this project.");
        return;
      }

      logger.info(
        `Inspected ${inspection.filesScanned} C/C++ file(s) and ${inspection.includeCount} include directive(s).`,
      );

      if (!inspection.packages.length) {
        logger.success("No external package includes found.");
        return;
      }

      logger.table(
        inspection.packages.map((dependency) => ({
          package: dependency.name,
          status: dependency.status,
          includes: dependency.includes.join(", "),
          recommendation: dependency.status === "missing" && dependency.recommendation
            ? `${dependency.recommendation.name} -> ${dependency.recommendation.source}`
            : "",
          usedBy: dependency.usages
            .map((usage) => `${usage.filePath}:${usage.line}`)
            .join(", "),
        })),
      );

      const missingPackages = inspection.packages.filter(
        (dependency) => dependency.status === "missing",
      );

      if (missingPackages.length) {
        logger.warn(
          `Found ${missingPackages.length} missing package candidate(s).`,
        );
      } else {
        logger.success("All detected package includes are installed or declared.");
      }

      if (!options.add && !options.install) {
        return;
      }

      const recommendedPackages = getRecommendedMissingPackages(missingPackages);
      const unrecommendedCount = missingPackages.length - recommendedPackages
        .reduce((count, item) => count + item.packages.length, 0);

      if (unrecommendedCount > 0) {
        logger.warn(
          `${unrecommendedCount} missing package candidate(s) have no installable recommendation.`,
        );
      }

      if (!recommendedPackages.length) {
        logger.warn("No recommended missing packages to add or install.");
        return;
      }

      const dependencies = await addRecommendedPackages(recommendedPackages, options);

      if (options.install) {
        await installRecommendedPackages(dependencies, options);
      }
    });
}
