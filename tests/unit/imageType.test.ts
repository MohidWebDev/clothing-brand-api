import { describe, expect, it } from 'vitest';
import { detectImageType } from '../../src/utils/imageType';

const pad = (bytes: number[], total = 32) =>
  Buffer.concat([Buffer.from(bytes), Buffer.alloc(total - bytes.length)]);

describe('detectImageType', () => {
  it('recognises JPEG', () => expect(detectImageType(pad([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpeg'));

  it('recognises PNG', () =>
    expect(detectImageType(pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('png'));

  it('recognises WebP', () => {
    const buf = Buffer.concat([
      Buffer.from('RIFF'),
      Buffer.from([0, 0, 0, 0]),
      Buffer.from('WEBPVP8 '),
      Buffer.alloc(8),
    ]);
    expect(detectImageType(buf)).toBe('webp');
  });

  it('recognises AVIF', () => {
    const buf = Buffer.concat([
      Buffer.from([0, 0, 0, 0x1c]),
      Buffer.from('ftypavif'),
      Buffer.alloc(16),
    ]);
    expect(detectImageType(buf)).toBe('avif');
  });

  it('rejects HTML, scripts, SVG and other content pretending to be images', () => {
    expect(detectImageType(Buffer.from('<html><script>alert(1)</script></html>'))).toBeNull();
    expect(
      detectImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')),
    ).toBeNull();
    expect(detectImageType(Buffer.from('GIF89a' + 'x'.repeat(30)))).toBeNull();
  });

  it('rejects tiny or empty buffers', () => {
    expect(detectImageType(Buffer.alloc(0))).toBeNull();
    expect(detectImageType(Buffer.from([0xff, 0xd8, 0xff]))).toBeNull();
  });
});
