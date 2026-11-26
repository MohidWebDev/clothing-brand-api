export interface FlatCategory {
  id: string;
  parent: string | null;
  name: string;
  sortOrder: number;
}

export type CategoryNode<T extends FlatCategory> = T & { children: CategoryNode<T>[] };

const bySortThenName = (a: FlatCategory, b: FlatCategory) =>
  a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);

/** Turns a flat list into a nested tree. Categories whose parent is missing become roots. */
export function buildCategoryTree<T extends FlatCategory>(items: readonly T[]): CategoryNode<T>[] {
  const nodes = new Map<string, CategoryNode<T>>(
    items.map((item) => [item.id, { ...item, children: [] }]),
  );
  const roots: CategoryNode<T>[] = [];

  for (const node of nodes.values()) {
    const parent = node.parent ? nodes.get(node.parent) : undefined;
    (parent ? parent.children : roots).push(node);
  }

  const sortRecursively = (list: CategoryNode<T>[]) => {
    list.sort(bySortThenName);
    list.forEach((n) => sortRecursively(n.children));
  };
  sortRecursively(roots);
  return roots;
}

/** The category and every category below it. */
export function descendantIds(items: readonly FlatCategory[], rootId: string): string[] {
  const childrenOf = new Map<string, string[]>();
  for (const item of items) {
    if (!item.parent) continue;
    childrenOf.set(item.parent, [...(childrenOf.get(item.parent) ?? []), item.id]);
  }

  const result: string[] = [];
  const queue = [rootId];
  const seen = new Set<string>();
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(id);
    queue.push(...(childrenOf.get(id) ?? []));
  }
  return result;
}

/** 1 for a top-level category, 2 for its child, and so on. */
export function depthOf(items: readonly FlatCategory[], id: string): number {
  const byId = new Map(items.map((i) => [i.id, i]));
  let depth = 0;
  let current = byId.get(id);
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    depth++;
    current = current.parent ? byId.get(current.parent) : undefined;
  }
  return depth;
}
