import fs from "node:fs";
import { promises as fsp } from "node:fs";
import path from "node:path";
import type { GetPkgOptions, ManifestDependencyHooks, VersionPolicy } from "../types/global";
import { resolveInputSource } from "../tools/download/sources";
import { ManifestError } from "../tools/errors";

export const MANIFEST_FILE_NAME = "cppkg.json";

export const PLATFORM_NAMES = [
  "linux",
  "macos",
  "windows",
  "android",
  "ios",
] as const;

export type PlatformName = (typeof PLATFORM_NAMES)[number];

const PLATFORM_MAP: Record<string, PlatformName> = {
  linux: "linux",
  darwin: "macos",
  win32: "windows",
  android: "android",
  ios: "ios",
};

function getCurrentPlatform(): PlatformName {
  return PLATFORM_MAP[process.platform] ?? "linux";
}

const DEPENDENCY_KEYS = new Set([
  "name", "source", "tag", "branch", "prerelease", "fullProject",
  "versionPolicy", "versionRange", "includePath", "stripPrefix", "patches",
  "components", "checksum", "binary",
]);

const VERSION_POLICIES = new Set<VersionPolicy>([
  "default-branch",
  "latest-prerelease",
  "latest-release",
]);

export type ManifestDependency = {
  name?: string; source: string; tag?: string; branch?: string;
  versionPolicy?: VersionPolicy; versionRange?: string;
  prerelease?: boolean; fullProject?: boolean;
  includePath?: string[]; stripPrefix?: string; patches?: string[];
  components?: string[]; checksum?: string;
  binary?: { platform?: string; arch?: string; pattern?: string };
  platforms?: Partial<Record<PlatformName, ManifestDependencyPlatformOverride>>;
  platformWhitelist?: PlatformName[];
  hooks?: ManifestDependencyHooks;
};

export type ManifestDependencyPlatformOverride = Omit<
  ManifestDependency,
  "platforms" | "platformWhitelist"
>;

export type PackageManifest = { dependencies: ManifestDependency[] };

type InstallModifierFields = {
  checksum?: string | undefined;
  components?: string[] | undefined;
  includePath?: string[] | undefined;
  patches?: string[] | undefined;
  stripPrefix?: string | undefined;
};

export type AddManifestDependencyOptions = Pick<
  ManifestDependency,
  | "binary"
  | "branch"
  | "checksum"
  | "components"
  | "fullProject"
  | "includePath"
  | "name"
  | "patches"
  | "prerelease"
  | "stripPrefix"
  | "tag"
  | "versionPolicy"
  | "versionRange"
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

function parseBinary(
  value: unknown,
  label: string,
): ManifestDependency["binary"] {
  if (value === undefined) return undefined;

  if (typeof value === "string") {
    const parts = value.trim().split("/").filter(Boolean);
    const platform = parts[0];

    if (!platform) {
      throw new Error(`${label} cannot be empty.`);
    }

    if (parts.length === 1) {
      return { platform };
    }

    const arch = parts[1];

    if (arch) {
      return { platform, arch };
    }

    return { platform };
  }

  if (!isRecord(value)) {
    throw new Error(`${label} must be a string or object.`);
  }

  const platform = readOptionalString(value, "platform", label);
  const arch = readOptionalString(value, "arch", label);
  const pattern = readOptionalString(value, "pattern", label);

  if (!platform && !arch && !pattern) {
    throw new Error(`${label} must define at least one of platform, arch, or pattern.`);
  }

  const result: NonNullable<ManifestDependency["binary"]> = {};

  if (platform) result.platform = platform;
  if (arch) result.arch = arch;
  if (pattern) result.pattern = pattern;

  return result;
}

function readOptionalBoolean(record: Record<string, unknown>, key: string, label: string) {
  const value = record[key];

  if (value === undefined) return undefined;

  if (typeof value !== "boolean") {
    throw new Error(`${label}.${key} must be a boolean.`);
  }

  return value;
}

function readOptionalStringOrStringArray(
  record: Record<string, unknown>,
  key: string,
  label: string,
): string | string[] | undefined {
  const value = record[key];

  if (value === undefined) return undefined;

  if (typeof value === "string") {
    return readString(value, `${label}.${key}`);
  }

  if (!Array.isArray(value)) {
    throw new Error(`${label}.${key} must be a string or array of strings.`);
  }

  return value.map((entry, index) =>
    readString(entry, `${label}.${key}[${index}]`),
  );
}

