import type { InstalledDependency } from "../types/global";
import { readInstalledDependencies } from "./deps";

type GraphFormat = "ascii" | "dot" | "mermaid";

function normalizeUrl(url: string) {
  return url.trim().replace(/\/+$/, "").replace(/\.git$/i, "").toLowerCase();
}

function buildDepMap(deps: InstalledDependency[]) {
  const map = new Map<string, InstalledDependency>();
  for (const dep of deps) {
    map.set(normalizeUrl(dep.repository.url), dep);
  }
  return map;
}

function getRootDeps(deps: InstalledDependency[]) {
  const transitiveUrls = new Set<string>();
  for (const dep of deps) {
    if (dep.transitiveDeps) {
      for (const child of dep.transitiveDeps) {
        transitiveUrls.add(normalizeUrl(child));
      }
    }
  }
  return deps.filter((d) => !transitiveUrls.has(normalizeUrl(d.repository.url)));
}

function getChildren(dep: InstalledDependency, depMap: Map<string, InstalledDependency>) {
  if (!dep.transitiveDeps) return [];
  const children: InstalledDependency[] = [];
  for (const childUrl of dep.transitiveDeps) {
    const child = depMap.get(normalizeUrl(childUrl));
    if (child) children.push(child);
  }
  return children;
}

function hasValidChildren(dep: InstalledDependency, depMap: Map<string, InstalledDependency>) {
  return (dep.transitiveDeps ?? []).some((url) => depMap.has(normalizeUrl(url)));
}

function renderAsciiTree(deps: InstalledDependency[], maxDepth?: number): string {
  const depMap = buildDepMap(deps);
  const roots = getRootDeps(deps);
  const lines: string[] = [];
  const visited = new Set<string>();

  function walk(node: InstalledDependency, prefix: string, isLast: boolean, depth: number) {
    const nodeKey = normalizeUrl(node.repository.url);
    if (visited.has(nodeKey)) {
      lines.push(`${prefix}${isLast ? "└── " : "├── "}${node.name} (circular)`);
      return;
    }
    visited.add(nodeKey);
    lines.push(`${prefix}${isLast ? "└── " : "├── "}${node.name}@${node.version}`);

    if (maxDepth === undefined || depth < maxDepth) {
      const children = getChildren(node, depMap);
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (!child) continue;
        const childPrefix = prefix + (isLast ? "    " : "│   ");
        walk(child, childPrefix, i === children.length - 1, depth + 1);
      }
    } else if (hasValidChildren(node, depMap)) {
      lines.push(`${prefix}${isLast ? "    " : "│   "}...`);
    }
    visited.delete(nodeKey);
  }

  for (let i = 0; i < roots.length; i++) {
    const root = roots[i];
    if (!root) continue;
    const nodeKey = normalizeUrl(root.repository.url);
    visited.add(nodeKey);
    lines.push(`${root.name}@${root.version}`);

    if (maxDepth === undefined || 0 < maxDepth) {
      const children = getChildren(root, depMap);
      for (let j = 0; j < children.length; j++) {
        const child = children[j];
        if (!child) continue;
        walk(child, "", j === children.length - 1, 1);
      }
    }
    visited.delete(nodeKey);
  }

  return lines.join("\n");
}

function renderDot(deps: InstalledDependency[], maxDepth?: number): string {
  const depMap = buildDepMap(deps);
  const lines: string[] = ['digraph "cppkg-dependencies" {'];
  lines.push("  rankdir=LR;");
  lines.push('  node [shape=box, style=rounded];');

  function collectNodes(dep: InstalledDependency, depth: number): Set<string> {
    const included = new Set<string>();
    const queue: Array<{ dep: InstalledDependency; depth: number }> = [{ dep, depth }];
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) continue;
      const key = normalizeUrl(current.dep.repository.url);
      if (included.has(key)) continue;
      included.add(key);
      if (maxDepth !== undefined && current.depth >= maxDepth) continue;
      for (const child of getChildren(current.dep, depMap)) {
        queue.push({ dep: child, depth: current.depth + 1 });
      }
    }
    return included;
  }

  const allIncluded = new Set<string>();
  for (const dep of deps) {
    const subset = collectNodes(dep, 0);
    for (const key of subset) {
      allIncluded.add(key);
    }
  }

  const edgeSet = new Set<string>();
  for (const dep of deps) {
    const key = normalizeUrl(dep.repository.url);
    if (!allIncluded.has(key)) continue;
    const safeName = dep.name.replace(/[^a-zA-Z0-9_]/g, "_");
    lines.push(`  "${safeName}" [label="${dep.name}\\n${dep.version}"];`);
    if (dep.transitiveDeps) {
      for (const childUrl of dep.transitiveDeps) {
        const child = depMap.get(normalizeUrl(childUrl));
        if (child && allIncluded.has(normalizeUrl(childUrl))) {
          const childSafe = child.name.replace(/[^a-zA-Z0-9_]/g, "_");
          edgeSet.add(`  "${safeName}" -> "${childSafe}";`);
        }
      }
    }
  }
  for (const edge of edgeSet) {
    lines.push(edge);
  }
  lines.push("}");
  return lines.join("\n");
}

