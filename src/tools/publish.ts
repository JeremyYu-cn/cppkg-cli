import { promises as fsp } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import axios from "axios";
import { logger } from "./logger";
import { getGitHubToken } from "./request";
import { readPackageManifest } from "../public/manifest";

export type PublishOptions = {
  registry?: string;
  tag?: string;
  name?: string;
  dryRun?: boolean;
};

function execCommand(command: string, args: string[], cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (error) => {
      reject(new Error(`Failed to start ${command}: ${error.message}`));
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }

      reject(
        new Error(
          stderr.trim() || `${command} exited with code ${code}`,
        ),
      );
    });
  });
}

async function getGitHubRemote(): Promise<{ owner: string; repo: string } | null> {
  try {
    const url = await execCommand("git", ["remote", "get-url", "origin"]);
    const match = url.match(/github\.com[:/]([^/]+)\/([^/\s]+?)(?:\.git)?$/i);

    if (match) {
      return { owner: match[1]!, repo: match[2]! };
    }

    return null;
  } catch {
    return null;
  }
}

async function getLatestGitTag(): Promise<string | null> {
  try {
    return await execCommand("git", ["describe", "--tags", "--abbrev=0"]);
  } catch {
    return null;
  }
}

async function isGitRepo(): Promise<boolean> {
  try {
    await execCommand("git", ["rev-parse", "--git-dir"]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Publishes the current project as a package archive to GitHub releases.
 */
export async function publishPackage(options: PublishOptions = {}) {
  try {
    await readPackageManifest();
  } catch {
    throw new Error("No cppkg.json found. Run 'cppkg-cli init' first.");
  }

  if (!(await isGitRepo())) {
    throw new Error("The current directory is not a git repository.");
  }

  const remote = await getGitHubRemote();

  if (!remote) {
    throw new Error(
      "No GitHub remote found for this project. Ensure the 'origin' remote points to a GitHub repository.",
    );
  }

  const tag = options.tag || (await getLatestGitTag()) || "v0.0.0";
  const releaseName = options.name || tag;
  const projectDir = process.cwd();
  const projectName = path.basename(projectDir);
  const apiBase = options.registry || "https://api.github.com";
  const repoPath = `${remote.owner}/${remote.repo}`;

  if (options.dryRun) {
    logger.info("Dry run mode — no changes will be made:");
    logger.detail("Repository", repoPath);
    logger.detail("Release tag", tag);
    logger.detail("Release name", releaseName);
    logger.detail("Archive name", `${projectName}-${tag.replace(/^v/, "")}.zip`);
    logger.detail("Project dir", projectDir);
    logger.detail("API base", apiBase);
    logger.success("Dry run completed. Run without --dry-run to publish.");
    return { releaseUrl: "", tag, name: releaseName, dryRun: true };
  }

  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), "cppkg-publish-"));
  const archiveName = `${projectName}-${tag.replace(/^v/, "")}.zip`;
  const archivePath = path.join(tempDir, archiveName);

  logger.info("Creating package archive...");

  const excludes = [
    ".git",
    "node_modules",
    "cpp_libs",
    "vendor",
    ".DS_Store",
    "dist",
  ];

  try {
    const allEntries = await fsp.readdir(projectDir);
    const entriesToAdd = allEntries.filter(
      (entry) => !excludes.includes(entry),
    );
    const excludeArgs = excludes.flatMap((dir) => [
      "-x",
      `${dir}/*`,
      "-x",
      dir,
    ]);

    await execCommand("zip", [
      "-rq",
      archivePath,
      "--",
      ...entriesToAdd,
      ...excludeArgs,
    ], projectDir);
  } catch (error) {
    await fsp.rm(tempDir, { force: true, recursive: true });
    throw new Error(
      `Failed to create zip archive. Ensure 'zip' is installed. ${(error as Error).message}`,
    );
  }

  const archiveStat = await fsp.stat(archivePath);

  logger.info(
    `Archive created (${(archiveStat.size / 1024).toFixed(1)} KB)`,
  );

  const token = getGitHubToken();

  if (!token) {
    await fsp.rm(tempDir, { force: true, recursive: true });
    throw new Error(
      "GITHUB_TOKEN environment variable or githubToken config is required to publish.",
    );
  }

  logger.info(`Creating GitHub release for ${repoPath}...`);

  const createReleaseUrl = `${apiBase}/repos/${repoPath}/releases`;
  let releaseResponse: {
    data: { id: number; upload_url: string; html_url: string };
  };

  try {
    releaseResponse = await axios.post(
      createReleaseUrl,
      {
        tag_name: tag,
        name: releaseName,
        body: `Release ${releaseName}`,
        draft: false,
        prerelease: false,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error) {
    await fsp.rm(tempDir, { force: true, recursive: true });

    if (axios.isAxiosError(error) && error.response?.status === 422) {
      throw new Error(
        `Release for tag "${tag}" already exists. Use a different --tag or delete the existing release.`,
      );
    }

    throw new Error(
      `Failed to create GitHub release: ${(error as Error).message}`,
    );
  }

  logger.info("Uploading archive as release asset...");

  const uploadUrl = releaseResponse.data.upload_url.replace(
    /\{\?name,label\}$/,
    "",
  );
  const archiveData = await fsp.readFile(archivePath);

  try {
    await axios.post(
      `${uploadUrl}?name=${encodeURIComponent(archiveName)}`,
      archiveData,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/zip",
          "Content-Length": String(archiveStat.size),
        },
      },
    );
  } catch (error) {
    await fsp.rm(tempDir, { force: true, recursive: true });
    throw new Error(
      `Failed to upload release asset: ${(error as Error).message}`,
    );
  }

  await fsp.rm(tempDir, { force: true, recursive: true });

  const releaseUrl = releaseResponse.data.html_url;

  logger.success(`Published ${releaseName} to ${releaseUrl}`);

  return { releaseUrl, tag, name: releaseName };
}
