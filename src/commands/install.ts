import { Command } from "commander";
import type { GetPkgOptions } from "../types/global";
import {
  getManifestDependencyOptions,
  type ManifestDependency,
  readPackageManifest,
} from "../public/manifest";
import { getVCPkg } from "../tools/download/main";
import { resolveInputSource } from "../tools/download/sources";
import { logger } from "../tools/logger";

type InstallOptions = Pick<GetPkgOptions, "httpProxy" | "httpsProxy">;

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function getDependencyLabel(dependency: ManifestDependency) {
  if (dependency.name) {
    return dependency.name;
  }

  try {
    return resolveInputSource(dependency.source).packageName;
  } catch {
    return dependency.source;
  }
}

function getSelectorVariants(dependency: ManifestDependency) {
  const variants = new Set<string>();

  if (dependency.name) {
    variants.add(dependency.name);
  }

  variants.add(dependency.source);

  try {
    const source = resolveInputSource(dependency.source);

    variants.add(source.packageName);
    variants.add(source.repositoryPath);
    variants.add(source.repositoryPath.replace(/^\/+/, ""));
    variants.add(source.repositoryUrl.replace(/\/+$/, ""));
  } catch {
    // Manifest validation should catch invalid sources before this point.
  }

  return variants;
}

function matchesDependencySelector(
  dependency: ManifestDependency,
  selector: string,
) {
  const normalizedSelector = selector.trim().replace(/\/+$/, "");

  return getSelectorVariants(dependency).has(normalizedSelector);
}

function resolveSelectedDependencies(
  dependencies: ManifestDependency[],
  selectors: string[],
) {
  if (!selectors.length) {
    return dependencies;
  }

  const selected = new Map<number, ManifestDependency>();

  for (const selector of selectors) {
    const matches = dependencies
      .map((dependency, index) => ({ dependency, index }))
      .filter(({ dependency }) =>
        matchesDependencySelector(dependency, selector),
      );

    if (!matches.length) {
      throw new Error(`Cannot find manifest dependency: ${selector}`);
    }

    if (matches.length > 1) {
      throw new Error(
        `Manifest dependency selector "${selector}" is ambiguous. Use one of: ${matches.map(({ dependency }) => getDependencyLabel(dependency)).join(", ")}`,
      );
    }

    const match = matches[0]!;
    selected.set(match.index, match.dependency);
  }

  return [...selected.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, dependency]) => dependency);
}

/**
 * Registers the command that installs dependencies from cppkg.json.
 */
export function registerInstallCommand(program: Command) {
  program
    .command("install")
    .description("Install dependencies declared in cppkg.json")
    .argument(
      "[packages...]",
      "Optional dependency names, repository paths, package names, or source URLs from cppkg.json",
    )
    .option("--http-proxy <url>", "HTTP request proxy, overrides config")
    .option("--https-proxy <url>", "HTTPS request proxy, overrides config")
    .action(async (selectors: string[], options: InstallOptions) => {
      const manifest = await readPackageManifest();
      const dependencies = resolveSelectedDependencies(
        manifest.dependencies,
        selectors,
      );

      if (!dependencies.length) {
        logger.warn("No dependencies found in cppkg.json.");
        return;
      }

      if (dependencies.length === 1) {
        const dependency = dependencies[0]!;

        await getVCPkg(
          dependency.source,
          getManifestDependencyOptions(dependency, options),
        );
        return;
      }

      logger.info(`Installing ${dependencies.length} manifest package(s).`);

      const results = await Promise.allSettled(
        dependencies.map(async (dependency, index) => {
          logger.step(
            index + 1,
            dependencies.length,
            `Installing ${getDependencyLabel(dependency)}`,
          );
          await getVCPkg(
            dependency.source,
            getManifestDependencyOptions(dependency, options),
          );
        }),
      );
      const failures = results.flatMap((result, index) => {
        if (result.status === "fulfilled") {
          return [];
        }

        return [
          {
            dependency: dependencies[index]!,
            message: getErrorMessage(result.reason),
          },
        ];
      });

      if (!failures.length) {
        logger.success(`Installed ${dependencies.length} package(s).`);
        return;
      }

      const installedCount = dependencies.length - failures.length;

      if (installedCount > 0) {
        logger.warn(
          `Installed ${installedCount} of ${dependencies.length} package(s).`,
        );
      }

      for (const failure of failures) {
        logger.error(
          `Failed to install ${getDependencyLabel(failure.dependency)}: ${failure.message}`,
        );
      }

      throw new Error(
        `Failed to install ${failures.length} of ${dependencies.length} package(s).`,
      );
    });
}
