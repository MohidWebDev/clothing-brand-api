const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escapes user-supplied text before it is placed inside an HTML email. */
export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => ESCAPES[c]!);
