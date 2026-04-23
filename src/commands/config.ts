import { Command } from "commander";

export function registerConfigCommand(program: Command) {
  const configProgram = program.command("config");
  configProgram.command("get");
  configProgram
    .command("set")
    .argument("<string>", "key")
    .argument("<string>", "value");

  configProgram.command("remove");
}
