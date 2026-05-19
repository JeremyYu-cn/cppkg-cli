import { Command, InvalidArgumentError } from "commander";
import { stdin, stdout } from "node:process";
import { emitKeypressEvents } from "node:readline";
import type { GetPkgOptions } from "../types/global";
import { getVCPkg } from "../tools/download/main";
import { logger } from "../tools/logger";
import {
  formatStarCount,
  formatSearchResults,
  normalizeSearchLimit,
  type PackageSearchResult,
  searchGitHubPackages,
} from "../tools/search";

type SearchOptions = Pick<
  GetPkgOptions,
  "cache" | "fullProject" | "httpProxy" | "httpsProxy"
> & {
  interactive?: boolean;
  install?: boolean;
  json?: boolean;
  language?: string;
  limit: number;
  select?: number;
};

type RawModeInput = typeof stdin & {
  isRaw?: boolean;
  setRawMode?: (mode: boolean) => typeof stdin;
};

const CLEAR_BELOW = "\x1B[J";
const HIDE_CURSOR = "\x1B[?25l";
const SHOW_CURSOR = "\x1B[?25h";

function parsePositiveInteger(value: string) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new InvalidArgumentError("Expected a positive integer.");
  }

  return parsed;
}

function getResultBySelection(results: PackageSearchResult[], selection: number) {
  const result = results[selection - 1];

  if (!result) {
    throw new Error(
      `Package selection ${selection} is out of range. Choose 1-${results.length}.`,
    );
  }

  return result;
}