function parseHooks(value: unknown, label: string): ManifestDependencyHooks | undefined {
  if (value === undefined) return undefined;

  const record = readObject(value, label);

  const unknownKey = Object.keys(record).find((key) => key !== "postinstall");

  if (unknownKey) {
    throw new Error(`${label} contains unknown hook "${unknownKey}". Supported hooks: postinstall`);
  }

  const postinstall = readOptionalStringOrStringArray(record, "postinstall", label);

  if (!postinstall) return undefined;

  return { postinstall };
}

function readPlatformWhitelist(
  record: Record<string, unknown>,
  key: string,
  label: string,
): PlatformName[] | undefined {
  const value = record[key];

  if (value === undefined) return undefined;

  if (!Array.isArray(value)) {
    throw new Error(`${label}.${key} must be an array of platform names.`);
  }

  return value.map((entry, index) => {
    const platformName = readString(entry, `${label}.${key}[${index}]`);

    if (!PLATFORM_NAMES.includes(platformName as PlatformName)) {
      throw new Error(
        `${label}.${key}[${index}] must be one of: ${PLATFORM_NAMES.join(", ")}.`,
      );
    }

    return platformName as PlatformName;
  });
}

function parsePlatforms(
  value: unknown,
  label: string,
): Partial<Record<PlatformName, ManifestDependencyPlatformOverride>> | undefined {
  if (value === undefined) return undefined;

  const record = readObject(value, label);

  const unknownPlatform = Object.keys(record).find(
    (key) => !PLATFORM_NAMES.includes(key as PlatformName),
  );

  if (unknownPlatform) {
    throw new Error(
      `${label} contains unknown platform "${unknownPlatform}". Supported platforms: ${PLATFORM_NAMES.join(", ")}`,
    );
  }

  const platforms: Partial<Record<PlatformName, ManifestDependencyPlatformOverride>> = {};

  for (const [platformName, platformValue] of Object.entries(record)) {
    const platformRecord = readObject(
      platformValue,
      `${label}.${platformName}`,
    );

    assertDependencyKeys(
      platformRecord,
      `${label}.${platformName}`,
    );

    platforms[platformName as PlatformName] = parseDependency(
      platformValue,
      `${label}.${platformName}`,
    ) as ManifestDependencyPlatformOverride;
  }

  if (!Object.keys(platforms).length) return undefined;

  return platforms;
}

function normalizeVersionPolicyValue(value: string, label: string) {
  if (!VERSION_POLICIES.has(value as VersionPolicy)) {
    throw new Error(
      `${label} must be one of: ${[...VERSION_POLICIES].join(", ")}.`,
    );
  }

  return value as VersionPolicy;
}

function readOptionalVersionPolicy(
  record: Record<string, unknown>,
  key: string,
  label: string,
) {
  const value = readOptionalString(record, key, label);

  if (value === undefined) {
    return undefined;
  }

  return normalizeVersionPolicyValue(value, `${label}.${key}`);
}

function readOptionalStringArray(
  record: Record<string, unknown>,
  key: string,
  label: string,
) {
  const value = record[key];

  if (value === undefined) return undefined;

  if (typeof value === "string") {
    return [readString(value, `${label}.${key}`)];
  }

  if (!Array.isArray(value)) {
    throw new Error(`${label}.${key} must be a string or array of strings.`);
  }

  return value.map((entry, index) =>
    readString(entry, `${label}.${key}[${index}]`),
  );
}

function normalizeRelativeArchivePath(value: string, label: string) {
  const normalized = value.trim().replace(/\\/g, "/").replace(/^\.\/+/, "")
    .replace(/\/+$/, "");

  if (!normalized) throw new Error(`${label} cannot be empty.`);

  if (path.posix.isAbsolute(normalized)) {
    throw new Error(`${label} must be a relative archive path.`);
  }

  const segments = normalized.split("/").filter(Boolean);

  if (!segments.length || segments.some((segment) => segment === "." || segment === "..")) {
    throw new Error(`${label} must stay inside the archive root.`);
  }

  return segments.join("/");
}

