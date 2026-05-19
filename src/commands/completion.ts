import { Command } from "commander";
import type { CommandDoc } from "../tools/completion";
import { generateCompletionScript } from "../tools/completion";

function collectCommandTree(program: Command): CommandDoc {
  const cmd: CommandDoc = {
    command: program.name(),
    description: program.description(),
    options: (program.options || []).map((opt) => ({
      flags: opt.flags,
      description: opt.description || "",
      optional: Boolean(opt.optional),
      required: Boolean(opt.required),
    })),
    subcommands: [],
  };

  for (const child of program.commands || []) {
    cmd.subcommands!.push(collectCommandTree(child as Command));
  }

  return cmd;
}

/**
 * Registers the command that outputs shell completion scripts.
 */
export function registerCompletionCommand(program: Command) {
  program
    .command("completion")
    .description("Generate shell completion scripts")
    .argument("<shell>", "Shell type: bash, zsh, fish, or powershell")
    .action((shell: string) => {
      const valid = new Set(["bash", "zsh", "fish", "powershell"]);
      if (!valid.has(shell)) {
        throw new Error(`Unsupported shell "${shell}". Use: bash, zsh, fish, or powershell.`);
      }

      const tree = collectCommandTree(program);
      const script = generateCompletionScript(shell as "bash" | "zsh" | "fish" | "powershell", tree);

      process.stdout.write(script + "\n");
    });
}
