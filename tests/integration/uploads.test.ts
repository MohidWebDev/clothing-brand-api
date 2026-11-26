import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app';
import { ROLES } from '../../src/constants';
import { seedRoles } from '../../src/seeders';
import { imageStorage } from '../../src/services/storage.service';
import { sessionCookieFor } from '../helpers/auth';
import { clearTestDb, connectTestDb, describeDb, disconnectTestDb } from '../helpers/db';

const app = createApp();

const png = (size = 64) =>
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(size),
  ]);

describeDb('image uploads', () => {
  let manager: string;
  const post = (cookie?: string) => {
    const req = request(app).post('/api/v1/admin/uploads/images');
    return cookie ? req.set('Cookie', cookie) : req;
  };

  beforeAll(connectTestDb);
  afterAll(disconnectTestDb);
  beforeEach(async () => {
    await clearTestDb();
    await seedRoles();
    manager = (await sessionCookieFor(app, ROLES.INVENTORY_MANAGER)).cookie;
  });
  afterEach(() => vi.restoreAllMocks());

  it('requires sign-in and an upload-capable permission', async () => {
    expect((await post().attach('images', png(), 'a.png')).status).toBe(401);
    const customer = (await sessionCookieFor(app, ROLES.CUSTOMER)).cookie;
    expect((await post(customer).attach('images', png(), 'a.png')).status).toBe(403);
    const staff = (await sessionCookieFor(app, ROLES.STAFF)).cookie;
    expect((await post(staff).attach('images', png(), 'a.png')).status).toBe(403);
  });

  it('uploads valid images and returns their URLs and public ids', async () => {
    const upload = vi.spyOn(imageStorage, 'upload').mockImplementation(async (_buf, folder) => ({
      url: `https://res.cloudinary.com/demo/${folder}/img.png`,
      publicId: `${folder}/img`,
    }));

    const res = await post(manager)
      .attach('images', png(), 'a.png')
      .attach('images', png(), 'b.png');
    expect(res.status).toBe(201);
    expect(res.body.data.images).toHaveLength(2);
    expect(res.body.data.images[0]).toEqual({
      url: 'https://res.cloudinary.com/demo/products/img.png',
      publicId: 'products/img',
    });
    expect(upload).toHaveBeenCalledTimes(2);
  });

  it('sends files to the requested folder', async () => {
    const upload = vi
      .spyOn(imageStorage, 'upload')
      .mockResolvedValue({ url: 'https://res.cloudinary.com/demo/x.png', publicId: 'x' });
    await post(manager).query({ folder: 'brands' }).attach('images', png(), 'logo.png');
    expect(upload).toHaveBeenCalledWith(expect.any(Buffer), 'brands');
  });

  it('rejects files that are not images, whatever their name or declared type', async () => {
    const upload = vi.spyOn(imageStorage, 'upload');
    const res = await post(manager).attach(
      'images',
      Buffer.from('<script>alert(1)</script>'.padEnd(40)),
      {
        filename: 'evil.png',
        contentType: 'image/png',
      },
    );
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].message).toContain('evil.png');
    expect(upload).not.toHaveBeenCalled();
  });

  it('uploads nothing when any file in the batch is invalid', async () => {
    const upload = vi.spyOn(imageStorage, 'upload');
    const res = await post(manager)
      .attach('images', png(), 'good.png')
      .attach('images', Buffer.from('not an image at all, just text'), 'bad.png');
    expect(res.status).toBe(400);
    expect(upload).not.toHaveBeenCalled();
  });

  it('rejects requests without files', async () => {
    expect((await post(manager)).status).toBe(400);
  });

  it('rejects too many files and files in the wrong field', async () => {
    let req = post(manager);
    for (let i = 0; i < 11; i++) req = req.attach('images', png(), `${i}.png`);
    expect((await req).status).toBe(400);

    expect((await post(manager).attach('photo', png(), 'a.png')).status).toBe(400);
  });

  it('rejects files over the size limit', async () => {
    const res = await post(manager).attach('images', png(6 * 1024 * 1024), 'huge.png');
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('answers 503 when image storage is not configured', async () => {
    const res = await post(manager).attach('images', png(), 'a.png');
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('SERVICE_UNAVAILABLE');
  });
});
