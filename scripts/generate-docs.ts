import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import pc from "picocolors";
import { createProgram, getPackageVersion } from "../src/program";

type PackageJson = {
  name?: unknown;
};

type CommandLike = ReturnType<typeof createProgram>;

type CommandArgumentLike = {
  _name?: string;
  description?: string;
  name?: () => string;
  required?: boolean;
  variadic?: boolean;
};

type CommandOptionLike = {
  defaultValue?: unknown;
  description?: string;
  flags: string;
  optional?: boolean;
  required?: boolean;
  variadic?: boolean;
};

type CommandArgumentDoc = {
  description: string;
  name: string;
  required: boolean;
  variadic: boolean;
};

type CommandOptionDoc = {
  defaultValue?: string;
  description: string;
  flags: string;
  optional: boolean;
  required: boolean;
  variadic: boolean;
};

type CommandSummaryDoc = {
  aliases: string[];
  command: string;
  description: string;
  name: string;
  path: string;
};

type CommandDoc = CommandSummaryDoc & {
  arguments: CommandArgumentDoc[];
  children: CommandDoc[];
  examples: string[];
  options: CommandOptionDoc[];
  subcommands: CommandSummaryDoc[];
  usage: string;
};

const rootDir = path.resolve(__dirname, "..");

const examplesByCommand: Record<string, string[]> = {
  add: [
    "cppkg-cli add nlohmann/json",
    "cppkg-cli add fmtlib/fmt --name fmt --tag 11.2.0 --install",
    "cppkg-cli add nlohmann/json --dry-run",
  ],
  audit: [
    "cppkg-cli audit",
    "cppkg-cli audit --level high --fix",
  ],
  build: [
    "cppkg-cli build --release",
    "cppkg-cli build --toolchain clang-18 --docker --dry-run",
  ],
  cache: ["cppkg-cli cache list", "cppkg-cli cache clean --older-than 30"],
  "cache clean": [
    "cppkg-cli cache clean",
    "cppkg-cli cache clean --older-than 7",
  ],
  "cache list": ["cppkg-cli cache list"],
  cmake: ["cppkg-cli cmake", "cppkg-cli cmake --output cmake/cppkg.cmake --force"],
  compile: [
    "cppkg-cli compile src/main.cpp -o app",
    "cppkg-cli compile src/main.cpp --toolchain gcc-14 --docker --dry-run",
  ],
  compiler: [
    "cppkg-cli compiler list",
    "cppkg-cli compiler install clang-18 --set-default",
  ],
  "compiler add": [
    "cppkg-cli compiler add local-clang --host --compiler clang++ --set-default",
    "cppkg-cli compiler add gcc-docker --docker --docker-image gcc:14 --compiler g++",
  ],
  "compiler current": ["cppkg-cli compiler current"],
  "compiler install": [
    "cppkg-cli compiler install gcc-14",
    "cppkg-cli compiler install clang-18 --dry-run",
  ],
  "compiler list": ["cppkg-cli compiler list"],
  "compiler remove": ["cppkg-cli compiler remove local-clang"],
  "compiler use": ["cppkg-cli compiler use clang-18"],
  config: ["cppkg-cli config list", "cppkg-cli config set cacheDirName cache"],
  "config get": ["cppkg-cli config get packageRootDir"],
  "config list": ["cppkg-cli config list"],
  "config remove": ["cppkg-cli config remove cacheDirName"],
  "config set": ["cppkg-cli config set packageRootDir vendor/cpp_libs"],
  create: [
    "cppkg-cli create my-lib",
    "cppkg-cli create my-lib --header-only --c --output ./libs/my-lib",
  ],
  get: [
    "cppkg-cli get https://github.com/nlohmann/json",
    "cppkg-cli get https://github.com/fmtlib/fmt --version-range '^11.0.0'",
    "cppkg-cli get https://gitlab.com/libname/lib --binary linux/x64",
  ],
  import: [
    "cppkg-cli import vcpkg.json",
    "cppkg-cli import conanfile.txt --dry-run",
    "cppkg-cli import vcpkg.json --replace",
  ],
  init: ["cppkg-cli init", "cppkg-cli init --force", "cppkg-cli init --workspace"],
  inspect: ["cppkg-cli inspect", "cppkg-cli inspect --add --install"],
  install: [
    "cppkg-cli install",
    "cppkg-cli install json fmt --frozen-lockfile",
    "cppkg-cli install --workspace --no-transitive",
  ],
  integrate: [
    "cppkg-cli integrate",
    "cppkg-cli integrate --dry-run",
    "cppkg-cli integrate --target my-app",
  ],
  list: ["cppkg-cli list", "cppkg-cli list --tree"],
  publish: [
    "cppkg-cli publish",
    "cppkg-cli publish --tag v2.0.0 --name 'Version 2.0'",
  ],
  remove: ["cppkg-cli remove json", "cppkg-cli remove json --dry-run"],
  search: ["cppkg-cli search json", "cppkg-cli search http client --limit 20"],
  server: ["cppkg-cli server", "cppkg-cli server --host 0.0.0.0 --port 4936"],
  status: ["cppkg-cli status"],
  update: ["cppkg-cli update", "cppkg-cli update fmt --tag 11.2.0"],
  vendor: [
    "cppkg-cli vendor",
    "cppkg-cli vendor --output ./third_party --remove-originals",
  ],
  why: [
    "cppkg-cli why fmt",
    "cppkg-cli why nlohmann/json",
  ],
};

