export type CommandOptionDoc = {
  flags: string;
  description: string;
  optional: boolean;
  required: boolean;
};

export type CommandDoc = {
  command: string;
  description: string;
  options: CommandOptionDoc[];
  subcommands: CommandDoc[];
};

function formatFlag(flags: CommandOptionDoc | string): string {
  const raw = typeof flags === "string" ? flags : flags.flags;
  const parts = raw.split(", ");
  const chosen = parts.find((p) => p.startsWith("--")) || parts[0] || "";
  return chosen.split(" ")[0]!.replace(/^--/, "").replace(/^-/, "");
}

function extractFlags(options: CommandOptionDoc[]): string[] {
  return options.map(formatFlag);
}

function collectCommands(tree: CommandDoc): string {
  return tree.subcommands
    .filter((s) => !s.command.startsWith("help"))
    .map((s) => s.command)
    .join(" ");
}

function generateBash(tree: CommandDoc): string {
  const cmds = collectCommands(tree);
  const lines: string[] = [
    "# cppkg-cli bash completion",
    "_cppkg_cli_completions() {",
    '  local cur="${COMP_WORDS[COMP_CWORD]}"',
    '  local prev="${COMP_WORDS[COMP_CWORD-1]}"',
    "  local commands=\"" + cmds + "\"",
    "",
    "  if [[ $COMP_CWORD -eq 1 ]]; then",
    '    COMPREPLY=($(compgen -W "$commands" -- "$cur"))',
    "  else",
    '    local cmd="${COMP_WORDS[1]}"',
    "    case $cmd in",
  ];

  for (const sub of tree.subcommands) {
    const opts = extractFlags(sub.options).join(" ");
    if (opts) {
      lines.push("      " + sub.command + ") COMPREPLY=($(compgen -W \"" + opts + "\" -- \"$cur\")) ;;");
    }
  }

  const globalOpts = extractFlags(tree.options).join(" ");
  lines.push("      *) COMPREPLY=($(compgen -W \"" + globalOpts + "\" -- \"$cur\")) ;;");

  lines.push("    esac", "  fi", "}", "complete -F _cppkg_cli_completions cppkg-cli");

  return lines.join("\n");
}

function generateZsh(tree: CommandDoc): string {
  const cmds = tree.subcommands
    .filter((s) => !s.command.startsWith("help"))
    .map((s) => {
      return "  \"" + s.command + ":" + s.description + "\"";
    })
    .join("\n");

  const globalOpts = extractFlags(tree.options).map((f) => "--" + f).join(" ");

  return [
    "#compdef cppkg-cli",
    "_cppkg_cli_completions() {",
    "  local -a commands",
    "  commands=(",
    cmds,
    "  )",
    "",
    "  _arguments \\",
    "    \"" + globalOpts + "\" \\",
    "    \"1: :{_describe 'command' commands}\" \\",
    "    \"*:: :->args\"",
    "}",
    '_cppkg_cli_completions "$@"',
  ].join("\n");
}

function generateFish(tree: CommandDoc): string {
  const lines: string[] = [
    "# cppkg-cli fish completion",
    "complete -c cppkg-cli -f",
  ];

  for (const opt of tree.options || []) {
    const parts = opt.flags.split(", ");
    const longs = parts.filter((p) => p.startsWith("--")).map((p) => p.split(" ")[0]!.replace("--", ""));
    const shorts = parts.filter((p) => p.startsWith("-") && !p.startsWith("--")).map((p) => p.replace("-", ""));
    for (const l of longs) {
      lines.push("complete -c cppkg-cli -l " + l + " -d \"" + opt.description + "\"");
    }
    for (const s of shorts) {
      lines.push("complete -c cppkg-cli -s " + s + " -d \"" + opt.description + "\"");
    }
  }

  for (const sub of tree.subcommands) {
    const name = sub.command;
    lines.push("complete -c cppkg-cli -f -n \"__fish_use_subcommand\" -a \"" + name + "\" -d \"" + sub.description + "\"");

    for (const opt of sub.options || []) {
      const parts = opt.flags.split(", ");
      const longs = parts.filter((p) => p.startsWith("--")).map((p) => p.split(" ")[0]!.replace("--", ""));
      const shorts = parts.filter((p) => p.startsWith("-") && !p.startsWith("--")).map((p) => p.replace("-", ""));
      for (const l of longs) {
        lines.push("complete -c cppkg-cli -n \"__fish_seen_subcommand_from " + name + "\" -l " + l + " -d \"" + opt.description + "\"");
      }
      for (const s of shorts) {
        lines.push("complete -c cppkg-cli -n \"__fish_seen_subcommand_from " + name + "\" -s " + s + " -d \"" + opt.description + "\"");
      }
    }
  }

  return lines.join("\n");
}

function generatePowerShell(tree: CommandDoc): string {
  const lines: string[] = [
    "# cppkg-cli PowerShell completion",
    "Register-ArgumentCompleter -Native -CommandName cppkg-cli -ScriptBlock {",
    "  param($wordToComplete, $commandAst, $cursorPosition)",
    '  $commands = @(',
  ];

  const cmdNames = tree.subcommands
    .filter((s) => !s.command.startsWith("help"))
    .map((s) => `    "${s.command}"`);
  lines.push(cmdNames.join("\n"));
  lines.push("  )");

  lines.push("", '  switch ($commandAst.CommandElements[1].Value) {');

  for (const sub of tree.subcommands) {
    const opts = extractFlags(sub.options).map((f) => `--${f}`);
    if (opts.length > 0) {
      lines.push(`    "${sub.command}" {`);
      lines.push(`      $opts = @(${opts.map((o) => `"${o}"`).join(", ")})`);
      lines.push('      return $opts | Where-Object { $_ -like "$wordToComplete*" }');
      lines.push("    }");
    }
  }

  lines.push('    default { return $commands | Where-Object { $_ -like "$wordToComplete*" } }');
  lines.push("  }");
  lines.push("}");

  return lines.join("\n");
}

export function generateCompletionScript(
  shell: "bash" | "zsh" | "fish" | "powershell",
  tree: CommandDoc,
): string {
  switch (shell) {
    case "bash": return generateBash(tree);
    case "zsh": return generateZsh(tree);
    case "fish": return generateFish(tree);
    case "powershell": return generatePowerShell(tree);
  }
}
