import fs from "node:fs";
import { promises as fsp } from "node:fs";
import path from "node:path";
import type { GetPkgOptions } from "../types/global";
import { resolveInputSource } from "../tools/download/sources";

export const MANIFEST_FILE_NAME = "cppkg.json";

const DEPENDENCY_KEYS = new Set([
  "name", "source", "tag", "branch", "prerelease", "fullProject",
]);

export type ManifestDependency = {
  name?: string; source: string; tag?: string; branch?: string;
  prerelease?: boolean; fullProject?: boolean;
};
export type PackageManifest = { dependencies: ManifestDependency[] };

export type AddManifestDependencyOptions = Pick<
  ManifestDependency,
  "branch" | "fullProject" | "name" | "prerelease" | "tag"
> & {
  force?: boolean;
};

type CreateManifestOptions = { force?: boolean };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compact<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}

function labelFor(nameOrIndex: number | string) {
  return typeof nameOrIndex === "number" ? `dependencies[${nameOrIndex}]` : `dependencies.${nameOrIndex}`;
}

function readObject(value: unknown, label: string) {
  if (!isRecord(value)) throw new Error(`${label} must be a JSON object.`);
  return value;
}

function readString(value: unknown, label: string) {
  if (typeof value !== "string") throw new Error(`${label} must be a string.`);

  const normalized = value.trim();

  if (!normalized) throw new Error(`${label} cannot be empty.`);

  return normalized;
}

function readOptionalString(record: Record<string, unknown>, key: string, label: string) {
  const value = record[key];
  return value === undefined ? undefined : readString(value, `${label}.${key}`);
}

function readOptionalBoolean(record: Record<string, unknown>, key: string, label: string) {
  const value = record[key];

  if (value === undefined) return undefined;

  if (typeof value !== "boolean") {
    throw new Error(`${label}.${key} must be a boolean.`);
  }

  return value;
}

function readSource(value: unknown, label: string) {
  const source = readString(value, `${label}.source`);
  let parsed: URL;

  try {
    parsed = new URL(source);
  } catch {
    throw new Error(`${label}.source must be a valid URL.`);
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error(`${label}.source must use http or https.`);
  }

  return parsed.toString();
}

function normalizeSourceInput(value: string) {
  const source = readString(value, "source");

  try {
    return readSource(source, "source");
  } catch {
    if (/^(?:www\.)?(?:github|gitee)\.com\//i.test(source)) {
      return readSource(`https://${source}`, "source");
    }

    if (/^[^/\s]+\/[^/\s]+$/u.test(source)) {
      return readSource(`https://github.com/${source}`, "source");
    }

    throw new Error(
      "source must be a URL, github.com/owner/repo, gitee.com/owner/repo, or owner/repo.",
    );
  }
}

function normalizeSourceForManifest(value: string) {
  return resolveInputSource(normalizeSourceInput(value)).repositoryUrl;
}

function assertDependencyKeys(record: Record<string, unknown>, label: string) {
  const unknownKey = Object.keys(record).find((key) => !DEPENDENCY_KEYS.has(key));

  if (!unknownKey) return;

  throw new Error(
    `${label} contains unknown key "${unknownKey}". Supported keys: ${[...DEPENDENCY_KEYS].join(", ")}`,
  );
}

function parseDependency(value: unknown, nameOrIndex: number | string, fallbackName?: string): ManifestDependency {
  const label = labelFor(nameOrIndex);

  if (typeof value === "string") {
    return compact({
      name: fallbackName,
      source: readSource(value, label),
    }) as ManifestDependency;
  }

  const record = readObject(value, `${label} dependency`);

  assertDependencyKeys(record, label);

  const tag = readOptionalString(record, "tag", label);
  const branch = readOptionalString(record, "branch", label);

  if (tag && branch) {
    throw new Error(`${label} cannot define both tag and branch.`);
  }

  return compact({
    name: fallbackName ?? readOptionalString(record, "name", label),
    source: readSource(record.source, label),
    tag,
    branch,
    prerelease: readOptionalBoolean(record, "prerelease", label),
    fullProject: readOptionalBoolean(record, "fullProject", label),
  }) as ManifestDependency;
}

function parseDependencies(value: unknown): ManifestDependency[] {
  if (Array.isArray(value)) {
    return value.map((entry, index) => parseDependency(entry, index));
  }

  const record = readObject(value, "cppkg.json dependencies");

  return Object.entries(record).map(([name, entry]) => {
    const dependencyName = readString(name, "dependency name");

    return parseDependency(entry, dependencyName, dependencyName);
  });
}

export function getManifestFilePath() {
  return path.resolve(process.cwd(), MANIFEST_FILE_NAME);
}

