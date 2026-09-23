import { describe, expect, it, vi } from 'vitest';
import {
  handlePasskeyRegisterChallenge,
  handlePasskeyRegister,
  handlePasskeyLoginChallenge,
  handlePasskeyLogin,
  handlePasskeysList,
  handlePasskeyDelete,
} from '../../src/worker/passkey-route';
import { bytesToBase64Url } from '../../src/worker/passkey';

function request(path: string, body?: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`https://ssh.david888.com${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      Origin: 'https://ssh.david888.com',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

describe('Passkey API routes', () => {
  it('rejects registration challenge if user is not authenticated', async () => {
    const env = {
      ACCOUNT_DIRECTORY: { getByName: vi.fn() },
      ACCOUNT_DO: { getByName: vi.fn() },
    } as any;

    const res = await handlePasskeyRegisterChallenge(
      request('/api/auth/passkey/register-challenge', {}),
      env
    );
    expect(res.status).toBe(401);
  });

  it('generates registration challenge for authenticated email user', async () => {
    const dirFetch = vi.fn().mockResolvedValue(Response.json({ success: true }));
    const accFetch = vi.fn().mockImplementation(async (req: Request) => {
      const url = new URL(req.url);
      if (url.pathname === '/internal/account/session/verify') {
        return Response.json({ id: 'acc_123', account_id: 'acc_123', email: 'test@david888.com' });
      }
      if (url.pathname === '/internal/account/profile') {
        return Response.json({ account_id: 'acc_123', email: 'test@david888.com' });
      }
      return Response.json({}, { status: 404 });
    });

    const userDbStub = { fetch: vi.fn().mockResolvedValue(Response.json({ id: 1 })) };
    const env = {
      ACCOUNT_DIRECTORY: { getByName: () => ({ fetch: dirFetch }) },
      ACCOUNT_DO: { getByName: () => ({ fetch: accFetch }) },
      USER_DB: { idFromName: () => ({}), get: () => userDbStub },
    } as any;

    const res = await handlePasskeyRegisterChallenge(
      request('/api/auth/passkey/register-challenge', {}, { Cookie: 'session=acc:acc_123:secret' }),
      env
    );

    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.challenge).toBeDefined();
    expect(data.rp.id).toBe('ssh.david888.com');
    expect(data.user.id).toBe('acc_123');
    expect(data.user.name).toBe('test@david888.com');
    expect(data.pubKeyCredParams).toEqual([{ type: 'public-key', alg: -7 }]);
  });

  it('generates public login challenge', async () => {
    const dirFetch = vi.fn().mockResolvedValue(Response.json({ success: true }));
    const env = {
      ACCOUNT_DIRECTORY: { getByName: () => ({ fetch: dirFetch }) },
    } as any;

    const res = await handlePasskeyLoginChallenge(
      request('/api/auth/passkey/login-challenge', {}),
      env
    );

    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.challenge).toBeDefined();
    expect(data.rpId).toBe('ssh.david888.com');
  });

  it('lists and deletes user passkeys', async () => {
    const mockPasskeys = [
      { id: 'cred_1', name: 'MacBook Touch ID', created_at: 1000, last_used_at: null },
    ];
    const accFetch = vi.fn().mockImplementation(async (req: Request) => {
      const url = new URL(req.url);
      if (url.pathname === '/internal/account/session/verify') {
        return Response.json({ id: 'acc_123', account_id: 'acc_123', email: 'test@david888.com' });
      }
      if (url.pathname === '/internal/account/passkeys' && req.method === 'GET') {
        return Response.json({ passkeys: mockPasskeys });
      }
      if (url.pathname === '/internal/account/passkeys/cred_1' && req.method === 'DELETE') {
        return Response.json({ success: true });
      }
      return Response.json({}, { status: 404 });
    });
    const dirFetch = vi.fn().mockResolvedValue(Response.json({ success: true }));

    const userDbStub = { fetch: vi.fn().mockResolvedValue(Response.json({ id: 1 })) };
    const env = {
      ACCOUNT_DIRECTORY: { getByName: () => ({ fetch: dirFetch }) },
      ACCOUNT_DO: { getByName: () => ({ fetch: accFetch }) },
      USER_DB: { idFromName: () => ({}), get: () => userDbStub },
    } as any;

    // List
    const listRes = await handlePasskeysList(
      request('/api/user/passkeys', undefined, { Cookie: 'session=acc:acc_123:secret' }),
      env
    );
    expect(listRes.status).toBe(200);
    const listData = (await listRes.json()) as any;
    expect(listData.passkeys).toEqual(mockPasskeys);

    // Delete
    const delReq = new Request('https://ssh.david888.com/api/user/passkeys/cred_1', {
      method: 'DELETE',
      headers: {
        Origin: 'https://ssh.david888.com',
        Cookie: 'session=acc:acc_123:secret',
      },
    });
    const delRes = await handlePasskeyDelete(delReq, env, 'cred_1');
    expect(delRes.status).toBe(200);
    const delData = (await delRes.json()) as any;
    expect(delData.success).toBe(true);
    expect(dirFetch).toHaveBeenCalled();
  });

  it('rejects passkey login if challenge is invalid or expired', async () => {
    const dirFetch = vi.fn().mockImplementation(async (req: Request) => {
      const url = new URL(req.url);
      if (url.pathname === '/internal/passkey-challenge/consume') {
        return Response.json({ valid: false });
      }
      return Response.json({});
    });
    const env = {
      ACCOUNT_DIRECTORY: { getByName: () => ({ fetch: dirFetch }) },
    } as any;

    const clientDataBytes = new TextEncoder().encode(
      JSON.stringify({ type: 'webauthn.get', challenge: 'expired_ch' })
    );
    const res = await handlePasskeyLogin(
      request('/api/auth/passkey/login', {
        assertion: {
          id: 'cred_1',
          rawId: 'cred_1',
          response: {
            clientDataJSON: bytesToBase64Url(clientDataBytes),
            authenticatorData: 'dGVzdA',
            signature: 'dGVzdA',
          },
        },
      }),
      env
    );
    expect(res.status).toBe(401);
  });

  it('authenticates user and returns session cookie upon valid passkey assertion', async () => {
    // 1. Generate real P-256 keypair
    const keyPair = (await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify']
    )) as CryptoKeyPair;
    const rawPublicKey = new Uint8Array(
      (await crypto.subtle.exportKey('raw', keyPair.publicKey)) as ArrayBuffer
    );
    const publicKeyRawBase64 = bytesToBase64Url(rawPublicKey);

    // 2. Mock authenticatorData
    const rpId = 'ssh.david888.com';
    const rpIdHash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rpId)));
    const authData = new Uint8Array(37);
    authData.set(rpIdHash, 0);
    authData[32] = 0x01; // UP
    authData[36] = 5; // signCount = 5
    const authDataBase64 = bytesToBase64Url(authData);

    // 3. Mock clientDataJSON
    const challenge = 'valid_login_challenge_123';
    const origin = 'https://ssh.david888.com';
    const clientDataBytes = new TextEncoder().encode(
      JSON.stringify({
        type: 'webauthn.get',
        challenge,
        origin,
      })
    );
    const clientDataJsonBase64 = bytesToBase64Url(clientDataBytes);

    // 4. Sign payload
    const clientDataHash = await crypto.subtle.digest('SHA-256', clientDataBytes);
    const signedData = new Uint8Array(authData.length + 32);
    signedData.set(authData, 0);
    signedData.set(new Uint8Array(clientDataHash), authData.length);

    const p1363Signature = new Uint8Array(
      await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keyPair.privateKey, signedData)
    );

    // Convert to DER
    let r = p1363Signature.slice(0, 32);
    let s = p1363Signature.slice(32, 64);
    while (r.length > 1 && r[0] === 0) r = r.slice(1);
    while (s.length > 1 && s[0] === 0) s = s.slice(1);
    if (r[0] & 0x80) {
      const newR = new Uint8Array(r.length + 1);
      newR.set(r, 1);
      r = newR;
    }
    if (s[0] & 0x80) {
      const newS = new Uint8Array(s.length + 1);
      newS.set(s, 1);
      s = newS;
    }
    const der = new Uint8Array(6 + r.length + s.length);
    let idx = 0;
    der[idx++] = 0x30;
    der[idx++] = 4 + r.length + s.length;
    der[idx++] = 0x02;
    der[idx++] = r.length;
    der.set(r, idx);
    idx += r.length;
    der[idx++] = 0x02;
    der[idx++] = s.length;
    der.set(s, idx);
    const signatureBase64 = bytesToBase64Url(der);

    // 5. Mock DOs
    const dirFetch = vi.fn().mockImplementation(async (req: Request) => {
      const url = new URL(req.url);
      if (url.pathname === '/internal/passkey-challenge/consume') {
        return Response.json({ valid: true });
      }
      if (url.pathname === '/internal/passkey-index/lookup') {
        return Response.json({ account_id: 'acc_abc123' });
      }
      return Response.json({}, { status: 404 });
    });

    const accFetch = vi.fn().mockImplementation(async (req: Request) => {
      const url = new URL(req.url);
      if (url.pathname === '/internal/account/passkeys/my_cred_id') {
        return Response.json({
          passkey: {
            id: 'my_cred_id',
            name: 'MacBook Touch ID',
            public_key: publicKeyRawBase64,
            counter: 0,
          },
        });
      }
      if (url.pathname === '/internal/account/passkeys/update-usage') {
        return Response.json({ success: true });
      }
      if (url.pathname === '/internal/account/profile') {
        return Response.json({ account_id: 'acc_abc123', email: 'owner@david888.com' });
      }
      if (url.pathname === '/internal/account/session/create') {
        return Response.json({ token: 'acc:acc_abc123:session_token_xyz' });
      }
      return Response.json({}, { status: 404 });
    });

    const env = {
      ACCOUNT_DIRECTORY: { getByName: () => ({ fetch: dirFetch }) },
      ACCOUNT_DO: { getByName: () => ({ fetch: accFetch }) },
    } as any;

    const res = await handlePasskeyLogin(
      request('/api/auth/passkey/login', {
        assertion: {
          id: 'my_cred_id',
          rawId: 'my_cred_id',
          response: {
            clientDataJSON: clientDataJsonBase64,
            authenticatorData: authDataBase64,
            signature: signatureBase64,
          },
        },
      }),
      env
    );

    expect(res.status).toBe(200);
    const setCookie = res.headers.get('Set-Cookie');
    expect(setCookie).toContain('session=acc:acc_abc123:session_token_xyz');
    expect(setCookie).toContain('HttpOnly');
    const data = (await res.json()) as any;
    expect(data.success).toBe(true);
    expect(data.account_id).toBe('acc_abc123');
    expect(data.email).toBe('owner@david888.com');
  });
});
