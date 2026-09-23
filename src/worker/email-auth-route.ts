import {
  EMAIL_OTP_RESEND_COOLDOWN_MS,
  EMAIL_OTP_TTL_MS,
  generateOtpCode,
  hashOtpCode,
  normalizeEmail,
  randomBase64Url,
} from './email-auth';
import { buildEmailOtpMessage, createResendEmailSender } from './resend';
import { getAuthenticatedUser } from './auth';
import type { AccountId, Env } from '../types';

function hasSameOrigin(request: Request): boolean {
  const origin = request.headers.get('Origin');
  if (!origin) return false;
  try {
    return origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function getDirectoryStub(env: Env): DurableObjectStub {
  return env.ACCOUNT_DIRECTORY.getByName('global');
}

function getAccountStub(env: Env, accountId: AccountId): DurableObjectStub {
  return env.ACCOUNT_DO.getByName(accountId);
}

function getWorkspaceStub(env: Env, workspaceId: string): DurableObjectStub {
  return env.WORKSPACE_DO.getByName(workspaceId);
}

export async function verifyTurnstileForAction(
  request: Request,
  env: Env,
  token: unknown,
  expectedAction: string
): Promise<boolean> {
  if (!env.TURNSTILE_SECRET) return true;
  if (typeof token !== 'string' || token.length === 0 || token.length > 2048) return false;
  let hostname: string;
  try {
    hostname = new URL(request.url).hostname;
  } catch {
    return false;
  }
  const allowedHostnames = new Set(
    (env.TURNSTILE_HOSTNAMES || hostname)
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
  );
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret: env.TURNSTILE_SECRET,
        response: token,
        remoteip: request.headers.get('CF-Connecting-IP') || '',
      }),
    });
    if (!response.ok) return false;
    const result = await response.json<{ success?: boolean; action?: string; hostname?: string }>();
    return Boolean(
      result.success &&
        result.action === expectedAction &&
        typeof result.hostname === 'string' &&
        allowedHostnames.has(result.hostname.toLowerCase())
    );
  } catch {
    return false;
  }
}

export async function handleEmailOtpRequest(request: Request, env: Env): Promise<Response> {
  if (!hasSameOrigin(request)) return new Response('Forbidden', { status: 403 });
  let body: { email?: unknown; turnstile_token?: unknown };
  try {
    body = await request.json<{ email?: unknown; turnstile_token?: unknown }>();
  } catch {
    return Response.json({ error: 'Invalid request' }, { status: 400 });
  }
  const email = normalizeEmail(body.email);
  if (!email) return Response.json({ error: 'Invalid email' }, { status: 400 });
  if (!(await verifyTurnstileForAction(request, env, body.turnstile_token, 'otp_request'))) {
    return Response.json({ error: 'Turnstile verification failed' }, { status: 403 });
  }

  const otpSecret = env.RESEND_API_KEY || env.TURNSTILE_SECRET || 'cloudssh-otp-hmac-secret';
  const code = generateOtpCode();
  const now = Date.now();
  const challengeId = randomBase64Url(24);
  const directoryResponse = await getDirectoryStub(env).fetch(
    new Request('http://internal/internal/email-otp/begin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        challengeId,
        codeHash: await hashOtpCode(code, otpSecret),
        expiresAt: now + EMAIL_OTP_TTL_MS,
        resendAvailableAt: now + EMAIL_OTP_RESEND_COOLDOWN_MS,
        now,
        ip: request.headers.get('CF-Connecting-IP') || '127.0.0.1',
      }),
    })
  );
  if (!directoryResponse.ok) {
    if (directoryResponse.status === 429) {
      return Response.json({ error: 'Too many requests, please try again later' }, { status: 429 });
    }
    let result: { configurationError?: boolean } = {};
    try {
      result = await directoryResponse.json<{ configurationError?: boolean }>();
    } catch {
      /* keep generic error */
    }
    return Response.json(
      { error: result.configurationError ? 'Email OTP is not configured' : 'Unable to request OTP' },
      { status: result.configurationError ? 503 : 400 }
    );
  }
  const result = await directoryResponse.json<{ accepted?: boolean; cooldown?: boolean }>();
  if (!result.accepted || result.cooldown) {
    return Response.json({ success: true, challenge_id: challengeId });
  }

  if (env.RESEND_API_KEY && env.RESEND_FROM_EMAIL) {
    try {
      await createResendEmailSender(env)(buildEmailOtpMessage(email, code));
    } catch (e) {
      console.error('Failed to send OTP via Resend:', e);
      return Response.json(
        { error: e instanceof Error ? e.message : 'Unable to send OTP' },
        { status: 503 }
      );
    }
    return Response.json({ success: true, challenge_id: challengeId });
  }

  // Fallback: When RESEND_API_KEY is not configured yet on Cloudflare, return debug_code so user can log in
  return Response.json({
    success: true,
    challenge_id: challengeId,
    debug_code: code,
    message: 'RESEND_API_KEY 未配置，驗證碼已生成供測試',
  });
}

