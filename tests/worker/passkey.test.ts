import { describe, expect, it } from 'vitest';
import {
  base64UrlToBytes,
  bytesToBase64Url,
  derToP1363,
  getRpId,
  verifyPasskeyAssertion,
} from '../../src/worker/passkey';

// Helper to convert IEEE P1363 (64 bytes) to ASN.1 DER for ECDSA
function p1363ToDer(p1363: Uint8Array): Uint8Array {
  let r = p1363.slice(0, 32);
  let s = p1363.slice(32, 64);

  // Strip leading zeros if present, unless needed for positive sign
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
  return der;
}

describe('Passkey cryptographic utilities', () => {
  it('converts base64url to bytes and back', () => {
    const original = new Uint8Array([0, 1, 255, 128, 64, 32, 16]);
    const b64 = bytesToBase64Url(original);
    const converted = base64UrlToBytes(b64);
    expect(converted).toEqual(original);
  });

  it('converts ASN.1 DER ECDSA signature to IEEE P1363 64-byte signature', () => {
    const dummyP1363 = new Uint8Array(64);
    dummyP1363.fill(0x12, 0, 32);
    dummyP1363.fill(0x34, 32, 64);

    const der = p1363ToDer(dummyP1363);
    const backToP1363 = derToP1363(der);
    expect(backToP1363.length).toBe(64);
    expect(backToP1363).toEqual(dummyP1363);
  });

  it('extracts rpId correctly from request URL', () => {
    const req = new Request('https://ssh.david888.com:8443/api/test');
    expect(getRpId(req)).toBe('ssh.david888.com');

    const reqLocal = new Request('http://localhost:8787/api/test');
    expect(getRpId(reqLocal)).toBe('localhost');
  });

  it('cryptographically verifies a real WebAuthn Assertion using Web Crypto ECDSA P-256', async () => {
    // 1. Generate P-256 keypair
    const keyPair = (await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify']
    )) as CryptoKeyPair;

    // 2. Export raw public key (65 bytes: 0x04 || x || y)
    const rawPublicKey = new Uint8Array(
      (await crypto.subtle.exportKey('raw', keyPair.publicKey)) as ArrayBuffer
    );
    expect(rawPublicKey.length).toBe(65);
    expect(rawPublicKey[0]).toBe(0x04);
    const publicKeyRawBase64 = bytesToBase64Url(rawPublicKey);

    // 3. Construct mock authenticatorData
    const rpId = 'ssh.david888.com';
    const rpIdHash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rpId)));
    const authData = new Uint8Array(37);
    authData.set(rpIdHash, 0);
    authData[32] = 0x01; // flags: User Present (UP) = 1
    authData[33] = 0; // signCount
    authData[34] = 0;
    authData[35] = 0;
    authData[36] = 1;
    const authDataBase64 = bytesToBase64Url(authData);

    // 4. Construct mock clientDataJSON
    const challenge = 'test_challenge_1234567890';
    const origin = 'https://ssh.david888.com';
    const clientDataObj = {
      type: 'webauthn.get',
      challenge,
      origin,
    };
    const clientDataBytes = new TextEncoder().encode(JSON.stringify(clientDataObj));
    const clientDataJsonBase64 = bytesToBase64Url(clientDataBytes);

    // 5. Assemble Signed Data: authData || SHA-256(clientDataJSON)
    const clientDataHash = await crypto.subtle.digest('SHA-256', clientDataBytes);
    const signedData = new Uint8Array(authData.length + 32);
    signedData.set(authData, 0);
    signedData.set(new Uint8Array(clientDataHash), authData.length);

    // 6. Sign with private key (Web Crypto returns IEEE P1363)
    const p1363Signature = new Uint8Array(
      await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keyPair.privateKey, signedData)
    );

    // 7. Convert P1363 to DER to simulate real browser WebAuthn response
    const derSignature = p1363ToDer(p1363Signature);
    const signatureBase64 = bytesToBase64Url(derSignature);

    // 8. Verify using verifyPasskeyAssertion
    const isValid = await verifyPasskeyAssertion({
      publicKeyRawBase64,
      authenticatorDataBase64: authDataBase64,
      clientDataJsonBase64,
      signatureBase64,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRpId: rpId,
    });

    expect(isValid).toBe(true);
  });

  it('rejects assertion when challenge mismatches', async () => {
    const keyPair = (await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify']
    )) as CryptoKeyPair;
    const rawPublicKey = new Uint8Array(
      (await crypto.subtle.exportKey('raw', keyPair.publicKey)) as ArrayBuffer
    );
    const publicKeyRawBase64 = bytesToBase64Url(rawPublicKey);

    const rpId = 'ssh.david888.com';
    const rpIdHash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rpId)));
    const authData = new Uint8Array(37);
    authData.set(rpIdHash, 0);
    authData[32] = 0x01;

    const clientDataObj = {
      type: 'webauthn.get',
      challenge: 'wrong_challenge',
      origin: 'https://ssh.david888.com',
    };
    const clientDataBytes = new TextEncoder().encode(JSON.stringify(clientDataObj));

    await expect(
      verifyPasskeyAssertion({
        publicKeyRawBase64,
        authenticatorDataBase64: bytesToBase64Url(authData),
        clientDataJsonBase64: bytesToBase64Url(clientDataBytes),
        signatureBase64: 'dummy',
        expectedChallenge: 'correct_challenge',
        expectedOrigin: 'https://ssh.david888.com',
        expectedRpId: rpId,
      })
    ).rejects.toThrow('challenge mismatch');
  });
});
