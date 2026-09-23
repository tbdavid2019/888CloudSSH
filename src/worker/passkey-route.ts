// Copyright (c) 2026 888CloudSSH contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import {
  base64UrlToBytes,
  getRpId,
  verifyPasskeyAssertion,
  verifyPasskeyRegistration,
} from './passkey';
import { randomBase64Url } from './email-auth';
import { getAuthenticatedUser } from './auth';
import { verifyTurnstileForAction } from './email-auth-route';
import type { Env } from '../types';
import { hasSameOrigin } from './origin-check';

function getDirectoryStub(env: Env): DurableObjectStub {
  return env.ACCOUNT_DIRECTORY.getByName('global');
}

function getAccountStub(env: Env, accountId: string): DurableObjectStub {
  return env.ACCOUNT_DO.getByName(accountId);
}

export async function handlePasskeyRegisterChallenge(request: Request, env: Env): Promise<Response> {
  if (!hasSameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const user = await getAuthenticatedUser(request, env);
  if (!user || !user.account_id) {
    return Response.json({ error: 'Passkey registration requires an email account session' }, { status: 401 });
  }

  const challenge = randomBase64Url(32);
  const rpId = getRpId(request);

  const dirRes = await getDirectoryStub(env).fetch(
    new Request('http://internal/internal/passkey-challenge/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        challenge,
        action: 'register',
        user_id: user.account_id,
        expires_at: Date.now() + 120000,
      }),
    })
  );
  if (!dirRes.ok) {
    return Response.json({ error: 'Failed to initialize passkey registration' }, { status: 500 });
  }

  // Get user profile to get email
  const accRes = await getAccountStub(env, user.account_id).fetch(
    new Request('http://internal/internal/account/profile', { method: 'GET' })
  );
  let userEmail = 'User';
  if (accRes.ok) {
    const profile = await accRes.json<{ email?: string }>();
    if (profile.email) userEmail = profile.email;
  }

  return Response.json({
    challenge,
    rp: {
      name: '888CloudSSH',
      id: rpId,
    },
    user: {
      id: user.account_id,
      name: userEmail,
      displayName: userEmail,
    },
    pubKeyCredParams: [
      { type: 'public-key', alg: -7 }, // ES256
    ],
    authenticatorSelection: {
      residentKey: 'preferred',
      requireResidentKey: false,
      userVerification: 'preferred',
    },
    timeout: 60000,
    attestation: 'none',
  });
}

export async function handlePasskeyRegister(request: Request, env: Env): Promise<Response> {
  if (!hasSameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const user = await getAuthenticatedUser(request, env);
  if (!user || !user.account_id) {
    return Response.json({ error: 'Passkey registration requires an email account session' }, { status: 401 });
  }

  let body: {
    name?: unknown;
    registration?: {
      id?: unknown;
      rawId?: unknown;
      response?: {
        clientDataJSON?: unknown;
        attestationObject?: unknown;
      };
    };
  };

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid request' }, { status: 400 });
  }

  const reg = body.registration;
  if (
    !reg ||
    typeof reg.id !== 'string' ||
    !reg.response ||
    typeof reg.response.clientDataJSON !== 'string' ||
    typeof reg.response.attestationObject !== 'string'
  ) {
    return Response.json({ error: 'Invalid WebAuthn registration payload' }, { status: 400 });
  }

  // Extract challenge from clientDataJSON
  let challenge: string;
  try {
    const clientData = JSON.parse(
      new TextDecoder('utf-8').decode(base64UrlToBytes(reg.response.clientDataJSON))
    ) as { challenge?: string };
    if (!clientData.challenge) throw new Error('Missing challenge');
    challenge = clientData.challenge;
  } catch {
    return Response.json({ error: 'Invalid clientDataJSON' }, { status: 400 });
  }

  // Consume challenge from directory
  const consumeRes = await getDirectoryStub(env).fetch(
    new Request('http://internal/internal/passkey-challenge/consume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challenge, action: 'register' }),
    })
  );
  if (!consumeRes.ok) {
    return Response.json({ error: 'Challenge consumption failed' }, { status: 400 });
  }
  const consumeData = await consumeRes.json<{ valid?: boolean; user_id?: string | null }>();
  if (!consumeData.valid || consumeData.user_id !== user.account_id) {
    return Response.json({ error: 'Invalid or expired registration challenge' }, { status: 400 });
  }

  // Verify registration
  let verifiedCred: { credentialId: string; publicKeyRawBase64: string };
  try {
    verifiedCred = await verifyPasskeyRegistration({
      attestationObjectBase64: reg.response.attestationObject,
      clientDataJsonBase64: reg.response.clientDataJSON,
      expectedChallenge: challenge,
      expectedRpId: getRpId(request),
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Passkey registration verification failed' },
      { status: 400 }
    );
  }

  const passkeyName =
    typeof body.name === 'string' && body.name.trim().length > 0
      ? body.name.trim().slice(0, 64)
      : 'Touch ID / Passkey';

  // Save passkey in AccountDO
  const addRes = await getAccountStub(env, user.account_id).fetch(
    new Request('http://internal/internal/account/passkeys/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: verifiedCred.credentialId,
        name: passkeyName,
        public_key: verifiedCred.publicKeyRawBase64,
      }),
    })
  );
  if (!addRes.ok) {
    return Response.json({ error: 'Failed to store passkey in account' }, { status: 500 });
  }

  // Index in AccountDirectoryDO
  await getDirectoryStub(env).fetch(
    new Request('http://internal/internal/passkey-index/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        credential_id: verifiedCred.credentialId,
        account_id: user.account_id,
      }),
    })
  );

  return Response.json({ success: true, id: verifiedCred.credentialId, name: passkeyName });
}

