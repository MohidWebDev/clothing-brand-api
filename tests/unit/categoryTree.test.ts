import { describe, expect, it } from 'vitest';
import { buildCategoryTree, depthOf, descendantIds } from '../../src/utils/categoryTree';

const cat = (id: string, parent: string | null, name = id, sortOrder = 0) => ({
  id,
  parent,
  name,
  sortOrder,
});

const flat = [
  cat('men', null, 'Men', 1),
  cat('women', null, 'Women', 0),
  cat('tshirts', 'men', 'T-Shirts'),
  cat('shirts', 'men', 'Shirts'),
  cat('polo', 'tshirts', 'Polo'),
];

describe('category tree', () => {
  it('nests children and orders by sortOrder then name', () => {
    const tree = buildCategoryTree(flat);
    expect(tree.map((n) => n.id)).toEqual(['women', 'men']);
    const men = tree[1]!;
    expect(men.children.map((n) => n.id)).toEqual(['shirts', 'tshirts']);
    expect(men.children[1]!.children.map((n) => n.id)).toEqual(['polo']);
  });

  it('treats categories with a missing parent as roots', () => {
    const tree = buildCategoryTree([cat('orphan', 'gone')]);
    expect(tree.map((n) => n.id)).toEqual(['orphan']);
  });

  it('collects a category and all its descendants', () => {
    expect(descendantIds(flat, 'men').sort()).toEqual(['men', 'polo', 'shirts', 'tshirts']);
    expect(descendantIds(flat, 'polo')).toEqual(['polo']);
    expect(descendantIds(flat, 'women')).toEqual(['women']);
  });

  it('survives cycles in bad data', () => {
    const cyclic = [cat('a', 'b'), cat('b', 'a')];
    expect(descendantIds(cyclic, 'a').sort()).toEqual(['a', 'b']);
    expect(depthOf(cyclic, 'a')).toBeLessThan(5);
  });

  it('measures depth', () => {
    expect(depthOf(flat, 'men')).toBe(1);
    expect(depthOf(flat, 'tshirts')).toBe(2);
    expect(depthOf(flat, 'polo')).toBe(3);
    expect(depthOf(flat, 'missing')).toBe(0);
  });
});
