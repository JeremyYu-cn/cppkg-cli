import fs from "node:fs";
import path from "node:path";

export const CONFIG_FILE_NAME = "cppkg.config.json";

export const CONFIG_KEYS = [
  "proxy",
  "httpProxy",
  "httpsProxy",
  "packageRootDir",
  "includeDirName",
  "projectsDirName",
  "cacheDirName",
  "depsFileName",
] as const;

export type ConfigKey = (typeof CONFIG_KEYS)[number];

export type CliConfig = {
  [key in ConfigKey]: string;
};

export type ConfigEntry = {
  key: ConfigKey;
  source: "default" | "user";
  value: string;
};

const DEFAULT_CLI_CONFIG: CliConfig = {
  proxy: "",
  httpProxy: "",
  httpsProxy: "",
  packageRootDir: "cpp_libs",
  includeDirName: "include",
  projectsDirName: "projects",
  cacheDirName: "cache",
  depsFileName: "deps.json",
};

const RELATIVE_PATH_KEYS = new Set<ConfigKey>([
  "packageRootDir",
  "includeDirName",
  "projectsDirName",
  "cacheDirName",
  "depsFileName",
]);

function isConfigKey(value: string): value is ConfigKey {
  return CONFIG_KEYS.includes(value as ConfigKey);
}

function ensureConfigKey(key: string): ConfigKey {
  if (!isConfigKey(key)) {
    throw new Error(
      `Unknown config key "${key}". Supported keys: ${CONFIG_KEYS.join(", ")}`,
    );
  }

  return key;
}

function normalizeRelativePathValue(key: ConfigKey, value: string) {
  const normalized = value.trim().replace(/\\/g, "/").replace(/^\.\/+/, "")
    .replace(/\/+$/, "");

  if (!normalized) {
    throw new Error(`Config key "${key}" cannot be empty.`);
  }

  if (path.isAbsolute(normalized)) {
    throw new Error(`Config key "${key}" must be a relative path.`);
  }

  const segments = normalized.split("/").filter(Boolean);

  if (!segments.length || segments.some((segment) => segment === "." || segment === "..")) {
    throw new Error(
      `Config key "${key}" must stay inside the current project directory.`,
    );
  }

  return segments.join("/");
}

function normalizeConfigValue(key: ConfigKey, value: string) {
  if (RELATIVE_PATH_KEYS.has(key)) {
    return normalizeRelativePathValue(key, value);
  }

  const normalized = value.trim();

  if (!normalized) {
    throw new Error(`Config key "${key}" cannot be empty.`);
  }

  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readUserConfig(): Partial<CliConfig> {
  const configFilePath = getConfigFilePath();

  if (!fs.existsSync(configFilePath)) {
    return {};
  }

  const content = fs.readFileSync(configFilePath, "utf8").trim();

  if (!content) {
    return {};
  }

  const parsed = JSON.parse(content) as unknown;

  if (!isRecord(parsed)) {
    throw new Error(`${CONFIG_FILE_NAME} must contain a JSON object.`);
  }

  const config: Partial<CliConfig> = {};

  for (const [rawKey, rawValue] of Object.entries(parsed)) {
    const key = ensureConfigKey(rawKey);

    if (typeof rawValue !== "string") {
      throw new Error(`Config key "${key}" must be a string value.`);
    }

    config[key] = normalizeConfigValue(key, rawValue);
  }

  return config;
}

function writeUserConfig(config: Partial<CliConfig>) {
  const configFilePath = getConfigFilePath();
  const sortedConfig = Object.fromEntries(
    CONFIG_KEYS.filter((key) => key in config).map((key) => [key, config[key]!]),
  );

  if (!Object.keys(sortedConfig).length) {
    fs.rmSync(configFilePath, { force: true });
    return;
  }

  fs.writeFileSync(
    configFilePath,
    `${JSON.stringify(sortedConfig, null, 2)}\n`,
    "utf8",
  );
}

export function getConfigFilePath() {
  return path.resolve(process.cwd(), CONFIG_FILE_NAME);
}

export function getDefaultConfig() {
  return { ...DEFAULT_CLI_CONFIG };
}

export function resolveCliConfig(): CliConfig {
  return {
    ...DEFAULT_CLI_CONFIG,
    ...readUserConfig(),
  };
}

export function getConfigValue(key: string) {
  const resolvedKey = ensureConfigKey(key);
  return resolveCliConfig()[resolvedKey];
}

export function listConfigEntries(): ConfigEntry[] {
  const userConfig = readUserConfig();
  const resolvedConfig = resolveCliConfig();

  return CONFIG_KEYS.map((key) => ({
    key,
    source: key in userConfig ? "user" : "default",
    value: resolvedConfig[key],
  }));
}

export function setConfigValue(key: string, value: string) {
  const resolvedKey = ensureConfigKey(key);
  const userConfig = readUserConfig();

  userConfig[resolvedKey] = normalizeConfigValue(resolvedKey, value);
  writeUserConfig(userConfig);

  return {
    key: resolvedKey,
    value: userConfig[resolvedKey]!,
  };
}

export function removeConfigValue(key: string) {
  const resolvedKey = ensureConfigKey(key);
  const userConfig = readUserConfig();
  const hadValue = resolvedKey in userConfig;

  if (hadValue) {
    delete userConfig[resolvedKey];
    writeUserConfig(userConfig);
  }

  return {
    hadValue,
    key: resolvedKey,
    value: DEFAULT_CLI_CONFIG[resolvedKey],
  };
}

export function getDefaultInstallTarget() {
  return [
    DEFAULT_CLI_CONFIG.packageRootDir,
    DEFAULT_CLI_CONFIG.includeDirName,
  ].join("/");
}