function normalizeProjectRelativePath(value: string, label: string) {
  const normalized = value.trim().replace(/\\/g, "/").replace(/^\.\/+/, "")
    .replace(/\/+$/, "");

  if (!normalized) throw new Error(`${label} cannot be empty.`);

  if (path.isAbsolute(normalized)) {
    throw new Error(`${label} must be a relative project path.`);
  }

  const segments = normalized.split("/").filter(Boolean);

  if (!segments.length || segments.some((segment) => segment === "." || segment === "..")) {
    throw new Error(`${label} must stay inside the current project.`);
  }

  return segments.join("/");
}

function normalizeComponentName(value: string, label: string) {
  const normalized = value.trim();

  if (!normalized) throw new Error(`${label} cannot be empty.`);

  if (normalized.includes("/") || normalized.includes("\\")) {
    throw new Error(`${label} must be a top-level entry name.`);
  }

  return normalized;
}

function normalizeOptionalStringArray(
  values: string[] | undefined,
  label: string,
  normalize: (value: string, label: string) => string,
) {
  if (!values) return undefined;

  return [...new Set(values.map((value, index) =>
    normalize(value, `${label}[${index}]`),
  ))];
}

function normalizeChecksum(value: string | undefined, label: string) {
  if (value === undefined) return undefined;

  const normalized = value.trim().toLowerCase().replace(/^sha256[:=-]/i, "");

  if (!/^[a-f0-9]{64}$/u.test(normalized)) {
    throw new Error(`${label} must be a SHA-256 hex digest.`);
  }

  return normalized;
}

