import { SIZE_ORDER } from '../constants';

/** Sizes are stored uppercase and trimmed so "xl", " XL " and "XL" are the same size. */
export const normalizeSize = (size: string) => size.trim().replace(/\s+/g, ' ').toUpperCase();

const rank = (size: string) => (SIZE_ORDER as readonly string[]).indexOf(size);

/** XS < S < M < L < XL ..., then numeric sizes (28 < 30 < 32), then anything else A-Z. */
export function compareSizes(a: string, b: string): number {
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== -1 && rb !== -1) return ra - rb;
  if (ra !== -1) return -1;
  if (rb !== -1) return 1;

  const na = Number.parseFloat(a);
  const nb = Number.parseFloat(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
  if (!Number.isNaN(na) && Number.isNaN(nb)) return -1;
  if (Number.isNaN(na) && !Number.isNaN(nb)) return 1;
  return a.localeCompare(b);
}
