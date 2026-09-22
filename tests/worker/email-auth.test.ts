import { describe, expect, it } from 'vitest';
import {
  constantTimeEqual,
  EMAIL_OTP_MAX_ATTEMPTS,
  generateOtpCode,
  generateRecoveryCodes,
  hashOtpCode,
  hashRecoveryCode,
  isOtpExpired,
  isResendAllowed,
  normalizeEmail,
  SlidingWindowRateLimiter,
} from '../../src/worker/email-auth';

describe('email-auth helpers', () => {
  it('normalizes valid emails and rejects malformed or oversized values', () => {
    expect(normalizeEmail('  User@Example.COM ')).toBe('user@example.com');
    expect(normalizeEmail('missing-at.example.com')).toBeNull();
    expect(normalizeEmail(`a@b.${'x'.repeat(251)}`)).toBeNull();
  });

  it('generates six-digit OTP codes', () => {
    const code = generateOtpCode();
    expect(code).toMatch(/^\d{6}$/);
  });

  it('generates unique formatted recovery codes', () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.every((code) => /^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(code))).toBe(true);
  });

  it('hashes OTP and recovery values without returning plaintext', async () => {
    const otpHash = await hashOtpCode('123456', 'secret');
    const recoveryHash = await hashRecoveryCode('abcd-2345', 'salt', 'secret');
    expect(otpHash).not.toContain('123456');
    expect(recoveryHash).not.toContain('ABCD');
    expect(otpHash).toBe(await hashOtpCode('123456', 'secret'));
    expect(recoveryHash).toBe(await hashRecoveryCode('ABCD-2345', 'salt', 'secret'));
  });

  it('compares values in a length-independent loop', () => {
    expect(constantTimeEqual('abc', 'abc')).toBe(true);
    expect(constantTimeEqual('abc', 'abd')).toBe(false);
    expect(constantTimeEqual('abc', 'ab')).toBe(false);
  });

  it('handles OTP expiry and resend cooldown boundaries', () => {
    expect(isOtpExpired(1000, 999)).toBe(false);
    expect(isOtpExpired(1000, 1000)).toBe(true);
    expect(isResendAllowed(1000, 999)).toBe(false);
    expect(isResendAllowed(1000, 1000)).toBe(true);
  });

  it('limits attempts in a sliding window and allows attempts after expiry', () => {
    const limiter = new SlidingWindowRateLimiter(EMAIL_OTP_MAX_ATTEMPTS, 1000);
    for (let index = 0; index < EMAIL_OTP_MAX_ATTEMPTS; index++) {
      expect(limiter.allow('ip:1', 100 + index)).toBe(true);
    }
    expect(limiter.allow('ip:1', 200)).toBe(false);
    expect(limiter.allow('ip:1', 1100)).toBe(true);
  });
});
