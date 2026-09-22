import { describe, expect, it, vi } from 'vitest';
import { buildEmailOtpMessage, createResendEmailSender } from '../../src/worker/resend';

describe('resend email sender', () => {
  it('sends an OTP through Resend without exposing the API key in the body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const sender = createResendEmailSender({
      RESEND_API_KEY: 're_secret_key',
      RESEND_FROM_EMAIL: 'security@example.com',
    } as any);
    await sender(buildEmailOtpMessage('user@example.com', '123456'));

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.headers).toEqual({
      Authorization: 'Bearer re_secret_key',
      'Content-Type': 'application/json',
    });
    expect(String(init.body)).not.toContain('re_secret_key');
    expect(String(init.body)).toContain('user@example.com');
    expect(String(init.body)).toContain('123456');
  });

  it('fails closed when Resend configuration is missing', async () => {
    const sender = createResendEmailSender({} as any);
    await expect(sender(buildEmailOtpMessage('user@example.com', '123456'))).rejects.toThrow(
      'configuration is missing'
    );
  });

  it('surfaces provider failure without exposing response content', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('secret provider detail', { status: 500 })));
    const sender = createResendEmailSender({
      RESEND_API_KEY: 're_secret_key',
      RESEND_FROM_EMAIL: 'security@example.com',
    } as any);
    await expect(sender(buildEmailOtpMessage('user@example.com', '123456'))).rejects.toThrow(
      'Resend email request failed (500)'
    );
  });
});