function getCommandSegments(command: CommandLike) {
  const segments: string[] = [];
  let current: CommandLike | undefined = command;

  if (!command.parent && command.name() !== "cppkg-cli") {
    return [command.name()];
  }

  while (current?.parent) {
    segments.unshift(current.name());
    current = current.parent as CommandLike | undefined;
  }

  return segments;
}

function getAliases(command: CommandLike) {
  return command.aliases();
}

function getDescription(command: CommandLike) {
  return command.description();
}

function getArguments(command: CommandLike): CommandArgumentDoc[] {
  const args = Array.isArray(command.registeredArguments)
    ? (command.registeredArguments as CommandArgumentLike[])
    : [];

  return args.map((argument) => {
    const name =
      typeof argument.name === "function"
        ? argument.name()
        : argument._name || "";

    return {
      description: argument.description || "",
      name,
      required: Boolean(argument.required),
      variadic: Boolean(argument.variadic),
    };
  });
}

function getDefaultValue(option: CommandOptionLike) {
  if (option.defaultValue === undefined) {
    return undefined;
  }

  if (Array.isArray(option.defaultValue)) {
    return option.defaultValue.join(", ");
  }

  return String(option.defaultValue);
}

function getOptions(command: CommandLike): CommandOptionDoc[] {
  const options = command.options as readonly CommandOptionLike[];

  return options.map((option) => {
    const entry: CommandOptionDoc = {
      description: option.description || "",
      flags: option.flags,
      optional: Boolean(option.optional),
      required: Boolean(option.required),
      variadic: Boolean(option.variadic),
    };
    const defaultValue = getDefaultValue(option);

    if (defaultValue !== undefined) {
      entry.defaultValue = defaultValue;
    }

    return entry;
  });
}

function getVisibleCommands(command: CommandLike) {
  return command.commands as CommandLike[];
}

function formatArgumentUsage(argument: CommandArgumentDoc) {
  const token = `${argument.name}${argument.variadic ? "..." : ""}`;

  return argument.required ? `<${token}>` : `[${token}]`;
}

function getUsage(
  command: CommandLike,
  segments: string[],
  args: CommandArgumentDoc[],
) {
  const tokens = ["cppkg-cli", ...segments];

  if (getOptions(command).length > 0) {
    tokens.push("[options]");
  }

  tokens.push(...args.map(formatArgumentUsage));

  if (getVisibleCommands(command).length > 0) {
    tokens.push("[command]");
  }

  return tokens.join(" ");
}

function getSubcommands(command: CommandLike): CommandSummaryDoc[] {
  return getVisibleCommands(command).map((subcommand) => {
    const segments = getCommandSegments(subcommand);
    const pathName = segments.join(" ");

    return {
      aliases: getAliases(subcommand),
      command: ["cppkg-cli", ...segments].join(" "),
      description: getDescription(subcommand),
      name: subcommand.name(),
      path: pathName,
    };
  });
}

function collectCommand(command: CommandLike): CommandDoc {
  const segments = getCommandSegments(command);
  const pathName = segments.join(" ");
  const args = getArguments(command);

  return {
    aliases: getAliases(command),
    arguments: args,
    children: getVisibleCommands(command).map(collectCommand),
    command: ["cppkg-cli", ...segments].join(" "),
    description: getDescription(command),
    examples: examplesByCommand[pathName] || [],
    name: command.name(),
    options: getOptions(command),
    path: pathName,
    subcommands: getSubcommands(command),
    usage: getUsage(command, segments, args),
  };
}

