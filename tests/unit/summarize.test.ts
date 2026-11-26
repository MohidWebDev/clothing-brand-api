import { describe, expect, it } from 'vitest';
import { summarize } from '../../src/services/catalogMapper';

describe('summarize', () => {
  it('returns short text unchanged, collapsing whitespace', () => {
    expect(summarize('  Soft   linen\nshirt. ')).toBe('Soft linen shirt.');
  });

  it('cuts long text at a word boundary and adds an ellipsis', () => {
    const text = 'word '.repeat(60);
    const out = summarize(text, 50);
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(51);
    expect(out.slice(0, -1).endsWith(' ')).toBe(false);
    expect(out).not.toMatch(/wor…$/);
  });

  it('still cuts text that has no spaces', () => {
    expect(summarize('x'.repeat(300), 50)).toBe(`${'x'.repeat(50)}…`);
  });
});
