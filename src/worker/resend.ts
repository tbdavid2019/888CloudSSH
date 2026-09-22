import type { Env } from '../types';

const RESEND_API_URL = 'https://api.resend.com/emails';

export type EmailSender = (message: ResendEmailMessage) => Promise<void>;

export interface ResendEmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  idempotencyKey?: string;
}

export function createResendEmailSender(env: Env): EmailSender {
  return async (message) => {
    if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL) {
      throw new Error('Resend email configuration is missing');
    }

    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        ...(message.idempotencyKey ? { 'Idempotency-Key': message.idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from: env.RESEND_FROM_EMAIL,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
    });

    if (!response.ok) {
      throw new Error(`Resend email request failed (${response.status})`);
    }
  };
}

export function buildEmailOtpMessage(email: string, code: string): ResendEmailMessage {
  return {
    to: email,
    subject: 'Your 888CloudSSH login code',
    text: `Your 888CloudSSH login code is ${code}. It expires in 10 minutes.`,
    html: `<p>Your 888CloudSSH login code is <strong>${code}</strong>.</p><p>It expires in 10 minutes.</p>`,
  };
}
