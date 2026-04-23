import type { GetPkgOptions } from "../../types/global";
import type { ArchiveDescriptor, PreparedArchive } from "./types";
import axios from "axios";
import { spawn } from "node:child_process";
import fs from "node:fs";
import { promises as fsp } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import unzipper from "unzipper";
import { getRequestProxy } from "../request";
import { collectIncludeDirs } from "./include";

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
    console.log("Remote host returned HTML for the archive request, retrying with curl");
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
      console.log(`Downloading: ${percent}%`);
    }
  });

  await pipeline(res.data, fs.createWriteStream(archivePath));
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

  console.log(
    archive.kind === "github-release" || archive.kind === "gitee-release"
      ? `Trying release archive ${archive.label}`
      : archive.kind === "github-repository" ||
          archive.kind === "gitee-repository"
        ? `Trying repository archive ${archive.label}`
        : `Trying archive URL ${archive.label}`,
  );

  await downloadArchive(archive.url, archivePath, options);
  console.log("Download complete, extracting archive");

  await extractZipArchive(archivePath, extractPath);
  const sourceRootPath = await getPrimaryExtractedRoot(extractPath);

  return {
    archive,
    includeDirs: await collectIncludeDirs(sourceRootPath),
    sourceRootPath,
  };
}
