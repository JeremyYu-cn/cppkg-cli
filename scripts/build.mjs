import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import { createRequire } from "node:module";
import pc from "picocolors";

const require = createRequire(import.meta.url);
const tscBinPath = require.resolve("typescript/bin/tsc");

/**
 * Cleans the build output directory and runs the TypeScript compiler.
 */
async function runBuild() {
  await rm(new URL("../dist", import.meta.url), {
    force: true,
    recursive: true,
  });

  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [tscBinPath], {
      stdio: "inherit",
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve(undefined);
        return;
      }

      reject(new Error(`tsc exited with code ${code}`));
    });

    child.on("error", reject);
  });
}

runBuild().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${pc.red(pc.bold("[error]"))} ${message}\n`);
  process.exitCode = 1;
});
