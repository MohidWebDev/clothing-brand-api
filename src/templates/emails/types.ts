export type EmailJob =
  | {
      template: 'verify-email';
      to: string;
      data: { name: string; url: string; expiresInHours: number };
    }
  | {
      template: 'reset-password';
      to: string;
      data: { name: string; url: string; expiresInMinutes: number };
    }
  | { template: 'password-changed'; to: string; data: { name: string } };

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}
