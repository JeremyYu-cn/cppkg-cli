import { Command, InvalidArgumentError } from "commander";
import { renderDependencyGraph, getDependencyTree } from "../tools/graph";
import { logger } from "../tools/logger";

type GraphOptions = {
  format?: "ascii" | "dot" | "mermaid";
  depth?: number;
  json?: boolean;
};

function parsePositiveInteger(value: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new InvalidArgumentError("Expected a positive integer.");
  }
  return parsed;
}

export function registerGraphCommand(program: Command) {
  program
    .command("graph")
    .description("Visualize dependency graph as ASCII tree, DOT, or Mermaid")
    .option(
      "--format <format>",
      "Output format: ascii, dot, or mermaid",
      "ascii",
    )
    .option(
      "--depth <number>",
      "Limit dependency graph depth (requires a positive integer)",
      parsePositiveInteger,
    )
    .option("--json", "Output dependency tree as JSON")
    .action(async (options: GraphOptions) => {
      if (options.json) {
        const tree = await getDependencyTree(options.depth);
        logger.raw(JSON.stringify(tree, null, 2));
        return;
      }
      const output = await renderDependencyGraph(options.format, options.depth);
      logger.raw(output);
    });
}
