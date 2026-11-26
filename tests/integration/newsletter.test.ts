import request from 'supertest';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { Subscriber } from '../../src/models';
import { uniqueEmail } from '../helpers/auth';
import { clearTestDb, connectTestDb, describeDb, disconnectTestDb } from '../helpers/db';

const app = createApp();
const subscribe = (body: Record<string, unknown>) =>
  request(app).post('/api/v1/newsletter/subscribe').send(body);

describeDb('newsletter sign-up', () => {
  beforeAll(connectTestDb);
  afterAll(disconnectTestDb);
  beforeEach(clearTestDb);

  it('subscribes an email address', async () => {
    const email = uniqueEmail('news');
    const res = await subscribe({ email: email.toUpperCase() });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const saved = await Subscriber.findOne({ email });
    expect(saved).toMatchObject({ email, sources: ['newsletter'] });
  });

  it('is idempotent and merges details from a second form', async () => {
    const email = uniqueEmail('vip');
    await subscribe({ email });
    const again = await subscribe({ email, source: 'vip', name: 'Ayesha Khan', city: 'Lahore' });
    expect(again.status).toBe(200);

    expect(await Subscriber.countDocuments({ email })).toBe(1);
    const saved = await Subscriber.findOne({ email });
    expect(saved!.sources.sort()).toEqual(['newsletter', 'vip']);
    expect(saved).toMatchObject({ name: 'Ayesha Khan', city: 'Lahore' });
  });

  it('answers the same for new and existing addresses', async () => {
    const email = uniqueEmail('same');
    const first = await subscribe({ email });
    const second = await subscribe({ email });
    expect(first.body).toEqual(second.body);
  });

  it('re-subscribes someone who had unsubscribed', async () => {
    const email = uniqueEmail('back');
    await subscribe({ email });
    await Subscriber.updateOne({ email }, { unsubscribedAt: new Date() });
    await subscribe({ email });
    expect((await Subscriber.findOne({ email }))!.unsubscribedAt).toBeNull();
  });

  it('silently ignores bots that fill the honeypot field', async () => {
    const email = uniqueEmail('bot');
    const res = await subscribe({ email, website: 'http://spam.example' });
    expect(res.status).toBe(200);
    expect(await Subscriber.countDocuments({ email })).toBe(0);
  });

  it.each([
    ['a bad email', { email: 'nope' }],
    ['a missing email', {}],
    ['an unknown source', { email: 'a@b.com', source: 'hacked' }],
  ])('rejects %s', async (_label, body) => {
    expect((await subscribe(body)).status).toBe(400);
  });

  it('rejects operator injection', async () => {
    expect((await subscribe({ email: { $ne: null } })).status).toBe(400);
  });
});
