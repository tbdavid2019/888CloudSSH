// Copyright (c) 2026 888CloudSSH contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Base64URL string to Uint8Array converter
 */
export function base64UrlToBytes(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4 === 0 ? '' : '='.repeat(4 - (base64.length % 4));
  const binary = atob(base64 + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Uint8Array to Base64URL string converter
 */
export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Converts an ASN.1 DER ECDSA signature (from browser WebAuthn)
 * into a fixed 64-byte IEEE P1363 signature (required by Web Crypto crypto.subtle.verify).
 */
export function derToP1363(derBytes: Uint8Array): Uint8Array {
  let offset = 0;
  if (derBytes[offset++] !== 0x30) {
    throw new Error('Invalid DER signature: expected sequence (0x30)');
  }
  let seqLen = derBytes[offset++];
  if (seqLen & 0x80) {
    const bytesCount = seqLen & 0x7f;
    offset += bytesCount;
  }

  if (derBytes[offset++] !== 0x02) {
    throw new Error('Invalid DER signature: expected integer marker (0x02) for r');
  }
  const rLen = derBytes[offset++];
  let r = derBytes.slice(offset, offset + rLen);
  offset += rLen;

  if (derBytes[offset++] !== 0x02) {
    throw new Error('Invalid DER signature: expected integer marker (0x02) for s');
  }
  const sLen = derBytes[offset++];
  let s = derBytes.slice(offset, offset + sLen);

  if (r.length === 33 && r[0] === 0x00) r = r.slice(1);
  if (s.length === 33 && s[0] === 0x00) s = s.slice(1);

  if (r.length > 32 || s.length > 32) {
    throw new Error('Invalid DER signature: r or s integer exceeds 32 bytes');
  }

  const p1363 = new Uint8Array(64);
  p1363.set(r, 32 - r.length);
  p1363.set(s, 64 - s.length);
  return p1363;
}

/**
 * Minimal recursive CBOR reader
 */
class CborReader {
  private offset = 0;
  constructor(private data: Uint8Array) {}

  get hasMore(): boolean {
    return this.offset < this.data.length;
  }

  get currentOffset(): number {
    return this.offset;
  }

  read(): any {
    if (this.offset >= this.data.length) throw new Error('Unexpected end of CBOR data');
    const initialByte = this.data[this.offset++];
    const majorType = initialByte >> 5;
    const additionalInfo = initialByte & 0x1f;

    let length: number;
    if (additionalInfo < 24) {
      length = additionalInfo;
    } else if (additionalInfo === 24) {
      length = this.data[this.offset++];
    } else if (additionalInfo === 25) {
      length = (this.data[this.offset++] << 8) | this.data[this.offset++];
    } else if (additionalInfo === 26) {
      length =
        (this.data[this.offset++] << 24) |
        (this.data[this.offset++] << 16) |
        (this.data[this.offset++] << 8) |
        this.data[this.offset++];
    } else {
      throw new Error(`Unsupported CBOR additional info: ${additionalInfo}`);
    }

    switch (majorType) {
      case 0: // Unsigned integer
        return length;
      case 1: // Negative integer (-1 - length)
        return -1 - length;
      case 2: {
        // Byte string
        const bytes = this.data.slice(this.offset, this.offset + length);
        this.offset += length;
        return bytes;
      }
      case 3: {
        // Text string
        const bytes = this.data.slice(this.offset, this.offset + length);
        this.offset += length;
        return new TextDecoder().decode(bytes);
      }
      case 4: {
        // Array
        const arr = [];
        for (let i = 0; i < length; i++) {
          arr.push(this.read());
        }
        return arr;
      }
      case 5: {
        // Map
        const map = new Map<any, any>();
        for (let i = 0; i < length; i++) {
          const key = this.read();
          const val = this.read();
          map.set(key, val);
        }
        return map;
      }
      default:
        throw new Error(`Unsupported CBOR major type: ${majorType}`);
    }
  }
}

/**
 * Extracts credentialId and 65-byte uncompressed P-256 public key from attestationObject.
 */
export function parseAttestationObject(attestationObjectBytes: Uint8Array): {
  credentialId: string;
  credentialIdBytes: Uint8Array;
  publicKeyRaw: Uint8Array;
  authData: Uint8Array;
} {
  const reader = new CborReader(attestationObjectBytes);
  const root = reader.read();
  if (!(root instanceof Map)) {
    throw new Error('Invalid attestationObject: root is not a CBOR map');
  }

  const authData = root.get('authData') as Uint8Array | undefined;
  if (!authData || !(authData instanceof Uint8Array)) {
    throw new Error('Invalid attestationObject: missing authData');
  }

  // authData structure:
  // 0..31: rpIdHash (32)
  // 32: flags (1)
  // 33..36: signCount (4)
  // 37..52: aaguid (16)
  // 53..54: credentialIdLength (2)
  // 55..(55+L): credentialId (L)
  // (55+L)..: COSE Key
  if (authData.length < 55) {
    throw new Error('authData is too short');
  }

  const flags = authData[32];
  if (!(flags & 0x40)) {
    throw new Error('Attested credential data flag (AT) not set in authData');
  }

  const credIdLen = (authData[53] << 8) | authData[54];
  if (authData.length < 55 + credIdLen) {
    throw new Error('authData truncated at credentialId');
  }

  const credIdBytes = authData.slice(55, 55 + credIdLen);
  const credentialId = bytesToBase64Url(credIdBytes);

  const coseBytes = authData.slice(55 + credIdLen);
  const coseReader = new CborReader(coseBytes);
  const coseMap = coseReader.read();

  if (!(coseMap instanceof Map)) {
    throw new Error('Invalid COSE Key: not a CBOR map');
  }

  // COSE Key for P-256:
  // 1: 2 (kty: EC2)
  // 3: -7 (alg: ES256)
  // -1: 1 (crv: P-256)
  // -2: 32 bytes of x
  // -3: 32 bytes of y
  const x = coseMap.get(-2) as Uint8Array | undefined;
  const y = coseMap.get(-3) as Uint8Array | undefined;

  if (!x || !y || x.length !== 32 || y.length !== 32) {
    throw new Error('Invalid COSE key coordinates for P-256');
  }

  // Uncompressed P-256 point: 0x04 + x + y (65 bytes)
  const publicKeyRaw = new Uint8Array(65);
  publicKeyRaw[0] = 0x04;
  publicKeyRaw.set(x, 1);
  publicKeyRaw.set(y, 33);

  return {
    credentialId,
    credentialIdBytes: credIdBytes,
    publicKeyRaw,
    authData,
  };
}

export interface VerifyRegistrationOptions {
  attestationObjectBase64: string;
  clientDataJsonBase64: string;
  expectedChallenge: string;
  expectedOrigin?: string;
  expectedRpId: string;
}

/**
 * Cryptographically verifies WebAuthn Registration response using native Web Crypto.
 */
export async function verifyPasskeyRegistration({
  attestationObjectBase64,
  clientDataJsonBase64,
  expectedChallenge,
  expectedOrigin,
  expectedRpId,
}: VerifyRegistrationOptions): Promise<{
  credentialId: string;
  publicKeyRawBase64: string;
}> {
  const clientDataBytes = base64UrlToBytes(clientDataJsonBase64);
  const clientDataJson = new TextDecoder('utf-8').decode(clientDataBytes);
  const clientData = JSON.parse(clientDataJson) as {
    type?: string;
    challenge?: string;
    origin?: string;
  };

  if (clientData.type !== 'webauthn.create') {
    throw new Error(`Invalid clientData type: ${clientData.type}`);
  }
  if (clientData.challenge !== expectedChallenge) {
    throw new Error('WebAuthn challenge mismatch');
  }
  if (expectedOrigin && clientData.origin !== expectedOrigin) {
    throw new Error(`WebAuthn origin mismatch: expected ${expectedOrigin}, got ${clientData.origin}`);
  }

  const attestationBytes = base64UrlToBytes(attestationObjectBase64);
  const { credentialId, publicKeyRaw, authData } = parseAttestationObject(attestationBytes);

  // Check RP ID hash in authData
  const expectedRpIdHash = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(expectedRpId))
  );
  for (let i = 0; i < 32; i++) {
    if (authData[i] !== expectedRpIdHash[i]) {
      throw new Error('authenticatorData RP ID hash mismatch');
    }
  }

  // Check User Presence (UP) flag (bit 0)
  if (!(authData[32] & 0x01)) {
    throw new Error('User Presence (UP) flag not set in authenticatorData');
  }

  return {
    credentialId,
    publicKeyRawBase64: bytesToBase64Url(publicKeyRaw),
  };
}

