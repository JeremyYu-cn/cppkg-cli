import type { InstalledDependency, SourceRequest } from "../types/global";
import type { ManifestDependency } from "../public/manifest";

export function getDependencyIdentity(
  dependency: Pick<InstalledDependency, "repository">,
) {
  return (
    dependency.repository.url.trim().replace(/\/+$/, "").replace(/\.git$/i, "") ||
    dependency.repository.path
  );
}

export function readManifestSourceRequest(dependency: ManifestDependency): SourceRequest {
  const modifiers = {
    ...(dependency.includePath?.length ? { includePath: dependency.includePath } : {}),
    ...(dependency.stripPrefix ? { stripPrefix: dependency.stripPrefix } : {}),
    ...(dependency.patches?.length ? { patches: dependency.patches } : {}),
    ...(dependency.components?.length ? { components: dependency.components } : {}),
    ...(dependency.checksum ? { checksum: dependency.checksum } : {}),
  };

  if (dependency.tag) {
    return {
      ...modifiers,
      type: "tag",
      value: dependency.tag,
    };
  }

  if (dependency.branch) {
    return {
      ...modifiers,
      type: "branch",
      value: dependency.branch,
    };
  }

  if (dependency.versionRange) {
    return {
      ...modifiers,
      type: "version-range",
      value: dependency.versionRange,
      ...(dependency.prerelease ? { includePrerelease: true } : {}),
    };
  }

  if (dependency.versionPolicy === "default-branch") {
    return {
      ...modifiers,
      type: "default-branch",
      value: null,
    };
  }

  return {
    ...modifiers,
    type: "latest-release",
    value: null,
    ...(dependency.prerelease || dependency.versionPolicy === "latest-prerelease"
      ? { includePrerelease: true }
      : {}),
  };
}

export function sourceRequestsEqual(
  left: SourceRequest | undefined,
  right: SourceRequest,
) {
  const arraysEqual = (
    leftValues: string[] | undefined,
    rightValues: string[] | undefined,
  ) => {
    const normalizedLeft = leftValues ?? [];
    const normalizedRight = rightValues ?? [];

    return (
      normalizedLeft.length === normalizedRight.length &&
      normalizedLeft.every((value, index) => value === normalizedRight[index])
    );
  };

  return (
    left?.type === right.type &&
    (left.value ?? null) === (right.value ?? null) &&
    Boolean(left.includePrerelease) === Boolean(right.includePrerelease) &&
    arraysEqual(left.includePath, right.includePath) &&
    (left.stripPrefix ?? null) === (right.stripPrefix ?? null) &&
    arraysEqual(left.patches, right.patches) &&
    arraysEqual(left.components, right.components) &&
    (left.checksum ?? null) === (right.checksum ?? null)
  );
}