function escapeRoff(text: string) {
  return text.replace(/\\/g, "\\\\").replace(/'/g, "\\[cq]").replace(/"/g, "\\[dq]").replace(/-/g, "\\-");
}

function generateManPage(reference: Record<string, unknown>) {
  const ref = reference as {
    description?: string;
    name?: string;
    version?: string;
    root?: { usage?: string; options?: Array<{ flags: string; description: string }> };
    commands?: Array<{
      command?: string;
      description?: string;
      usage?: string;
      options?: Array<{ flags: string; description: string }>;
      arguments?: Array<{ name: string; description: string; required: boolean }>;
      examples?: string[];
    }>;
  };

  const lines: string[] = [
    `.TH CPPKG-CLI 1 "${new Date().toISOString().split("T")[0]}" "cppkg-cli ${ref.version || ""}" "User Commands"`,
    ".SH NAME",
    `cppkg-cli \\- ${escapeRoff(ref.description || "C/C++ package manager")}`,
    ".SH SYNOPSIS",
    `.B cppkg-cli`,
    `[${escapeRoff(ref.root?.usage || "options")}]`,
    ".SH DESCRIPTION",
    escapeRoff(ref.description || ""),
  ];

  if (ref.root?.options?.length) {
    lines.push(".SH OPTIONS");
    for (const opt of ref.root.options) {
      lines.push(`.TP`);
      lines.push(`.B ${escapeRoff(opt.flags)}`);
      lines.push(escapeRoff(opt.description));
    }
  }

  if (ref.commands?.length) {
    lines.push(".SH COMMANDS");
    for (const cmd of ref.commands) {
      lines.push(`.TP`);
      lines.push(`.B ${escapeRoff(cmd.command || "")}`);
      lines.push(escapeRoff(cmd.description || ""));

      if (cmd.arguments?.length) {
        lines.push(".RS");
        lines.push("Arguments:");
        for (const arg of cmd.arguments) {
          lines.push(`.TP`);
          lines.push(`.I ${escapeRoff(arg.name)}`);
          lines.push(`${arg.required ? "Required. " : ""}${escapeRoff(arg.description)}`);
        }
        lines.push(".RE");
      }

      if (cmd.options?.length) {
        lines.push(".RS");
        lines.push("Options:");
        for (const opt of cmd.options) {
          lines.push(`.TP`);
          lines.push(`.B ${escapeRoff(opt.flags)}`);
          lines.push(escapeRoff(opt.description));
        }
        lines.push(".RE");
      }

      if (cmd.examples?.length) {
        lines.push(".RS");
        lines.push("Examples:");
        for (const ex of cmd.examples) {
          lines.push(`.IP`);
          lines.push(`.B ${escapeRoff(ex)}`);
        }
        lines.push(".RE");
      }
    }
  }

  lines.push(".SH SEE ALSO");
  lines.push(`.BR cppkg.json (5),`);
  lines.push(`.BR cppkg-lock.json (5)`);
  lines.push("");
  return lines.join("\n");
}

export async function generateDocs() {
  const packageJson = JSON.parse(
    await readFile(path.join(rootDir, "package.json"), "utf8"),
  ) as PackageJson;
  const program = createProgram(getPackageVersion());
  const rootOptions = getOptions(program);

  const reference = {
    commands: getVisibleCommands(program).map(collectCommand),
    description: getDescription(program),
    name: program.name(),
    packageName:
      typeof packageJson.name === "string" ? packageJson.name : "cppkg-cli",
    root: {
      command: program.name(),
      description: getDescription(program),
      options: rootOptions,
      usage:
        rootOptions.length > 0
          ? `${program.name()} [options] [command]`
          : `${program.name()} [command]`,
    },
    version: getPackageVersion(),
  };

  const docsDir = path.join(rootDir, "docs");
  const docsAssetsDir = path.join(docsDir, "assets");

  await mkdir(docsAssetsDir, { recursive: true });
  await copyFile(
    path.join(rootDir, "assets", "icon.png"),
    path.join(docsAssetsDir, "icon.png"),
  );
  await writeFile(
    path.join(docsDir, "commands.json"),
    `${JSON.stringify(reference, null, 2)}\n`,
  );

  const manDir = path.join(rootDir, "man");
  await mkdir(manDir, { recursive: true });
  const manContent = generateManPage(reference);
  await writeFile(path.join(manDir, "cppkg-cli.1"), manContent);

  process.stdout.write(
    `${pc.green(pc.bold("[ok]"))} Generated docs/commands.json\n`,
  );
  process.stdout.write(
    `${pc.green(pc.bold("[ok]"))} Generated man/cppkg-cli.1\n`,
  );
}

if (require.main === module) {
  generateDocs().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${pc.red(pc.bold("[error]"))} ${message}\n`);
    process.exitCode = 1;
  });
}
