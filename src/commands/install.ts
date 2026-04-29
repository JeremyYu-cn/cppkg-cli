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

type InstallOptions = Pick<GetPkgOptions, "cache" | "httpProxy" | "httpsProxy">;
type RepositoryProvider = "github" | "gitee";

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

function addSelectorVariant(variants: Set<string>, value: string | undefined) {
  const normalized = value?.trim().replace(/\/+$/, "");

  if (!normalized) {
    return;
  }

  variants.add(normalized);
  variants.add(normalized.replace(/\.git$/i, ""));
}

function addRepositoryPathVariants(
  variants: Set<string>,
  repositoryPath: string,
  providers: RepositoryProvider[] = [],
  includeBarePath = true,
) {
  const normalizedPath = repositoryPath.trim().replace(/^\/+|\/+$/g, "")
    .replace(/\.git$/i, "");

  if (!normalizedPath) {
    return;
  }

  if (includeBarePath) {
    addSelectorVariant(variants, normalizedPath);
    addSelectorVariant(variants, `/${normalizedPath}`);
  }

  if (providers.includes("github")) {
    addSelectorVariant(variants, `github.com/${normalizedPath}`);
    addSelectorVariant(variants, `https://github.com/${normalizedPath}`);
  }

  if (providers.includes("gitee")) {
    addSelectorVariant(variants, `gitee.com/${normalizedPath}`);
    addSelectorVariant(variants, `https://gitee.com/${normalizedPath}`);
    addSelectorVariant(variants, `https://gitee.com/${normalizedPath}.git`);
  }
}

function resolveURLLikeSelector(value: string) {
  try {
    return resolveInputSource(value);
  } catch {
    if (/^(?:www\.)?(?:github|gitee)\.com\//i.test(value)) {
      try {
        return resolveInputSource(`https://${value}`);
      } catch {
        return null;
      }
    }

    return null;
  }
}

function getSelectorVariants(dependency: ManifestDependency) {
  const variants = new Set<string>();

  addSelectorVariant(variants, dependency.name);
  addSelectorVariant(variants, dependency.source);

  try {
    const source = resolveInputSource(dependency.source);

    addSelectorVariant(variants, source.packageName);
    addSelectorVariant(variants, source.repositoryUrl);

    if (source.kind === "github-repository") {
      addRepositoryPathVariants(variants, source.repositoryPath, ["github"]);
    } else if (source.kind === "gitee-repository") {
      addRepositoryPathVariants(variants, source.repositoryPath, ["gitee"]);
    }
  } catch {
    // Manifest validation should catch invalid sources before this point.
  }

  return variants;
}

function getUserSelectorVariants(selector: string) {
  const variants = new Set<string>();
  const normalizedSelector = selector.trim().replace(/\/+$/, "");
  const source = resolveURLLikeSelector(normalizedSelector);

  addSelectorVariant(variants, normalizedSelector);

  if (source?.kind === "github-repository") {
    addSelectorVariant(variants, source.repositoryUrl);
    addRepositoryPathVariants(variants, source.repositoryPath, ["github"], false);
  } else if (source?.kind === "gitee-repository") {
    addSelectorVariant(variants, source.repositoryUrl);
    addRepositoryPathVariants(variants, source.repositoryPath, ["gitee"], false);
  } else if (!source) {
    addRepositoryPathVariants(
      variants,
      normalizedSelector
        .replace(/^https?:\/\/(?:www\.)?github\.com\//i, "")
        .replace(/^github\.com\//i, "")
        .replace(/^https?:\/\/(?:www\.)?gitee\.com\//i, "")
        .replace(/^gitee\.com\//i, "")
        .replace(/^https?:\/\/api\.github\.com\/repos\//i, "")
        .replace(/^https?:\/\/gitee\.com\/api\/v5\/repos\//i, ""),
    );
  }

  return variants;
}

function matchesDependencySelector(
  dependency: ManifestDependency,
  selector: string,
) {
  const selectorVariants = getUserSelectorVariants(selector);
  const dependencyVariants = getSelectorVariants(dependency);

  return [...selectorVariants].some((variant) => dependencyVariants.has(variant));
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
    .option("--no-cache", "Bypass cached archives and refresh downloads")
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