export async function handleEmailOtpVerify(request: Request, env: Env): Promise<Response> {
  if (!hasSameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const otpSecret = env.RESEND_API_KEY || env.TURNSTILE_SECRET || 'cloudssh-otp-hmac-secret';
  let body: { email?: unknown; challenge_id?: unknown; code?: unknown; turnstile_token?: unknown };
  try {
    body = await request.json<{
      email?: unknown;
      challenge_id?: unknown;
      code?: unknown;
      turnstile_token?: unknown;
    }>();
  } catch {
    return Response.json({ error: 'Invalid request' }, { status: 400 });
  }
  const email = normalizeEmail(body.email);
  if (!email || typeof body.code !== 'string') {
    return Response.json({ error: 'Invalid request' }, { status: 400 });
  }
  if (body.turnstile_token && !(await verifyTurnstileForAction(request, env, body.turnstile_token, 'otp_verify'))) {
    return Response.json({ error: 'Turnstile verification failed' }, { status: 403 });
  }
  const directoryResponse = await getDirectoryStub(env).fetch(
    new Request('http://internal/internal/email-otp/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        challengeId: typeof body.challenge_id === 'string' ? body.challenge_id : undefined,
        codeHash: await hashOtpCode(body.code, otpSecret),
        now: Date.now(),
      }),
    })
  );
  if (!directoryResponse.ok) return Response.json({ error: 'Invalid or expired OTP' }, { status: 401 });
  const result = await directoryResponse.json<{ verified?: boolean; accountId?: AccountId; email?: string }>();
  if (!result.verified || !result.accountId || !result.email) {
    return Response.json({ error: 'Invalid or expired OTP' }, { status: 401 });
  }

  const accountStub = getAccountStub(env, result.accountId);
  await accountStub.fetch(
    new Request('http://internal/internal/account/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account_id: result.accountId, email: result.email }),
    })
  );

  // Enroll recovery codes if not already enrolled
  let recoveryCodes: string[] | undefined;
  const enrollResponse = await accountStub.fetch(
    new Request('http://internal/internal/account/recovery/enroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account_id: result.accountId }),
    })
  );
  if (enrollResponse.ok) {
    const enrollData = await enrollResponse.json<{ codes?: string[] }>();
    if (enrollData.codes) recoveryCodes = enrollData.codes;
  }

  const workspaceResponse = await accountStub.fetch(
    new Request('http://internal/internal/account/workspaces', { method: 'GET' })
  );
  const workspaceData = await workspaceResponse.json<{
    workspaces?: Array<{ workspace_id: string; role: string }>;
  }>();
  let workspaceId = workspaceData.workspaces?.[0]?.workspace_id;
  if (!workspaceId) {
    workspaceId = `ws_${crypto.randomUUID()}`;
    await getWorkspaceStub(env, workspaceId).fetch(
      new Request('http://internal/internal/workspace/bootstrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace_id: workspaceId, name: 'My Workspace', owner_id: result.accountId }),
      })
    );
    await accountStub.fetch(
      new Request('http://internal/internal/account/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace_id: workspaceId, role: 'owner' }),
      })
    );
  }
  const sessionResponse = await accountStub.fetch(
    new Request('http://internal/internal/account/session/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account_id: result.accountId }),
    })
  );
  if (!sessionResponse.ok) return Response.json({ error: 'Unable to create session' }, { status: 503 });
  const { token } = await sessionResponse.json<{ token: string }>();
  return new Response(
    JSON.stringify({
      success: true,
      account_id: result.accountId,
      email: result.email,
      workspace_id: workspaceId,
      recovery_codes: recoveryCodes,
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': `session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`,
      },
    }
  );
}