function readInstallModifiers(
  record: InstallModifierFields,
  label: string,
) {
  return compact({
    includePath: normalizeOptionalStringArray(
      record.includePath,
      `${label}.includePath`,
      normalizeRelativeArchivePath,
    ),
    stripPrefix: record.stripPrefix === undefined
      ? undefined
      : normalizeRelativeArchivePath(record.stripPrefix, `${label}.stripPrefix`),
    patches: normalizeOptionalStringArray(
      record.patches,
      `${label}.patches`,
      normalizeProjectRelativePath,
    ),
    components: normalizeOptionalStringArray(
      record.components,
      `${label}.components`,
      normalizeComponentName,
    ),
    checksum: normalizeChecksum(record.checksum, `${label}.checksum`),
  });
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
    if (/^(?:www\.)?(?:github|gitee|gitlab|bitbucket)\.com\//i.test(source)) {
      return readSource(`https://${source}`, "source");
    }

    if (/^[^/\s]+\/[^/\s]+$/u.test(source)) {
      return readSource(`https://github.com/${source}`, "source");
    }

    throw new Error(
      "source must be a URL, github.com/owner/repo, gitee.com/owner/repo, gitlab.com/owner/repo, bitbucket.org/owner/repo, or owner/repo.",
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

function assertVersionSelection(
  selection: Pick<
    ManifestDependency,
    "branch" | "tag" | "versionPolicy" | "versionRange"
  >,
  label: string,
) {
  if (
    selection.tag &&
    selection.branch &&
    !selection.versionRange &&
    !selection.versionPolicy
  ) {
    throw new Error(`${label} cannot define both tag and branch.`);
  }

  const selected = [
    selection.tag,
    selection.branch,
    selection.versionRange,
    selection.versionPolicy,
  ].filter(Boolean);

  if (selected.length > 1) {
    throw new Error(
      `${label} can define only one of tag, branch, versionRange, or versionPolicy.`,
    );
  }
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
  const versionPolicy = readOptionalVersionPolicy(record, "versionPolicy", label);
  const versionRange = readOptionalString(record, "versionRange", label);

  assertVersionSelection({
    ...(branch ? { branch } : {}),
    ...(tag ? { tag } : {}),
    ...(versionPolicy ? { versionPolicy } : {}),
    ...(versionRange ? { versionRange } : {}),
  }, label);

  return compact({
    name: fallbackName ?? readOptionalString(record, "name", label),
    source: readSource(record.source, label),
    tag,
    branch,
    versionPolicy,
    versionRange,
    prerelease: readOptionalBoolean(record, "prerelease", label),
    fullProject: readOptionalBoolean(record, "fullProject", label),
    binary: parseBinary(record.binary, `${label}.binary`),
    ...readInstallModifiers(
      {
        checksum: readOptionalString(record, "checksum", label),
        components: readOptionalStringArray(record, "components", label),
        includePath: readOptionalStringArray(record, "includePath", label),
        patches: readOptionalStringArray(record, "patches", label),
        stripPrefix: readOptionalString(record, "stripPrefix", label),
      },
      label,
    ),
    platforms: parsePlatforms(record.platforms, `${label}.platforms`),
    platformWhitelist: readPlatformWhitelist(record, "platformWhitelist", label),
    hooks: parseHooks(record.hooks, `${label}.hooks`),
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
    versionPolicy: dependency.versionPolicy,
    versionRange: dependency.versionRange,
    prerelease: dependency.prerelease,
    fullProject: dependency.fullProject,
    includePath: dependency.includePath,
    stripPrefix: dependency.stripPrefix,
    patches: dependency.patches,
    components: dependency.components,
    checksum: dependency.checksum,
    binary: dependency.binary,
    platforms: dependency.platforms,
    platformWhitelist: dependency.platformWhitelist,
    hooks: dependency.hooks,
  });

  if (Object.keys(entry).length === 1) {
    return dependency.source;
  }

  return entry;
}

function assertAddOptions(options: AddManifestDependencyOptions) {
  if (
    options.tag &&
    options.branch &&
    !options.versionPolicy &&
    !options.versionRange
  ) {
    throw new Error("Options --tag and --branch cannot be used together.");
  }

  assertVersionSelection(options, "Options");

  if (options.versionPolicy) {
    normalizeVersionPolicyValue(options.versionPolicy, "Option --version-policy");
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
  const versionPolicy = options.versionPolicy
    ? normalizeVersionPolicyValue(options.versionPolicy, "Option --version-policy")
    : undefined;
  const versionRange = options.versionRange
    ? readString(options.versionRange, "Option --version-range")
    : undefined;
  const dependency = compact({
    name,
    source,
    tag: options.tag,
    branch: options.branch,
    versionPolicy,
    versionRange,
    prerelease: options.prerelease,
    fullProject: options.fullProject,
    binary: options.binary,
    ...readInstallModifiers(options, "dependency"),
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
      throw new ManifestError(`Cannot find ${MANIFEST_FILE_NAME}. Run "cppkg-cli init" first.`);
    }

    throw error;
  }

  const manifest = readObject(parsed, MANIFEST_FILE_NAME);

  if (!("dependencies" in manifest)) {
    throw new Error(`${MANIFEST_FILE_NAME} must define dependencies.`);
  }

  const allDependencies = parseDependencies(manifest.dependencies);
  const currentPlatform = getCurrentPlatform();

  const dependencies = allDependencies.filter((dependency) => {
    if (!dependency.platformWhitelist || !dependency.platformWhitelist.length) {
      return true;
    }

    return dependency.platformWhitelist.includes(currentPlatform);
  });

  return { dependencies };
}

export function getManifestDependencyOptions(
  dependency: ManifestDependency,
  cliOptions: Pick<GetPkgOptions, "cache" | "httpProxy" | "httpsProxy" | "offline" | "transitive"> = {},
): GetPkgOptions {
  const platform = getCurrentPlatform();
  const platformOverride = dependency.platforms?.[platform];

  const resolved: ManifestDependency = {
    ...dependency,
    ...platformOverride,
  };

  return compact({
    cache: cliOptions.cache,
    offline: cliOptions.offline,
    httpProxy: cliOptions.httpProxy || undefined,
    httpsProxy: cliOptions.httpsProxy || undefined,
    transitive: cliOptions.transitive,
    fullProject: resolved.fullProject,
    tag: resolved.tag,
    branch: resolved.branch,
    versionPolicy: resolved.versionPolicy,
    versionRange: resolved.versionRange,
    prerelease: resolved.prerelease,
    includePath: resolved.includePath,
    stripPrefix: resolved.stripPrefix,
    patches: resolved.patches,
    components: resolved.components,
    checksum: resolved.checksum,
    binary: resolved.binary,
    hooks: resolved.hooks,
  }) as GetPkgOptions;
}
