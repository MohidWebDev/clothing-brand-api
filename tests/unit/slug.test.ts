import { describe, expect, it } from 'vitest';
import { slugify, uniqueSlug } from '../../src/utils/slug';

describe('slugify', () => {
  it.each([
    ["Men's Cotton T-Shirt", 'mens-cotton-t-shirt'],
    ['Shalwar  Kameez & Dupatta', 'shalwar-kameez-and-dupatta'],
    ['  --Lawn Suit--  ', 'lawn-suit'],
    ['Café Crème', 'cafe-creme'],
    ['100% Cotton / Slim Fit', '100-cotton-slim-fit'],
  ])('turns %j into %j', (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it('falls back to "item" when nothing usable remains', () => {
    expect(slugify('!!!')).toBe('item');
    expect(slugify('کُرتا')).toBe('item');
  });

  it('limits the length without leaving a trailing hyphen', () => {
    const slug = slugify('word '.repeat(40));
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug.endsWith('-')).toBe(false);
  });
});

describe('uniqueSlug', () => {
  it('returns the plain slug when it is free', async () => {
    expect(await uniqueSlug('Blue Shirt', async () => false)).toBe('blue-shirt');
  });

  it('appends a counter until it finds a free slug', async () => {
    const taken = new Set(['blue-shirt', 'blue-shirt-2']);
    expect(await uniqueSlug('Blue Shirt', async (s) => taken.has(s))).toBe('blue-shirt-3');
  });

  it('falls back to a random suffix if every counter is taken', async () => {
    const slug = await uniqueSlug('Blue Shirt', async (s) => /^blue-shirt(-\d+)?$/.test(s));
    expect(slug).toMatch(/^blue-shirt-[0-9a-f]{6}$/);
  });
});