export async function handleRecoveryLogin(request: Request, env: Env): Promise<Response> {
  if (!hasSameOrigin(request)) return new Response('Forbidden', { status: 403 });
  let body: { email?: unknown; recovery_code?: unknown; turnstile_token?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid request' }, { status: 400 });
  }
  const email = normalizeEmail(body.email);
  if (!email || typeof body.recovery_code !== 'string') {
    return Response.json({ error: 'Invalid credentials' }, { status: 401 });
  }
  if (!(await verifyTurnstileForAction(request, env, body.turnstile_token, 'recovery_login'))) {
    return Response.json({ error: 'Turnstile verification failed' }, { status: 403 });
  }
  const lookup = await getDirectoryStub(env).fetch(
    new Request('http://internal/internal/account/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
  );
  const { account_id: accountId } = await lookup.json<{ account_id?: string | null }>();
  if (!accountId?.startsWith('acc_')) return Response.json({ error: 'Invalid credentials' }, { status: 401 });

  const accountStub = getAccountStub(env, accountId as AccountId);
  const verification = await accountStub.fetch(
    new Request('http://internal/internal/account/recovery/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account_id: accountId, code: body.recovery_code }),
    })
  );
  if (!verification.ok) return Response.json({ error: 'Invalid credentials' }, { status: 401 });
  const session = await accountStub.fetch(
    new Request('http://internal/internal/account/session/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account_id: accountId }),
    })
  );
  if (!session.ok) return Response.json({ error: 'Unable to create session' }, { status: 503 });
  const { token } = await session.json<{ token: string }>();
  return new Response(JSON.stringify({ success: true, account_id: accountId, email }), {
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': `session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`,
    },
  });
}

export async function handleRecoveryStatus(request: Request, env: Env): Promise<Response> {
  const user = await getAuthenticatedUser(request, env);
  if (!user) return Response.json({ error: 'Not authenticated' }, { status: 401 });
  if (!user.account_id) {
    return Response.json({ supported: false, total: 0, remaining: 0, enrolled: false });
  }
  const accountStub = getAccountStub(env, user.account_id as AccountId);
  const statusRes = await accountStub.fetch(
    new Request('http://internal/internal/account/recovery/status', { method: 'GET' })
  );
  if (!statusRes.ok) {
    return Response.json({ error: 'Failed to retrieve recovery status' }, { status: 500 });
  }
  const data = (await statusRes.json()) as Record<string, unknown>;
  return Response.json({ supported: true, ...data });
}

export async function handleRecoveryRegenerate(request: Request, env: Env): Promise<Response> {
  if (!hasSameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const user = await getAuthenticatedUser(request, env);
  if (!user) return Response.json({ error: 'Not authenticated' }, { status: 401 });
  if (!user.account_id) {
    return Response.json({ error: 'Recovery codes are only available for email accounts' }, { status: 400 });
  }
  const accountStub = getAccountStub(env, user.account_id as AccountId);
  const regenRes = await accountStub.fetch(
    new Request('http://internal/internal/account/recovery/regenerate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account_id: user.account_id }),
    })
  );
  if (!regenRes.ok) {
    return Response.json({ error: 'Failed to regenerate recovery codes' }, { status: 500 });
  }
  const data = await regenRes.json<{ codes?: string[] }>();
  return Response.json({ success: true, codes: data.codes || [] });
}