export async function handlePasskeyLoginChallenge(request: Request, env: Env): Promise<Response> {
  if (!hasSameOrigin(request)) return new Response('Forbidden', { status: 403 });

  const challenge = randomBase64Url(32);
  const rpId = getRpId(request);

  const dirRes = await getDirectoryStub(env).fetch(
    new Request('http://internal/internal/passkey-challenge/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        challenge,
        action: 'login',
        expires_at: Date.now() + 120000,
      }),
    })
  );
  if (!dirRes.ok) {
    return Response.json({ error: 'Failed to initialize passkey challenge' }, { status: 500 });
  }

  return Response.json({
    challenge,
    rpId,
    timeout: 60000,
    userVerification: 'preferred',
  });
}

export async function handlePasskeyLogin(request: Request, env: Env): Promise<Response> {
  if (!hasSameOrigin(request)) return new Response('Forbidden', { status: 403 });

  let body: {
    assertion?: {
      id?: unknown;
      rawId?: unknown;
      response?: {
        clientDataJSON?: unknown;
        authenticatorData?: unknown;
        signature?: unknown;
        userHandle?: unknown;
      };
    };
    turnstile_token?: unknown;
  };

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid request' }, { status: 400 });
  }

  const assertion = body.assertion;
  if (
    !assertion ||
    typeof assertion.id !== 'string' ||
    !assertion.response ||
    typeof assertion.response.clientDataJSON !== 'string' ||
    typeof assertion.response.authenticatorData !== 'string' ||
    typeof assertion.response.signature !== 'string'
  ) {
    return Response.json({ error: 'Invalid WebAuthn assertion payload' }, { status: 400 });
  }

  if (body.turnstile_token && !(await verifyTurnstileForAction(request, env, body.turnstile_token, 'passkey_login'))) {
    return Response.json({ error: 'Turnstile verification failed' }, { status: 403 });
  }

  // Extract challenge
  let challenge: string;
  try {
    const clientData = JSON.parse(
      new TextDecoder('utf-8').decode(base64UrlToBytes(assertion.response.clientDataJSON))
    ) as { challenge?: string };
    if (!clientData.challenge) throw new Error('Missing challenge');
    challenge = clientData.challenge;
  } catch {
    return Response.json({ error: 'Invalid clientDataJSON' }, { status: 400 });
  }

  // Consume challenge
  const consumeRes = await getDirectoryStub(env).fetch(
    new Request('http://internal/internal/passkey-challenge/consume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challenge, action: 'login' }),
    })
  );
  if (!consumeRes.ok) {
    return Response.json({ error: 'Challenge consumption failed' }, { status: 400 });
  }
  const consumeData = await consumeRes.json<{ valid?: boolean }>();
  if (!consumeData.valid) {
    return Response.json({ error: 'Invalid or expired login challenge' }, { status: 401 });
  }

  // Lookup account_id by credential_id
  const lookupRes = await getDirectoryStub(env).fetch(
    new Request('http://internal/internal/passkey-index/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential_id: assertion.id }),
    })
  );
  if (!lookupRes.ok) {
    return Response.json({ error: 'Passkey lookup failed' }, { status: 500 });
  }
  const { account_id: accountId } = await lookupRes.json<{ account_id?: string | null }>();
  if (!accountId || !accountId.startsWith('acc_')) {
    return Response.json({ error: 'Passkey not recognized' }, { status: 401 });
  }

  // Get passkey from AccountDO
  const accountStub = getAccountStub(env, accountId);
  const passkeyRes = await accountStub.fetch(
    new Request(`http://internal/internal/account/passkeys/${encodeURIComponent(assertion.id)}`, {
      method: 'GET',
    })
  );
  if (!passkeyRes.ok) {
    return Response.json({ error: 'Passkey not recognized' }, { status: 401 });
  }
  const { passkey } = await passkeyRes.json<{
    passkey: {
      id: string;
      name: string;
      public_key: string;
      counter: number;
    };
  }>();

  // Verify assertion
  try {
    await verifyPasskeyAssertion({
      publicKeyRawBase64: passkey.public_key,
      authenticatorDataBase64: assertion.response.authenticatorData,
      clientDataJsonBase64: assertion.response.clientDataJSON,
      signatureBase64: assertion.response.signature,
      expectedChallenge: challenge,
      expectedOrigin: new URL(request.url).origin,
      expectedRpId: getRpId(request),
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Passkey verification failed' },
      { status: 401 }
    );
  }

  // Extract signCount from authenticatorData
  const authDataBytes = base64UrlToBytes(assertion.response.authenticatorData);
  const signCount =
    (authDataBytes[33] << 24) |
    (authDataBytes[34] << 16) |
    (authDataBytes[35] << 8) |
    authDataBytes[36];

  // Update passkey usage in AccountDO
  await accountStub.fetch(
    new Request('http://internal/internal/account/passkeys/update-usage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: passkey.id, counter: signCount }),
    })
  );

  // Get account email
  const profileRes = await accountStub.fetch(
    new Request('http://internal/internal/account/profile', { method: 'GET' })
  );
  let email = '';
  if (profileRes.ok) {
    const profile = await profileRes.json<{ email?: string }>();
    if (profile.email) email = profile.email;
  }

  // Create session
  const sessionRes = await accountStub.fetch(
    new Request('http://internal/internal/account/session/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account_id: accountId }),
    })
  );
  if (!sessionRes.ok) {
    return Response.json({ error: 'Failed to create session' }, { status: 503 });
  }
  const { token } = await sessionRes.json<{ token: string }>();

  return new Response(
    JSON.stringify({
      success: true,
      account_id: accountId,
      email,
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': `session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`,
      },
    }
  );
}