export function createPackageManifest(options: CreateManifestOptions = {}) {
  const manifestFilePath = getManifestFilePath();

  if (fs.existsSync(manifestFilePath) && !options.force) {
    throw new Error(
      `${MANIFEST_FILE_NAME} already exists. Use --force to overwrite it.`,
    );
  }

  const manifest = {
    dependencies: {},
  };

  fs.writeFileSync(manifestFilePath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  return { manifest, manifestFilePath };
}

async function readManifestForWrite() {
  const manifestFilePath = getManifestFilePath();

  try {
    const parsed = JSON.parse(await fsp.readFile(manifestFilePath, "utf8")) as
      unknown;
    return readObject(parsed, MANIFEST_FILE_NAME);
  } catch (error: unknown) {
    const nodeError = error as NodeJS.ErrnoException;

    if (nodeError.code === "ENOENT") {
      return {
        dependencies: {},
      };
    }

    throw error;
  }
}

function getManifestEntryValue(dependency: ManifestDependency) {
  const entry = compact({
    source: dependency.source,
    tag: dependency.tag,
    branch: dependency.branch,
    prerelease: dependency.prerelease,
    fullProject: dependency.fullProject,
  });

  if (Object.keys(entry).length === 1) {
    return dependency.source;
  }

  return entry;
}

function assertAddOptions(options: AddManifestDependencyOptions) {
  if (options.tag && options.branch) {
    throw new Error("Options --tag and --branch cannot be used together.");
  }
}

export async function addPackageManifestDependency(
  sourceInput: string,
  options: AddManifestDependencyOptions = {},
) {
  assertAddOptions(options);

  const source = normalizeSourceForManifest(sourceInput);
  const sourceDetails = resolveInputSource(source);
  const name = options.name
    ? readString(options.name, "dependency name")
    : sourceDetails.packageName;
  const dependency = compact({
    name,
    source,
    tag: options.tag,
    branch: options.branch,
    prerelease: options.prerelease,
    fullProject: options.fullProject,
  }) as ManifestDependency;
  const manifest = await readManifestForWrite();
  const dependencies = "dependencies" in manifest ? manifest.dependencies : {};

  if (Array.isArray(dependencies)) {
    const existingDependencies = parseDependencies(dependencies);
    const existing = existingDependencies.find(
      (item) => item.name === name || item.source === source,
    );

    if (existing && !options.force) {
      throw new Error(
        `Dependency "${name}" already exists in ${MANIFEST_FILE_NAME}. Use --force to replace it.`,
      );
    }

    manifest.dependencies = [
      ...dependencies.filter((entry, index) => {
        const parsed = existingDependencies[index];

        return parsed?.name !== name && parsed?.source !== source;
      }),
      dependency,
    ];
  } else {
    const dependencyMap = readObject(dependencies, `${MANIFEST_FILE_NAME} dependencies`);

    parseDependencies(dependencyMap);

    if (name in dependencyMap && !options.force) {
      throw new Error(
        `Dependency "${name}" already exists in ${MANIFEST_FILE_NAME}. Use --force to replace it.`,
      );
    }

    dependencyMap[name] = getManifestEntryValue(dependency);
    manifest.dependencies = dependencyMap;
  }

  await fsp.writeFile(
    getManifestFilePath(),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );

  return {
    dependency,
    manifestFilePath: getManifestFilePath(),
  };
}

export async function readPackageManifest(): Promise<PackageManifest> {
  const manifestFilePath = getManifestFilePath();
  let parsed: unknown;

  try {
    parsed = JSON.parse(await fsp.readFile(manifestFilePath, "utf8")) as
      unknown;
  } catch (error: unknown) {
    const nodeError = error as NodeJS.ErrnoException;

    if (nodeError.code === "ENOENT") {
      throw new Error(`Cannot find ${MANIFEST_FILE_NAME}. Run "cppkg-cli init" first.`);
    }

    throw error;
  }

  const manifest = readObject(parsed, MANIFEST_FILE_NAME);

  if (!("dependencies" in manifest)) {
    throw new Error(`${MANIFEST_FILE_NAME} must define dependencies.`);
  }

  return { dependencies: parseDependencies(manifest.dependencies) };
}

export function getManifestDependencyOptions(
  dependency: ManifestDependency,
  cliOptions: Pick<GetPkgOptions, "cache" | "httpProxy" | "httpsProxy"> = {},
): GetPkgOptions {
  return compact({
    cache: cliOptions.cache,
    httpProxy: cliOptions.httpProxy || undefined,
    httpsProxy: cliOptions.httpsProxy || undefined,
    fullProject: dependency.fullProject,
    tag: dependency.tag,
    branch: dependency.branch,
    prerelease: dependency.prerelease,
  }) as GetPkgOptions;
}
