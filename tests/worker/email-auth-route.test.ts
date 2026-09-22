import { describe, expect, it, vi } from 'vitest';
import {
  handleEmailOtpRequest,
  handleEmailOtpVerify,
  handleRecoveryLogin,
} from '../../src/worker/email-auth-route';

function request(path: string, body: unknown): Request {
  return new Request(`https://cloudssh.test${path}`, {
    method: 'POST',
    headers: {
      Origin: 'https://cloudssh.test',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

describe('email auth routes', () => {
  it('requests an OTP through the directory and Resend sender', async () => {
    const directoryFetch = vi.fn().mockResolvedValue(
      Response.json({ accepted: true, cooldown: false })
    );
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const env = {
      RESEND_API_KEY: 're_test',
      RESEND_FROM_EMAIL: 'security@example.com',
      ACCOUNT_DIRECTORY: { getByName: () => ({ fetch: directoryFetch }) },
    } as any;

    const response = await handleEmailOtpRequest(
      request('/api/auth/email/request', { email: 'User@example.com' }),
      env
    );

    expect(response.status).toBe(200);
    expect(directoryFetch).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledOnce();
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body.to).toEqual(['user@example.com']);
    expect(body.text).toMatch(/\d{6}/);
    expect(body).not.toHaveProperty('api_key');
  });

  it('creates an account session after directory OTP verification', async () => {
    const directoryFetch = vi.fn().mockResolvedValue(
      Response.json({ verified: true, accountId: 'acc_test', email: 'user@example.com' })
    );
    const accountFetch = vi.fn().mockImplementation(async (req: Request) => {
      const url = new URL(req.url);
      if (url.pathname === '/internal/account/profile') {
        return Response.json({ account_id: 'acc_test', email: 'user@example.com' });
      }
      if (url.pathname === '/internal/account/recovery/enroll') {
        return Response.json({ codes: ['CODE-1234'] });
      }
      if (url.pathname === '/internal/account/workspaces' && req.method === 'GET') {
        return Response.json({ workspaces: [] });
      }
      if (url.pathname === '/internal/account/workspaces' && req.method === 'POST') {
        return Response.json({ workspace_id: 'ws_test', role: 'owner' });
      }
      if (url.pathname === '/internal/account/session/create') {
        return Response.json({ token: 'acc:acc_test:session' });
      }
      return new Response('Not found', { status: 404 });
    });
    const workspaceFetch = vi.fn().mockResolvedValue(Response.json({ workspace_id: 'ws_test' }));
    const env = {
      RESEND_API_KEY: 're_test',
      ACCOUNT_DIRECTORY: { getByName: () => ({ fetch: directoryFetch }) },
      ACCOUNT_DO: { getByName: () => ({ fetch: accountFetch }) },
      WORKSPACE_DO: { getByName: () => ({ fetch: workspaceFetch }) },
    } as any;

    const response = await handleEmailOtpVerify(
      request('/api/auth/email/verify', {
        email: 'user@example.com',
        challenge_id: 'challenge',
        code: '123456',
      }),
      env
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Set-Cookie')).toContain('session=acc:acc_test:session');
    expect(accountFetch).toHaveBeenCalled();
    expect(workspaceFetch).toHaveBeenCalledOnce();
  });

  it('allows OTP request without Turnstile when it is unconfigured', async () => {
    const directoryFetch = vi.fn().mockResolvedValue(
      Response.json({ accepted: false })
    );
    vi.stubGlobal('fetch', vi.fn());
    const env = {
      RESEND_API_KEY: 're_test',
      RESEND_FROM_EMAIL: 'security@example.com',
      ACCOUNT_DIRECTORY: { getByName: () => ({ fetch: directoryFetch }) },
    } as any;
    const response = await handleEmailOtpRequest(
      request('/api/auth/email/request', { email: 'user@example.com' }),
      env
    );
    expect(response.status).toBe(200);
    expect(directoryFetch).toHaveBeenCalledOnce();
  });

  it('rejects an invalid Turnstile action before dispatching Resend', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({ success: true, action: 'wrong_action', hostname: 'cloudssh.test' })
    );
    vi.stubGlobal('fetch', fetchMock);
    const directoryFetch = vi.fn();
    const env = {
      RESEND_API_KEY: 're_test',
      RESEND_FROM_EMAIL: 'security@example.com',
      TURNSTILE_SECRET: 'ts_secret',
      ACCOUNT_DIRECTORY: { getByName: () => ({ fetch: directoryFetch }) },
    } as any;
    const response = await handleEmailOtpRequest(
      request('/api/auth/email/request', {
        email: 'user@example.com',
        turnstile_token: 'token',
      }),
      env
    );
    expect(response.status).toBe(403);
    expect(directoryFetch).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('allows recovery login without Turnstile when it is unconfigured', async () => {
    const directoryFetch = vi.fn().mockResolvedValue(Response.json({ account_id: 'acc_test' }));
    const accountFetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ verified: true }))
      .mockResolvedValueOnce(Response.json({ token: 'acc:acc_test:recovery' }));
    const env = {
      ACCOUNT_DIRECTORY: { getByName: () => ({ fetch: directoryFetch }) },
      ACCOUNT_DO: { getByName: () => ({ fetch: accountFetch }) },
    } as any;

    const response = await handleRecoveryLogin(
      request('/api/auth/recovery', {
        email: 'user@example.com',
        recovery_code: 'ABCD-2345',
      }),
      env
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Set-Cookie')).toContain('session=acc:acc_test:recovery');
  });

  it('returns 429 when OTP requests are rate limited by directory', async () => {
    const directoryFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ accepted: false, rateLimited: true }), { status: 429 })
    );
    const env = {
      RESEND_API_KEY: 're_test',
      RESEND_FROM_EMAIL: 'security@example.com',
      ACCOUNT_DIRECTORY: { getByName: () => ({ fetch: directoryFetch }) },
    } as any;
    const response = await handleEmailOtpRequest(
      request('/api/auth/email/request', { email: 'user@example.com' }),
      env
    );
    expect(response.status).toBe(429);
    const data = await response.json<{ error: string }>();
    expect(data.error).toContain('Too many requests');
  });
});