export async function handlePasskeysList(request: Request, env: Env): Promise<Response> {
  const user = await getAuthenticatedUser(request, env);
  if (!user) return Response.json({ error: 'Not authenticated' }, { status: 401 });
  if (!user.account_id) {
    return Response.json({ passkeys: [] });
  }

  const res = await getAccountStub(env, user.account_id).fetch(
    new Request('http://internal/internal/account/passkeys', { method: 'GET' })
  );
  if (!res.ok) {
    return Response.json({ error: 'Failed to fetch passkeys' }, { status: 500 });
  }
  return res;
}

export async function handlePasskeyDelete(
  request: Request,
  env: Env,
  credentialId: string
): Promise<Response> {
  if (!hasSameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const user = await getAuthenticatedUser(request, env);
  if (!user) return Response.json({ error: 'Not authenticated' }, { status: 401 });
  if (!user.account_id) {
    return Response.json({ error: 'Operation not supported' }, { status: 400 });
  }

  const accRes = await getAccountStub(env, user.account_id).fetch(
    new Request(`http://internal/internal/account/passkeys/${encodeURIComponent(credentialId)}`, {
      method: 'DELETE',
    })
  );
  if (!accRes.ok) {
    return Response.json({ error: 'Failed to delete passkey from account' }, { status: 500 });
  }

  await getDirectoryStub(env).fetch(
    new Request('http://internal/internal/passkey-index/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential_id: credentialId }),
    })
  );

  return Response.json({ success: true });
}
