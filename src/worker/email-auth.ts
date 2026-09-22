const EMAIL_MAX_LENGTH = 254;
const OTP_DIGITS = 6;
const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const EMAIL_OTP_TTL_MS = 10 * 60 * 1000;
export const EMAIL_OTP_RESEND_COOLDOWN_MS = 60 * 1000;
export const EMAIL_OTP_MAX_ATTEMPTS = 5;
export const RECOVERY_CODE_COUNT = 10;
export const RECOVERY_LOCKOUT_MS = 15 * 60 * 1000;

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (
    normalized.length === 0 ||
    normalized.length > EMAIL_MAX_LENGTH ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
  ) {
    return null;
  }
  return normalized;
}

export function generateOtpCode(): string {
  const range = 0x1_0000_0000;
  const limit = range - (range % 1_000_000);
  const buffer = new Uint32Array(1);
  do {
    crypto.getRandomValues(buffer);
  } while (buffer[0] >= limit);
  return String(buffer[0] % 1_000_000).padStart(OTP_DIGITS, '0');
}

export function generateRecoveryCodes(count: number = RECOVERY_CODE_COUNT): string[] {
  if (!Number.isInteger(count) || count < 1 || count > 100) {
    throw new Error('Invalid recovery code count');
  }
  const codes: string[] = [];
  const buffer = new Uint8Array(8);
  for (let index = 0; index < count; index++) {
    crypto.getRandomValues(buffer);
    let raw = '';
    for (const byte of buffer) raw += RECOVERY_ALPHABET[byte % RECOVERY_ALPHABET.length];
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4)}`);
  }
  return codes;
}

export async function hmacSha256(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return toBase64Url(new Uint8Array(signature));
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return toBase64Url(new Uint8Array(digest));
}

export function randomBase64Url(byteLength: number): string {
  if (!Number.isInteger(byteLength) || byteLength < 16 || byteLength > 128) {
    throw new Error('Invalid random byte length');
  }
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return toBase64Url(bytes);
}

export async function hashOtpCode(code: string, secret: string): Promise<string> {
  return hmacSha256(`otp:${code}`, secret);
}

export async function hashRecoveryCode(
  code: string,
  accountSalt: string,
  secret: string
): Promise<string> {
  return hmacSha256(`recovery:${accountSalt}:${code.trim().toUpperCase()}`, secret);
}

export function constantTimeEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index++) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

export function isOtpExpired(expiresAt: number, now: number = Date.now()): boolean {
  return !Number.isFinite(expiresAt) || now >= expiresAt;
}

export function isResendAllowed(nextAllowedAt: number, now: number = Date.now()): boolean {
  return !Number.isFinite(nextAllowedAt) || now >= nextAllowedAt;
}

export class SlidingWindowRateLimiter {
  private readonly entries = new Map<string, number[]>();

  constructor(
    private readonly maxAttempts: number,
    private readonly windowMs: number,
    private readonly maxEntries: number = 10_000
  ) {}

  allow(key: string, now: number = Date.now()): boolean {
    const timestamps = (this.entries.get(key) || []).filter(
      (timestamp) => now - timestamp < this.windowMs
    );
    if (timestamps.length >= this.maxAttempts) {
      this.entries.set(key, timestamps);
      return false;
    }
    timestamps.push(now);
    this.entries.set(key, timestamps);
    this.trim(now);
    return true;
  }

  clear(key: string): void {
    this.entries.delete(key);
  }

  private trim(now: number): void {
    for (const [key, timestamps] of this.entries) {
      const active = timestamps.filter((timestamp) => now - timestamp < this.windowMs);
      if (active.length === 0) this.entries.delete(key);
      else this.entries.set(key, active);
    }
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (typeof oldest !== 'string') break;
      this.entries.delete(oldest);
    }
  }
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
