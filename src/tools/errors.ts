export class CppkgError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CppkgError";
  }
}

export class LockfileError extends CppkgError {
  constructor(message: string) {
    super(message);
    this.name = "LockfileError";
  }
}

export class ManifestError extends CppkgError {
  constructor(message: string) {
    super(message);
    this.name = "ManifestError";
  }
}

export class DownloadError extends CppkgError {
  constructor(message: string) {
    super(message);
    this.name = "DownloadError";
  }
}

export class ConfigError extends CppkgError {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
