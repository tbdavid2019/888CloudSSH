import { describe, expect, it } from 'vitest';
import { hasSameOrigin, hasSameWebSocketOrigin } from '../../src/worker/origin-check';

describe('origin-check module', () => {
  describe('hasSameOrigin', () => {
    it('allows requests with Sec-Fetch-Site: same-origin or none', () => {
      const reqSame = new Request('https://ssh.david888.com/api/auth/email/request', {
        headers: { 'Sec-Fetch-Site': 'same-origin' },
      });
      expect(hasSameOrigin(reqSame)).toBe(true);

      const reqNone = new Request('https://ssh.david888.com/api/auth/email/request', {
        headers: { 'Sec-Fetch-Site': 'none' },
      });
      expect(hasSameOrigin(reqNone)).toBe(true);
    });

    it('rejects requests with Sec-Fetch-Site: cross-site', () => {
      const req = new Request('https://ssh.david888.com/api/auth/email/request', {
        headers: {
          'Sec-Fetch-Site': 'cross-site',
          Origin: 'https://evil.com',
        },
      });
      expect(hasSameOrigin(req)).toBe(false);
    });

    it('allows same host even if Edge protocol differs (http inside worker vs https client origin)', () => {
      const req = new Request('http://ssh.david888.com/api/auth/email/request', {
        headers: {
          Origin: 'https://ssh.david888.com',
        },
      });
      expect(hasSameOrigin(req)).toBe(true);
    });

    it('rejects cross-origin requests when Origin does not match', () => {
      const req = new Request('https://ssh.david888.com/api/auth/email/request', {
        headers: {
          Origin: 'https://attacker.org',
        },
      });
      expect(hasSameOrigin(req)).toBe(false);
    });

    it('falls back to Referer if Origin is omitted', () => {
      const reqGoodReferer = new Request('https://ssh.david888.com/api/auth/email/request', {
        headers: {
          Referer: 'https://ssh.david888.com/login',
        },
      });
      expect(hasSameOrigin(reqGoodReferer)).toBe(true);

      const reqBadReferer = new Request('https://ssh.david888.com/api/auth/email/request', {
        headers: {
          Referer: 'https://malicious.com/phish',
        },
      });
      expect(hasSameOrigin(reqBadReferer)).toBe(false);
    });

    it('allows requests when no origin or referer is present (non-browser clients)', () => {
      const req = new Request('https://ssh.david888.com/api/auth/email/request');
      expect(hasSameOrigin(req)).toBe(true);
    });
  });

  describe('hasSameWebSocketOrigin', () => {
    const url = new URL('https://ssh.david888.com/api/ssh');

    it('allows WebSocket when Sec-Fetch-Site: same-origin', () => {
      const req = new Request('https://ssh.david888.com/api/ssh', {
        headers: { 'Sec-Fetch-Site': 'same-origin' },
      });
      expect(hasSameWebSocketOrigin(req, url)).toBe(true);
    });

    it('rejects WebSocket when Sec-Fetch-Site: cross-site', () => {
      const req = new Request('https://ssh.david888.com/api/ssh', {
        headers: {
          'Sec-Fetch-Site': 'cross-site',
          Origin: 'https://ssh.david888.com',
        },
      });
      expect(hasSameWebSocketOrigin(req, url)).toBe(false);
    });

    it('rejects WebSocket when Origin is missing', () => {
      const req = new Request('https://ssh.david888.com/api/ssh');
      expect(hasSameWebSocketOrigin(req, url)).toBe(false);
    });

    it('allows WebSocket when Origin host matches URL host', () => {
      const req = new Request('https://ssh.david888.com/api/ssh', {
        headers: { Origin: 'https://ssh.david888.com' },
      });
      expect(hasSameWebSocketOrigin(req, url)).toBe(true);
    });

    it('allows WebSocket when Origin host matches even if protocols differ', () => {
      const workerUrl = new URL('http://ssh.david888.com/api/ssh');
      const req = new Request('http://ssh.david888.com/api/ssh', {
        headers: { Origin: 'https://ssh.david888.com' },
      });
      expect(hasSameWebSocketOrigin(req, workerUrl)).toBe(true);
    });

    it('rejects WebSocket when Origin host does not match', () => {
      const req = new Request('https://ssh.david888.com/api/ssh', {
        headers: { Origin: 'https://evil-site.com' },
      });
      expect(hasSameWebSocketOrigin(req, url)).toBe(false);
    });
  });
});
