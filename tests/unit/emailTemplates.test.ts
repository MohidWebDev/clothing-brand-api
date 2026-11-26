import { describe, expect, it } from 'vitest';
import { renderEmail } from '../../src/templates/emails';
import { escapeHtml } from '../../src/utils/html';

describe('email templates', () => {
  it('renders the verification email with the link in html and text', () => {
    const url = 'https://shop.example/verify-email?token=abc';
    const mail = renderEmail({
      template: 'verify-email',
      to: 'a@b.com',
      data: { name: 'Ayesha', url, expiresInHours: 24 },
    });
    expect(mail.subject).toContain('Verify');
    expect(mail.html).toContain(url);
    expect(mail.text).toContain(url);
    expect(mail.html).toContain('24 hours');
  });

  it('escapes user-supplied names to prevent HTML injection', () => {
    const mail = renderEmail({
      template: 'password-changed',
      to: 'a@b.com',
      data: { name: '<script>alert(1)</script>' },
    });
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;');
  });

  it('renders the reset email with its expiry', () => {
    const mail = renderEmail({
      template: 'reset-password',
      to: 'a@b.com',
      data: { name: 'A', url: 'https://x/reset?token=t', expiresInMinutes: 30 },
    });
    expect(mail.html).toContain('30 minutes');
  });

  it('escapes all special characters', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;',
    );
  });
});
