import type { GetPkgOptions } from "../../types/global";
import type { ArchiveDescriptor, PreparedArchive } from "./types";
import axios from "axios";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";
import { promises as fsp } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import unzipper from "unzipper";
import { getArchiveCachePath } from "../../public/packagePath";
import { logger } from "../logger";
import { getRequestProxy } from "../request";
import { collectIncludeDirs } from "./include";

type ArchiveFileResult = {
  cachePath?: string;
  fromCache: boolean;
};

function isArchiveCacheEnabled(options: GetPkgOptions) {
  return options.cache !== false;
}

function getCacheFileName(archive: ArchiveDescriptor) {
  const hash = crypto.createHash("sha256").update(archive.url).digest("hex")
    .slice(0, 16);
  const safeLabel = archive.label
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120) || "archive.zip";
  const normalizedLabel = safeLabel.endsWith(".zip")
    ? safeLabel
    : `${safeLabel}.zip`;

  return `${hash}-${normalizedLabel}`;
}

function getCacheFilePath(archive: ArchiveDescriptor) {
  return path.join(getArchiveCachePath(), getCacheFileName(archive));
}

async function hasUsableCacheFile(cachePath: string) {
  try {
    const stat = await fsp.stat(cachePath);

    return stat.isFile() && stat.size > 0;
  } catch (error: unknown) {
    const nodeError = error as NodeJS.ErrnoException;

    if (nodeError.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

async function getFileSha256(filePath: string) {
  const hash = crypto.createHash("sha256");
  const stream = fs.createReadStream(filePath);

  for await (const chunk of stream) {
    hash.update(chunk);
  }

  return hash.digest("hex");
}

/**
 * Downloads an archive with curl as a compatibility fallback for hosts that serve HTML to axios.
 */
async function downloadArchiveWithCurl(url: string, archivePath: string) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("curl", ["-L", "--fail", "--output", archivePath, url], {
      stdio: ["ignore", "ignore", "pipe"],
    });

    let stderr = "";

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (error) => {
      reject(new Error(`Failed to start curl: ${error.message}`));
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `curl failed with code ${code}${stderr.trim() ? `: ${stderr.trim()}` : ""}`,
        ),
      );
    });
  });
}

/**
 * Streams an archive to a temporary file while printing coarse progress.
 */
async function downloadArchive(
  url: string,
  archivePath: string,
  options: GetPkgOptions = {},
) {
  const res = await axios<NodeJS.ReadableStream>(url, {
    method: "GET",
    headers: {
      "User-Agent": "cppkg-cli",
    },
    responseType: "stream",
    ...getRequestProxy(options.httpProxy, options.httpsProxy),
  });

  const contentType = String(res.headers["content-type"] ?? "").toLowerCase();

  if (contentType.includes("text/html")) {
    (res.data as NodeJS.ReadableStream & { destroy?: () => void }).destroy?.();
    logger.warn("Remote host returned HTML for the archive request, retrying with curl");
    await downloadArchiveWithCurl(url, archivePath);
    return;
  }

  const total = Number(res.headers["content-length"] ?? 0);
  let loaded = 0;
  let lastLoggedPercent = -10;

  res.data.on("data", (chunk: Buffer) => {
    loaded += chunk.length;

    if (!total) {
      return;
    }

    const percent = Math.floor((loaded / total) * 100);

    if (percent >= lastLoggedPercent + 10 || percent === 100) {
      lastLoggedPercent = percent;
      logger.progress(`Downloading: ${percent}%`);
    }
  });

  await pipeline(res.data, fs.createWriteStream(archivePath));
}

async function prepareArchiveFile(
  archive: ArchiveDescriptor,
  archivePath: string,
  options: GetPkgOptions,
  forceRefresh = false,
): Promise<ArchiveFileResult> {
  if (!isArchiveCacheEnabled(options)) {
    await downloadArchive(archive.url, archivePath, options);
    return { fromCache: false };
  }

  const cachePath = getCacheFilePath(archive);

  if (!forceRefresh && await hasUsableCacheFile(cachePath)) {
    logger.info(
      `Using cached archive ${path.relative(process.cwd(), cachePath)}`,
    );
    await fsp.copyFile(cachePath, archivePath);
    return { cachePath, fromCache: true };
  }

  await downloadArchive(archive.url, archivePath, options);
  await fsp.mkdir(path.dirname(cachePath), { recursive: true });
  await fsp.copyFile(archivePath, cachePath);
  logger.detail("Cached archive", path.relative(process.cwd(), cachePath));

  return { cachePath, fromCache: false };
}

/**
 * Extracts a zip archive into a temporary working directory.
 */
async function extractZipArchive(archivePath: string, extractPath: string) {
  await fsp.mkdir(extractPath, { recursive: true });
  const directory = await unzipper.Open.file(archivePath);
  await directory.extract({ concurrency: 5, path: extractPath });
}

/**
 * Finds the main extracted source root, flattening zip wrapper directories.
 */
async function getPrimaryExtractedRoot(extractPath: string) {
  const entries = await fsp.readdir(extractPath, { withFileTypes: true });
  const visibleEntries = entries.filter((entry) => entry.name !== "__MACOSX");

  if (visibleEntries.length === 1 && visibleEntries[0]!.isDirectory()) {
    return path.join(extractPath, visibleEntries[0]!.name);
  }

  return extractPath;
}

/**
 * Downloads and extracts one candidate archive, then scans it for usable include directories.
 */
export async function prepareArchive(
  tempDir: string,
  packageName: string,
  archive: ArchiveDescriptor,
  slot: string,
  options: GetPkgOptions = {},
): Promise<PreparedArchive> {
  const archivePath = path.join(tempDir, `${packageName}-${slot}.zip`);
  const extractPath = path.join(tempDir, `extract-${slot}`);

  await fsp.rm(archivePath, { force: true });
  await fsp.rm(extractPath, { force: true, recursive: true });

  logger.info(
    archive.kind === "github-release" || archive.kind === "gitee-release"
      ? `Trying release archive ${archive.label}`
      : archive.kind === "github-repository" ||
          archive.kind === "gitee-repository"
        ? `Trying repository archive ${archive.label}`
        : `Trying archive URL ${archive.label}`,
  );

  let archiveFile = await prepareArchiveFile(archive, archivePath, options);
  logger.progress("Archive ready, extracting archive");

  try {
    await extractZipArchive(archivePath, extractPath);
  } catch (error) {
    if (!archiveFile.fromCache || !archiveFile.cachePath) {
      throw error;
    }

    logger.warn(
      `Cached archive ${path.relative(process.cwd(), archiveFile.cachePath)} could not be extracted, refreshing it`,
    );
    await fsp.rm(archiveFile.cachePath, { force: true });
    await fsp.rm(archivePath, { force: true });
    await fsp.rm(extractPath, { force: true, recursive: true });
    archiveFile = await prepareArchiveFile(archive, archivePath, options, true);
    await extractZipArchive(archivePath, extractPath);
  }

  const sourceRootPath = await getPrimaryExtractedRoot(extractPath);

  return {
    archive,
    includeDirs: await collectIncludeDirs(sourceRootPath),
    integrity: {
      sha256: await getFileSha256(archivePath),
    },
    sourceRootPath,
  };
}