function renderMermaid(deps: InstalledDependency[], maxDepth?: number): string {
  const depMap = buildDepMap(deps);
  const lines: string[] = ["graph LR;"];
  const edgeSet = new Set<string>();

  function collectNodes(dep: InstalledDependency, depth: number): Set<string> {
    const included = new Set<string>();
    const queue: Array<{ dep: InstalledDependency; depth: number }> = [{ dep, depth }];
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) continue;
      const key = normalizeUrl(current.dep.repository.url);
      if (included.has(key)) continue;
      included.add(key);
      if (maxDepth !== undefined && current.depth >= maxDepth) continue;
      for (const child of getChildren(current.dep, depMap)) {
        queue.push({ dep: child, depth: current.depth + 1 });
      }
    }
    return included;
  }

  const allIncluded = new Set<string>();
  for (const dep of deps) {
    const subset = collectNodes(dep, 0);
    for (const key of subset) {
      allIncluded.add(key);
    }
  }

  for (const dep of deps) {
    const key = normalizeUrl(dep.repository.url);
    if (!allIncluded.has(key)) continue;
    const safeName = dep.name.replace(/[^a-zA-Z0-9_]/g, "_");
    lines.push(`  ${safeName}["${dep.name}@${dep.version}"];`);
  }

  for (const dep of deps) {
    const key = normalizeUrl(dep.repository.url);
    if (!allIncluded.has(key)) continue;
    const safeName = dep.name.replace(/[^a-zA-Z0-9_]/g, "_");
    if (dep.transitiveDeps) {
      for (const childUrl of dep.transitiveDeps) {
        const child = depMap.get(normalizeUrl(childUrl));
        if (child && allIncluded.has(normalizeUrl(childUrl))) {
          const childSafe = child.name.replace(/[^a-zA-Z0-9_]/g, "_");
          const edge = `${safeName} --> ${childSafe}`;
          if (!edgeSet.has(edge)) {
            edgeSet.add(edge);
            lines.push(`  ${edge};`);
          }
        }
      }
    }
  }

  return lines.join("\n");
}

export async function getDependencyTree(maxDepth?: number) {
  const installed = await readInstalledDependencies();
  return installed.dependencies.map((dep) => {
    const children = dep.transitiveDeps
      ? dep.transitiveDeps.map((url) => ({
          url,
          name: installed.dependencies.find(
            (d) => normalizeUrl(d.repository.url) === normalizeUrl(url),
          )?.name ?? url,
        }))
      : [];

    const limitedChildren =
      maxDepth !== undefined && maxDepth <= 0
        ? []
        : children.map((c) => ({
            url: c.url,
            name: c.name,
            children:
              maxDepth !== undefined && maxDepth <= 1
                ? []
                : (installed.dependencies
                    .find(
                      (d) => normalizeUrl(d.repository.url) === normalizeUrl(c.url),
                    )
                    ?.transitiveDeps?.map((u) => ({
                      url: u,
                      name: installed.dependencies.find(
                        (d2) => normalizeUrl(d2.repository.url) === normalizeUrl(u),
                      )?.name ?? u,
                    })) ?? []),
          }));

    return {
      name: dep.name,
      version: dep.version,
      repository: dep.repository.url,
      children: limitedChildren,
    };
  });
}

export async function renderDependencyGraph(
  format: GraphFormat = "ascii",
  maxDepth?: number,
): Promise<string> {
  const installed = await readInstalledDependencies();
  if (!installed.dependencies.length) {
    return "No installed packages found.";
  }

  switch (format) {
    case "dot":
      return renderDot(installed.dependencies, maxDepth);
    case "mermaid":
      return renderMermaid(installed.dependencies, maxDepth);
    default:
      return renderAsciiTree(installed.dependencies, maxDepth);
  }
}