export interface VerifyAssertionOptions {
  publicKeyRawBase64: string;
  authenticatorDataBase64: string;
  clientDataJsonBase64: string;
  signatureBase64: string;
  expectedChallenge: string;
  expectedOrigin: string;
  expectedRpId: string;
}

/**
 * Cryptographically verifies WebAuthn Authentication assertion using native Web Crypto.
 */
export async function verifyPasskeyAssertion({
  publicKeyRawBase64,
  authenticatorDataBase64,
  clientDataJsonBase64,
  signatureBase64,
  expectedChallenge,
  expectedOrigin,
  expectedRpId,
}: VerifyAssertionOptions): Promise<boolean> {
  const clientDataBytes = base64UrlToBytes(clientDataJsonBase64);
  const clientDataJson = new TextDecoder('utf-8').decode(clientDataBytes);
  const clientData = JSON.parse(clientDataJson) as {
    type?: string;
    challenge?: string;
    origin?: string;
  };

  if (clientData.type !== 'webauthn.get') {
    throw new Error(`Invalid clientData type: ${clientData.type}`);
  }
  if (clientData.challenge !== expectedChallenge) {
    throw new Error('WebAuthn challenge mismatch');
  }
  if (expectedOrigin && clientData.origin !== expectedOrigin) {
    throw new Error(`WebAuthn origin mismatch: expected ${expectedOrigin}, got ${clientData.origin}`);
  }

  const authDataBytes = base64UrlToBytes(authenticatorDataBase64);
  if (authDataBytes.length < 37) {
    throw new Error('authenticatorData is too short');
  }

  // 1. RP ID Hash check
  const expectedRpIdHash = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(expectedRpId))
  );
  for (let i = 0; i < 32; i++) {
    if (authDataBytes[i] !== expectedRpIdHash[i]) {
      throw new Error('authenticatorData RP ID hash mismatch');
    }
  }

  // 2. User Present flag check
  const flags = authDataBytes[32];
  if (!(flags & 0x01)) {
    throw new Error('User Presence (UP) flag not set in authenticatorData');
  }

  // 3. Assemble signed payload: authenticatorData || SHA-256(clientDataJSON)
  const clientDataHash = await crypto.subtle.digest('SHA-256', clientDataBytes);
  const signedData = new Uint8Array(authDataBytes.length + 32);
  signedData.set(authDataBytes, 0);
  signedData.set(new Uint8Array(clientDataHash), authDataBytes.length);

  // 4. Import public key
  const publicKeyBytes = base64UrlToBytes(publicKeyRawBase64);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    publicKeyBytes,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify']
  );

  // 5. Convert ASN.1 DER signature to IEEE P1363
  const derSig = base64UrlToBytes(signatureBase64);
  const p1363Sig = derToP1363(derSig);

  // 6. Verify signature
  return crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    cryptoKey,
    p1363Sig,
    signedData
  );
}

/**
 * Extracts RP ID from request URL
 */
export function getRpId(request: Request): string {
  const url = new URL(request.url);
  return url.hostname;
}
