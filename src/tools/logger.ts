import pc from "picocolors";
import { AsyncLocalStorage } from "node:async_hooks";

type TableRow = Record<string, unknown>;
type WritableStream = NodeJS.WriteStream;
type LoggerSink = (line: string, stream: "stderr" | "stdout") => void;

export type LogLevel = "quiet" | "error" | "warn" | "info" | "verbose";

const loggerSinkStorage = new AsyncLocalStorage<LoggerSink>();
let currentLevel: LogLevel = "info";

export function setLogLevel(level: LogLevel) {
  currentLevel = level;
}

export function getLogLevel(): LogLevel {
  return currentLevel;
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  quiet: 0,
  error: 1,
  warn: 2,
  info: 3,
  verbose: 4,
};

function shouldLog(minLevel: LogLevel): boolean {
  return LEVEL_ORDER[currentLevel] >= LEVEL_ORDER[minLevel];
}

function writeLine(message = "", stream: WritableStream = process.stdout) {
  const line = String(message);
  const sink = loggerSinkStorage.getStore();

  sink?.(line, stream === process.stderr ? "stderr" : "stdout");
  stream.write(`${line}\n`);
}

function formatTag(label: string, color: (value: string) => string) {
  return color(pc.bold(`[${label}]`));
}

function stringifyValue(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  if (Array.isArray(value)) {
    return value.join(", ");
  }

  return String(value);
}

function getTableColumns(rows: TableRow[]) {
  return [...new Set(rows.flatMap((row) => Object.keys(row)))];
}

function formatTableRow(row: TableRow, columns: string[], widths: Map<string, number>) {
  return columns
    .map((column) =>
      stringifyValue(row[column]).padEnd(widths.get(column) ?? column.length),
    )
    .join(pc.dim("  "));
}

export const logger = {
  raw(value: unknown = "") {
    writeLine(stringifyValue(value));
  },
  info(message: string) {
    if (!shouldLog("info")) return;
    writeLine(`${formatTag("info", pc.cyan)} ${message}`);
  },
  success(message: string) {
    if (!shouldLog("info")) return;
    writeLine(`${formatTag("ok", pc.green)} ${message}`);
  },
  warn(message: string) {
    if (!shouldLog("warn")) return;
    writeLine(`${formatTag("warn", pc.yellow)} ${message}`);
  },
  error(message: string) {
    writeLine(`${formatTag("error", pc.red)} ${message}`, process.stderr);
  },
  progress(message: string) {
    if (!shouldLog("info")) return;
    writeLine(`${pc.dim("...")} ${message}`);
  },
  step(current: number, total: number, message: string) {
    if (!shouldLog("info")) return;
    writeLine(`${pc.dim(`[${current}/${total}]`)} ${message}`);
  },
  detail(label: string, value: unknown) {
    if (!shouldLog("verbose")) return;
    writeLine(`${pc.dim(`${label}:`)} ${stringifyValue(value)}`);
  },
  table(rows: TableRow[]) {
    if (!rows.length) {
      return;
    }

    if (!shouldLog("info")) return;

    const columns = getTableColumns(rows);
    const widths = new Map(
      columns.map((column) => [
        column,
        Math.max(
          column.length,
          ...rows.map((row) => stringifyValue(row[column]).length),
        ),
      ]),
    );
    const header = columns
      .map((column) => pc.bold(column.padEnd(widths.get(column) ?? column.length)))
      .join(pc.dim("  "));
    const separator = columns
      .map((column) => pc.dim("-".repeat(widths.get(column) ?? column.length)))
      .join(pc.dim("  "));

    writeLine(header);
    writeLine(separator);

    for (const row of rows) {
      writeLine(formatTableRow(row, columns, widths));
    }
  },
};

export function withLoggerSink<T>(
  sink: LoggerSink,
  operation: () => Promise<T>,
) {
  return loggerSinkStorage.run(sink, operation);
}