function truncate(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

function formatSelectableSearchResult(
  result: PackageSearchResult,
  index: number,
  selectedIndex: number,
  maxLength: number,
) {
  const marker = index === selectedIndex ? "> " : "  ";
  const name = result.repositoryPath.replace(/^\/+/, "");
  const details = [
    formatStarCount(result.stars),
    result.language || "unknown",
  ].join(" | ");
  const description = result.description ? ` | ${result.description}` : "";

  return truncate(
    `${marker}${index + 1}. ${name} | ${details}${description}`,
    maxLength,
  );
}

function renderSelector(
  results: PackageSearchResult[],
  selectedIndex: number,
  previousLineCount: number,
) {
  if (previousLineCount > 0) {
    stdout.write(`\x1B[${previousLineCount}A${CLEAR_BELOW}`);
  }

  const maxLineLength = Math.max(48, (stdout.columns || 100) - 1);
  const lines = [
    "Use Up/Down to choose, Enter to install, q or Esc to cancel.",
    ...results.map((result, index) =>
      formatSelectableSearchResult(result, index, selectedIndex, maxLineLength),
    ),
  ];

  stdout.write(`${lines.join("\n")}\n`);

  return lines.length;
}

async function promptForSearchResult(results: PackageSearchResult[]) {
  if (!stdin.isTTY || !stdout.isTTY) {
    throw new Error(
      "Cannot prompt for a package selection because stdin is not interactive. Use --select <number>.",
    );
  }

  const input = stdin as RawModeInput;

  if (!input.setRawMode) {
    throw new Error(
      "Cannot prompt for a package selection because raw terminal input is unavailable. Use --select <number>.",
    );
  }

  emitKeypressEvents(input);

  return new Promise<PackageSearchResult | null>((resolve) => {
    let selectedIndex = 0;
    let renderedLineCount = 0;
    const wasRaw = Boolean(input.isRaw);
    const wasPaused = input.isPaused();

    function cleanup() {
      input.off("keypress", onKeypress);
      input.setRawMode?.(wasRaw);
      if (wasPaused) {
        input.pause();
      }
      stdout.write(SHOW_CURSOR);
    }

    function finish(result: PackageSearchResult | null) {
      cleanup();
      resolve(result);
    }

    function rerender() {
      renderedLineCount = renderSelector(
        results,
        selectedIndex,
        renderedLineCount,
      );
    }

    function onKeypress(_: string, key: { ctrl?: boolean; name?: string }) {
      if (key.ctrl && key.name === "c") {
        finish(null);
        return;
      }

      if (key.name === "escape" || key.name === "q") {
        finish(null);
        return;
      }

      if (key.name === "return" || key.name === "enter") {
        finish(results[selectedIndex] ?? null);
        return;
      }

      if (key.name === "up") {
        selectedIndex =
          selectedIndex === 0 ? results.length - 1 : selectedIndex - 1;
        rerender();
        return;
      }

      if (key.name === "down") {
        selectedIndex =
          selectedIndex === results.length - 1 ? 0 : selectedIndex + 1;
        rerender();
      }
    }

    stdout.write(HIDE_CURSOR);
    input.setRawMode(true);
    input.resume();
    input.on("keypress", onKeypress);
    rerender();
  });
}

async function resolveSelectedSearchResult(
  results: PackageSearchResult[],
  options: SearchOptions,
) {
  if (options.select !== undefined) {
    return getResultBySelection(results, options.select);
  }

  return promptForSearchResult(results);
}

function shouldSelectSearchResult(options: SearchOptions) {
  if (options.select !== undefined) {
    return true;
  }

  if (options.interactive === false) {
    return false;
  }

  return Boolean(stdin.isTTY && stdout.isTTY);
}

/**
 * Registers the command that searches public C/C++ package repositories.
 */
export function registerSearchCommand(program: Command) {
  program
    .command("search")
    .description("Search GitHub for C/C++ libraries sorted by stars")
    .argument("<query...>", "Search terms, for example json parser")
    .option(
      "--limit <number>",
      "Maximum number of results to show, capped at 50",
      parsePositiveInteger,
      10,
    )
    .option("--language <language>", "GitHub language qualifier", "C++")
    .option(
      "--install",
      "Install after selecting a result; kept for compatibility because search is interactive by default",
    )
    .option("--no-interactive", "Only print results without opening the selector")
    .option(
      "--select <number>",
      "Non-interactive selection index to install",
      parsePositiveInteger,
    )
    .option(
      "--full-project",
      "Install the selected package as a full project and skip include-directory detection",
    )
    .option("--no-cache", "Bypass cached archives and refresh downloads")
    .option("--http-proxy <url>", "HTTP request proxy, overrides config")
    .option("--https-proxy <url>", "HTTPS request proxy, overrides config")
    .option("--json", "Output search results as JSON")
    .action(async (queryParts: string[], options: SearchOptions) => {
      if (options.interactive === false && options.select !== undefined) {
        throw new Error("Options --no-interactive and --select cannot be used together.");
      }

      const limit = normalizeSearchLimit(options.limit);
      const query = queryParts.join(" ");
      const results = await searchGitHubPackages(query, {
        limit,
        ...(options.httpProxy ? { httpProxy: options.httpProxy } : {}),
        ...(options.httpsProxy ? { httpsProxy: options.httpsProxy } : {}),
        ...(options.language ? { language: options.language } : {}),
      });

      if (options.json) {
        logger.raw(JSON.stringify(results, null, 2));
        return;
      }

      if (!results.length) {
        logger.warn(`No GitHub repositories found for "${query}".`);
        return;
      }

      logger.info(`GitHub repositories matching "${query}":`);
      logger.table(formatSearchResults(results));

      if (!shouldSelectSearchResult(options)) {
        if (options.install) {
          throw new Error(
            "Cannot install without an interactive terminal. Use --select <number>.",
          );
        }

        return;
      }

      const selected = await resolveSelectedSearchResult(results, options);

      if (!selected) {
        logger.warn("No package selected.");
        return;
      }

      logger.info(`Installing ${selected.repositoryPath.replace(/^\/+/, "")}`);
      await getVCPkg(selected.repositoryUrl, {
        ...(options.cache !== undefined ? { cache: options.cache } : {}),
        ...(options.fullProject ? { fullProject: options.fullProject } : {}),
        ...(options.httpProxy ? { httpProxy: options.httpProxy } : {}),
        ...(options.httpsProxy ? { httpsProxy: options.httpsProxy } : {}),
      });
    });
}
