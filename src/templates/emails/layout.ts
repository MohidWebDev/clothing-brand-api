import { env } from '../../config/env';
import { escapeHtml } from '../../utils/html';

export function renderButton(label: string, url: string) {
  return `<p style="margin:28px 0"><a href="${escapeHtml(url)}" style="background:#111;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;display:inline-block;font-weight:600">${escapeHtml(label)}</a></p>`;
}

export function renderLayout(title: string, bodyHtml: string) {
  const app = escapeHtml(env.APP_NAME);
  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;color:#222">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;padding:32px;max-width:560px">
          <tr><td>
            <p style="font-size:20px;font-weight:700;margin:0 0 24px">${app}</p>
            <h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(title)}</h1>
            ${bodyHtml}
            <hr style="border:none;border-top:1px solid #eee;margin:28px 0 16px" />
            <p style="font-size:12px;color:#888;margin:0">You received this email because of activity on your ${app} account.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}
