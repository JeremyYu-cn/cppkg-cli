import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import {
  createPackageManifest,
  MANIFEST_FILE_NAME,
} from "../public/manifest";
import { resolvePackageRootPath } from "../public/packagePath";
import { logger } from "../tools/logger";
import { createWorkspaceConfig, WORKSPACE_FILE_NAME } from "../tools/workspace";

type InitOptions = {
  force?: boolean;
  noGitignore?: boolean;
  workspace?: boolean;
  template?: string;
};

const TEMPLATES: Record<string, { description: string; files: Record<string, string> }> = {
  "cmake-header-only": {
    description: "Header-only C++ library with CMakeLists.txt",
    files: {
      "CMakeLists.txt": `cmake_minimum_required(VERSION 3.14)
project(my-library VERSION 0.1.0 LANGUAGES CXX)

add_library(my-library INTERFACE)
target_include_directories(my-library INTERFACE include)

include(cmake/cppkg.cmake)
cppkg_target(my-library)
`,
      "include/my-library/my-library.hpp": `#pragma once

namespace my_library {

int version() {
  return 1;
}

} // namespace my_library
`,
    },
  },
  "cmake-executable": {
    description: "C++ executable project with CMakeLists.txt",
    files: {
      "CMakeLists.txt": `cmake_minimum_required(VERSION 3.14)
project(my-app VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_executable(my-app src/main.cpp)

include(cmake/cppkg.cmake)
cppkg_target(my-app)
`,
      "src/main.cpp": `#include <iostream>

int main() {
  std::cout << "Hello from cppkg project!" << std::endl;
  return 0;
}
`,
    },
  },
  "cmake-library": {
    description: "Compiled C++ library project with CMakeLists.txt",
    files: {
      "CMakeLists.txt": `cmake_minimum_required(VERSION 3.14)
project(my-library VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_library(my-library src/my-library.cpp)
target_include_directories(my-library PUBLIC include)

include(cmake/cppkg.cmake)
cppkg_target(my-library)
`,
      "include/my-library/my-library.hpp": `#pragma once

namespace my_library {

int version();

} // namespace my_library
`,
      "src/my-library.cpp": `#include "my-library/my-library.hpp"

namespace my_library {

int version() {
  return 1;
}

} // namespace my_library
`,
    },
  },
};

function scaffoldTemplate(templateName: keyof typeof TEMPLATES) {
  const tpl = TEMPLATES[templateName]!;

  for (const [filePath, content] of Object.entries(tpl.files)) {
    const fullPath = path.resolve(process.cwd(), filePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, "utf8");
  }

  logger.success(`Scaffolded ${templateName} template (${Object.keys(tpl.files).length} files).`);
}

/**
 * Registers the command that creates a project package manifest.
 */
export function registerInitCommand(program: Command) {
  program
    .command("init")
    .description(`Create a ${MANIFEST_FILE_NAME} package manifest`)
    .option("-f, --force", `Overwrite an existing ${MANIFEST_FILE_NAME}`)
    .option("--no-gitignore", "Skip .gitignore creation or modification")
    .option(
      "--workspace",
      `Create a ${WORKSPACE_FILE_NAME} workspace configuration`,
    )
    .option(
      "--template <type>",
      `Scaffold a project template: ${Object.keys(TEMPLATES).join(", ")}`,
    )
    .action((options: InitOptions) => {
      if (options.template && !TEMPLATES[options.template]) {
        logger.error(`Unknown template "${options.template}". Available: ${Object.keys(TEMPLATES).join(", ")}`);
        process.exitCode = 1;
        return;
      }

      const result = createPackageManifest({
        force: Boolean(options.force),
      });
      const manifestPath =
        path.relative(process.cwd(), result.manifestFilePath) ||
        MANIFEST_FILE_NAME;

      logger.success(`Created ${manifestPath}.`);

      if (options.template) {
        scaffoldTemplate(options.template as keyof typeof TEMPLATES);
      }

      logger.detail(
        "Next",
        `Add dependencies, then run cppkg-cli install`,
      );

      if (options.workspace) {
        try {
          const workspaceResult = createWorkspaceConfig([]);
          const workspacePath =
            path.relative(process.cwd(), workspaceResult.configPath) ||
            WORKSPACE_FILE_NAME;

          logger.success(`Created ${workspacePath}.`);
          logger.detail(
            "Workspace",
            `Add member directories to the "packages" array in ${WORKSPACE_FILE_NAME}`,
          );
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);

          if (message.includes("already exists")) {
            logger.warn(`${WORKSPACE_FILE_NAME} already exists.`);
          } else {
            throw error;
          }
        }
      }

      if (options.noGitignore) {
        return;
      }

      const gitignorePath = path.join(process.cwd(), ".gitignore");
      const packageRootPath = resolvePackageRootPath();
      const packageRootRelative = path.relative(process.cwd(), packageRootPath).replace(/\\/g, "/").replace(/\/+$/, "");
      const gitignoreEntry = `\n# cppkg packages\n${packageRootRelative}/\n`;
      const workspaceGitignoreEntry = `\n# cppkg workspace lock\n${path.basename(process.cwd())}.workspace-lock.json\n`;

      if (fs.existsSync(gitignorePath)) {
        const existing = fs.readFileSync(gitignorePath, "utf8");

        if (!existing.includes(`${packageRootRelative}/`)) {
          if (!existing.endsWith("\n")) {
            fs.appendFileSync(gitignorePath, `\n${gitignoreEntry}`);
          } else {
            fs.appendFileSync(gitignorePath, gitignoreEntry);
          }
          logger.success(`Added ${packageRootRelative}/ to .gitignore`);
        }
      } else {
        fs.writeFileSync(gitignorePath, `# cppkg packages\n${packageRootRelative}/\n`, "utf8");
        logger.success(`Created .gitignore with ${packageRootRelative}/`);
      }
    });
}
