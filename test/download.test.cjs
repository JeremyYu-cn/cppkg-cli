const test = require("node:test");
const assert = require("node:assert/strict");
const { Readable } = require("node:stream");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const originalCwd = process.cwd();

async function withTempCwd(callback) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cppkg-download-test-"));

  process.chdir(tempDir);

  try {
    await callback(tempDir);
  } finally {
    process.chdir(originalCwd);
    await fs.rm(tempDir, { force: true, recursive: true });
  }
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);

  for (let index = 0; index < table.length; index += 1) {
    let value = index;

    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }

    table[index] = value >>> 0;
  }

  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function writeDosDate(header, timeOffset, dateOffset) {
  header.writeUInt16LE(0, timeOffset);
  header.writeUInt16LE(((2026 - 1980) << 9) | (1 << 5) | 1, dateOffset);
}

function makeZip(entries) {
  const localRecords = [];
  const centralRecords = [];
  let offset = 0;

  for (const [rawName, rawContent] of Object.entries(entries)) {
    const name = rawName.replace(/\\/g, "/");
    const nameBuffer = Buffer.from(name, "utf8");
    const content = Buffer.isBuffer(rawContent)
      ? rawContent
      : Buffer.from(rawContent, "utf8");
    const checksum = crc32(content);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    writeDosDate(localHeader, 10, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(content.length, 18);
    localHeader.writeUInt32LE(content.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);

    const localRecord = Buffer.concat([localHeader, nameBuffer, content]);
    localRecords.push(localRecord);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    writeDosDate(centralHeader, 12, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(content.length, 20);
    centralHeader.writeUInt32LE(content.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralRecords.push(Buffer.concat([centralHeader, nameBuffer]));

    offset += localRecord.length;
  }

  const centralDirectory = Buffer.concat(centralRecords);
  const endOfCentralDirectory = Buffer.alloc(22);
  endOfCentralDirectory.writeUInt32LE(0x06054b50, 0);
  endOfCentralDirectory.writeUInt16LE(0, 4);
  endOfCentralDirectory.writeUInt16LE(0, 6);
  endOfCentralDirectory.writeUInt16LE(centralRecords.length, 8);
  endOfCentralDirectory.writeUInt16LE(centralRecords.length, 10);
  endOfCentralDirectory.writeUInt32LE(centralDirectory.length, 12);
  endOfCentralDirectory.writeUInt32LE(offset, 16);
  endOfCentralDirectory.writeUInt16LE(0, 20);

  return Buffer.concat([
    ...localRecords,
    centralDirectory,
    endOfCentralDirectory,
  ]);
}

function createMockAxios(routes) {
  const calls = [];
  const mockAxios = async (url, config = {}) => {
    calls.push({ config, url });

    const route = routes[url];

    if (!route) {
      throw new Error(`Unexpected axios request: ${url}`);
    }

    const value = typeof route === "function" ? route(url, config) : route;

    if (Buffer.isBuffer(value)) {
      return {
        data: Readable.from(value),
        headers: {
          "content-length": String(value.length),
          "content-type": "application/zip",
        },
      };
    }

    return {
      data: value,
      headers: {
        "content-type": "application/json",
      },
    };
  };

  mockAxios.calls = calls;
  return mockAxios;
}

function clearDistCache() {
  for (const cachePath of Object.keys(require.cache)) {
    if (cachePath.includes(`${path.sep}dist${path.sep}`)) {
      delete require.cache[cachePath];
    }
  }
}

async function withMockedAxios(routes, callback) {
  const axiosPath = require.resolve("axios");
  const previousAxios = require.cache[axiosPath];
  const mockAxios = createMockAxios(routes);

  clearDistCache();
  require.cache[axiosPath] = {
    children: [],
    exports: mockAxios,
    filename: axiosPath,
    id: axiosPath,
    loaded: true,
    paths: module.paths,
  };

  try {
    await callback(mockAxios);
  } finally {
    clearDistCache();

    if (previousAxios) {
      require.cache[axiosPath] = previousAxios;
    } else {
      delete require.cache[axiosPath];
    }
  }
}

function githubRelease(overrides = {}) {
  return {
    assets: [],
    draft: false,
    name: "v1.0.0",
    prerelease: false,
    published_at: "2026-04-27T00:00:00.000Z",
    tag_name: "v1.0.0",
    zipball_url: "https://api.github.com/repos/owner/headerlib/zipball/v1.0.0",
    ...overrides,
  };
}

test("getVCPkg installs GitHub release headers through mocked provider responses", async () => {
  await withTempCwd(async () => {
    const archiveURL = "https://downloads.example.test/headerlib-v1.zip";
    const archive = makeZip({
      "headerlib-1.0.0/README.md": "headerlib\n",
      "headerlib-1.0.0/include/headerlib/header.hpp": "#pragma once\n",
    });

    await withMockedAxios(
      {
        "https://api.github.com/repos/owner/headerlib": {
          default_branch: "main",
          full_name: "owner/headerlib",
          html_url: "https://github.com/owner/headerlib",
        },
        "https://api.github.com/repos/owner/headerlib/releases": [
          githubRelease({
            assets: [
              {
                browser_download_url: archiveURL,
                content_type: "application/zip",
                name: "headers.zip",
              },
            ],
          }),
        ],
        [archiveURL]: archive,
      },
      async (mockAxios) => {
        const { getVCPkg } = require("../dist/tools/download/main.js");
        const { readInstalledDependencies } = require("../dist/tools/deps.js");

        await getVCPkg("https://github.com/owner/headerlib");

        await fs.access("cpp_libs/include/headerlib/header.hpp");

        const installed = await readInstalledDependencies();
        assert.equal(installed.dependencies.length, 1);
        assert.equal(installed.dependencies[0].name, "headerlib");
        assert.equal(installed.dependencies[0].install.mode, "include");
        assert.equal(installed.dependencies[0].source.type, "github-release");
        assert.equal(installed.dependencies[0].source.archiveUrl, archiveURL);
        assert.deepEqual(installed.dependencies[0].install.headers, ["headerlib"]);
        assert.deepEqual(installed.dependencies[0].source.requested, {
          type: "latest-release",
          value: null,
        });
        assert.deepEqual(
          mockAxios.calls.map((call) => call.url),
          [
            "https://api.github.com/repos/owner/headerlib",
            "https://api.github.com/repos/owner/headerlib/releases",
            archiveURL,
          ],
        );
      },
    );
  });
});

test("getVCPkg installs Gitee repositories without releases as full projects", async () => {
  await withTempCwd(async () => {
    const archiveURL = "https://gitee.com/mirrors/projectlib/repository/archive/master.zip";
    const archive = makeZip({
      "projectlib-master/CMakeLists.txt": "cmake_minimum_required(VERSION 3.20)\n",
      "projectlib-master/src/project.cpp": "int project() { return 1; }\n",
    });

    await withMockedAxios(
      {
        "https://gitee.com/api/v5/repos/mirrors/projectlib": {
          default_branch: "master",
          full_name: "mirrors/projectlib",
          html_url: "https://gitee.com/mirrors/projectlib",
        },
        "https://gitee.com/api/v5/repos/mirrors/projectlib/releases": [],
        [archiveURL]: archive,
      },
      async () => {
        const { getVCPkg } = require("../dist/tools/download/main.js");
        const { readInstalledDependencies } = require("../dist/tools/deps.js");

        await getVCPkg("https://gitee.com/mirrors/projectlib");

        await fs.access("cpp_libs/projects/mirrors_projectlib/src/project.cpp");

        const installed = await readInstalledDependencies();
        assert.equal(installed.dependencies.length, 1);
        assert.equal(installed.dependencies[0].name, "projectlib");
        assert.equal(installed.dependencies[0].install.mode, "full-project");
        assert.equal(installed.dependencies[0].source.type, "gitee-repository");
        assert.equal(installed.dependencies[0].source.archiveUrl, archiveURL);
        assert.deepEqual(installed.dependencies[0].install.paths, [
          "CMakeLists.txt",
          "src",
        ]);
      },
    );
  });
});

test("getVCPkg installs direct remote zip URLs as full projects", async () => {
  await withTempCwd(async () => {
    const archiveURL = "https://example.com/downloads/vendor-sdk.zip";
    const archive = makeZip({
      "vendor-sdk/include/vendor/sdk.h": "#pragma once\n",
      "vendor-sdk/lib/vendor.cpp": "int vendor() { return 1; }\n",
    });

    await withMockedAxios(
      {
        [archiveURL]: archive,
      },
      async () => {
        const { getVCPkg } = require("../dist/tools/download/main.js");
        const { readInstalledDependencies } = require("../dist/tools/deps.js");

        await getVCPkg(archiveURL);

        await fs.access(
          "cpp_libs/projects/example.com_downloads_vendor-sdk/include/vendor/sdk.h",
        );

        const installed = await readInstalledDependencies();
        assert.equal(installed.dependencies.length, 1);
        assert.equal(installed.dependencies[0].name, "vendor-sdk");
        assert.equal(installed.dependencies[0].install.mode, "full-project");
        assert.equal(installed.dependencies[0].source.type, "archive-url");
        assert.deepEqual(installed.dependencies[0].source.requested, {
          type: "archive-url",
          value: archiveURL,
        });
      },
    );
  });
});

test("getVCPkg reuses cached direct archive downloads", async () => {
  await withTempCwd(async () => {
    const archiveURL = "https://example.com/downloads/cached-sdk.zip";
    const archive = makeZip({
      "cached-sdk/include/cached/sdk.h": "#pragma once\n",
    });

    await withMockedAxios(
      {
        [archiveURL]: archive,
      },
      async (mockAxios) => {
        const { getVCPkg } = require("../dist/tools/download/main.js");

        await getVCPkg(archiveURL);
        await getVCPkg(archiveURL);

        assert.equal(
          mockAxios.calls.filter((call) => call.url === archiveURL).length,
          1,
        );
        await fs.access(
          "cpp_libs/projects/example.com_downloads_cached-sdk/include/cached/sdk.h",
        );

        const cacheFiles = await fs.readdir("cpp_libs/cache");
        assert.equal(cacheFiles.length, 1);
        assert.match(cacheFiles[0], /^[0-9a-f]{16}-cached-sdk\.zip$/);
      },
    );
  });
});

test("getVCPkg honors custom archive cache directory config", async () => {
  await withTempCwd(async () => {
    const archiveURL = "https://example.com/downloads/custom-cache-sdk.zip";
    const archive = makeZip({
      "custom-cache-sdk/include/custom/sdk.h": "#pragma once\n",
    });

    await fs.writeFile(
      "cppkg.config.json",
      `${JSON.stringify({ cacheDirName: "archives" }, null, 2)}\n`,
      "utf8",
    );

    await withMockedAxios(
      {
        [archiveURL]: archive,
      },
      async () => {
        const { getVCPkg } = require("../dist/tools/download/main.js");

        await getVCPkg(archiveURL);

        const cacheFiles = await fs.readdir("cpp_libs/archives");
        assert.equal(cacheFiles.length, 1);
        assert.match(cacheFiles[0], /^[0-9a-f]{16}-custom-cache-sdk\.zip$/);
      },
    );
  });
});

test("getVCPkg bypasses archive cache when cache is disabled", async () => {
  await withTempCwd(async () => {
    const archiveURL = "https://example.com/downloads/no-cache-sdk.zip";
    const archive = makeZip({
      "no-cache-sdk/include/no_cache/sdk.h": "#pragma once\n",
    });

    await withMockedAxios(
      {
        [archiveURL]: archive,
      },
      async (mockAxios) => {
        const { getVCPkg } = require("../dist/tools/download/main.js");

        await getVCPkg(archiveURL, { cache: false });
        await getVCPkg(archiveURL, { cache: false });

        assert.equal(
          mockAxios.calls.filter((call) => call.url === archiveURL).length,
          2,
        );
        await assert.rejects(
          () => fs.access("cpp_libs/cache"),
          /ENOENT/,
        );
      },
    );
  });
});

test("update reuses a recorded branch and accepts Gitee selector variants", async () => {
  await withTempCwd(async () => {
    const archiveURL = "https://gitee.com/mirrors/branchlib/repository/archive/dev.zip";
    const archive = makeZip({
      "branchlib-dev/CMakeLists.txt": "cmake_minimum_required(VERSION 3.20)\n",
      "branchlib-dev/src/new.cpp": "int updated() { return 2; }\n",
    });

    await fs.mkdir("cpp_libs/projects/mirrors_branchlib", { recursive: true });
    await fs.writeFile("cpp_libs/projects/mirrors_branchlib/old.cpp", "int old;\n", "utf8");
    await fs.mkdir("cpp_libs", { recursive: true });
    await fs.writeFile(
      "cpp_libs/deps.json",
      `${JSON.stringify(
        {
          dependencies: [
            {
              name: "branchlib",
              version: "dev",
              installedAt: "2026-04-27T00:00:00.000Z",
              type: "need-compile",
              repository: {
                path: "/mirrors/branchlib",
                url: "https://gitee.com/mirrors/branchlib.git",
              },
              release: {
                tagName: null,
                name: null,
                publishedAt: null,
              },
              source: {
                type: "gitee-repository",
                archiveName: "dev.zip",
                archiveUrl: archiveURL,
                requested: {
                  type: "branch",
                  value: "dev",
                },
              },
              install: {
                mode: "full-project",
                target: "cpp_libs/projects/mirrors_branchlib",
                headers: ["old.cpp"],
                paths: ["old.cpp"],
              },
            },
          ],
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    await withMockedAxios(
      {
        "https://gitee.com/api/v5/repos/mirrors/branchlib": {
          default_branch: "master",
          full_name: "mirrors/branchlib",
          html_url: "https://gitee.com/mirrors/branchlib",
        },
        [archiveURL]: archive,
      },
      async (mockAxios) => {
        const { updateInstalledPackages } = require("../dist/tools/manage.js");
        const { readInstalledDependencies } = require("../dist/tools/deps.js");

        const result = await updateInstalledPackages("gitee.com/mirrors/branchlib");

        assert.deepEqual(
          result.updatedDependencies.map((dependency) => dependency.name),
          ["branchlib"],
        );
        await fs.access("cpp_libs/projects/mirrors_branchlib/src/new.cpp");
        await assert.rejects(
          () => fs.access("cpp_libs/projects/mirrors_branchlib/old.cpp"),
          /ENOENT/,
        );

        const installed = await readInstalledDependencies();
        assert.equal(installed.dependencies[0].source.requested.type, "branch");
        assert.equal(installed.dependencies[0].source.requested.value, "dev");
        assert.equal(installed.dependencies[0].source.archiveUrl, archiveURL);
        assert.deepEqual(
          mockAxios.calls.map((call) => call.url),
          [
            "https://gitee.com/api/v5/repos/mirrors/branchlib",
            archiveURL,
          ],
        );
      },
    );
  });
});
