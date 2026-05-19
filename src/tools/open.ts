import { execSync } from "node:child_process";
import os from "node:os";

export function openUrl(url: string) {
  const platform = os.platform();
  let command: string;

  if (platform === "darwin") {
    command = `open "${url}"`;
  } else if (platform === "win32") {
    command = `start "" "${url}"`;
  } else {
    command = `xdg-open "${url}"`;
  }

  execSync(command, { timeout: 10000, stdio: "ignore" });
}
