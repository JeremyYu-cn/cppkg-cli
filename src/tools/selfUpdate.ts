import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import semver from "semver";

export type SelfUpdateResult = {
  currentVersion: string;
  latestVersion: string | null;
  outdated: boolean;
  error?: string;
};

function readPackageVersion(): string {
  try {
    const pkgPath = path.resolve(__dirname, "../../package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as { version?: string };
    return pkg.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export async function checkSelfUpdate(): Promise<SelfUpdateResult> {
  const currentVersion = readPackageVersion();

  try {
    const npmView = execSync(
      "npm view cppkg-cli version 2>/dev/null",
      { encoding: "utf8", timeout: 10000 },
    ).toString().trim();

    const latestVersion = npmView || null;

    if (!latestVersion) {
      return { currentVersion, latestVersion: null, outdated: false, error: "Could not fetch latest version" };
    }

    const outdated = semver.gt(latestVersion, currentVersion);

    return { currentVersion, latestVersion, outdated };
  } catch (error: unknown) {
    return {
      currentVersion,
      latestVersion: null,
      outdated: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
