import { SlidingWindowRateLimiter, normalizeEmail, sha256 } from './email-auth';
import type { AccountId, Env } from '../types';

/** Global email/account index and invitation/OTP coordination boundary. */
export class AccountDirectoryDO {
  private env: Env;
  private db: any;
  private ipRateLimiter = new SlidingWindowRateLimiter(10, 15 * 60 * 1000);

  constructor(state: DurableObjectState, env: Env) {
    this.env = env;
    this.db = (state.storage as any).sql;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS account_directory (
        account_id TEXT PRIMARY KEY,
        email_hash TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS otp_challenges (
        id TEXT PRIMARY KEY,
        email_hash TEXT NOT NULL,
        code_hash TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        resend_available_at INTEGER NOT NULL,
        failed_attempts INTEGER NOT NULL DEFAULT 0,
        consumed_at INTEGER DEFAULT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_otp_email_hash
        ON otp_challenges(email_hash, created_at DESC);
      CREATE TABLE IF NOT EXISTS workspace_invitations (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        email_hash TEXT NOT NULL,
        role TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        revoked_at INTEGER DEFAULT NULL,
        accepted_at INTEGER DEFAULT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_workspace_invitations_email
        ON workspace_invitations(email_hash, created_at DESC);
    `);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/internal/email-otp/begin' && request.method === 'POST') {
      return this.handleOtpBegin(request);
    }
    if (url.pathname === '/internal/email-otp/verify' && request.method === 'POST') {
      return this.handleOtpVerify(request);
    }
    if (url.pathname === '/internal/account/lookup' && request.method === 'POST') {
      return this.handleAccountLookup(request);
    }
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  private async handleOtpBegin(request: Request): Promise<Response> {
    const body = await request.json<{
      email?: unknown;
      challengeId?: unknown;
      codeHash?: unknown;
      expiresAt?: unknown;
      resendAvailableAt?: unknown;
      ip?: unknown;
      now?: unknown;
    }>();
    const email = normalizeEmail(body.email);
    if (
      !email ||
      typeof body.challengeId !== 'string' ||
      typeof body.codeHash !== 'string' ||
      !Number.isSafeInteger(body.expiresAt) ||
      !Number.isSafeInteger(body.resendAvailableAt)
    ) {
      return Response.json({ accepted: false, error: 'Invalid request' }, { status: 400 });
    }

    const now = Number.isSafeInteger(body.now) ? Number(body.now) : Date.now();
    if (typeof body.ip === 'string' && body.ip.length > 0) {
      if (!this.ipRateLimiter.allow(body.ip, now)) {
        return Response.json({ accepted: false, rateLimited: true }, { status: 429 });
      }
    }
    const emailHash = await sha256(email);
    const account = this.db
      .exec('SELECT account_id FROM account_directory WHERE email_hash = ?', emailHash)
      .toArray() as Array<{ account_id: string }>;
    const invitation = this.db
      .exec(
        `SELECT id FROM workspace_invitations
         WHERE email_hash = ? AND revoked_at IS NULL AND accepted_at IS NULL AND expires_at > ?
         LIMIT 1`,
        emailHash,
        now
      )
      .toArray() as Array<{ id: string }>;
    const bootstrapEmail = normalizeEmail(this.env.BOOTSTRAP_OWNER_EMAIL);
    const allowedEmails = new Set(
      (this.env.ALLOWED_EMAILS || '')
        .split(',')
        .map((value) => normalizeEmail(value))
        .filter((value): value is string => value !== null)
    );
    const accountCount = (this.db.exec('SELECT COUNT(*) AS count FROM account_directory').one() as { count: number })
      .count;
    if (accountCount === 0) {
      if (!bootstrapEmail) {
        return Response.json({ accepted: false, configurationError: true }, { status: 503 });
      }
      if (email !== bootstrapEmail) return Response.json({ accepted: false });
    }

    const eligible =
      account.length > 0 ||
      invitation.length > 0 ||
      email === bootstrapEmail ||
      allowedEmails.has(email);
    if (!eligible) return Response.json({ accepted: false });

    const cooldown = this.db
      .exec(
        `SELECT resend_available_at FROM otp_challenges
         WHERE email_hash = ? AND consumed_at IS NULL
         ORDER BY created_at DESC LIMIT 1`,
        emailHash
      )
      .toArray() as Array<{ resend_available_at: number }>;
    if (cooldown.length > 0 && cooldown[0].resend_available_at > now) {
      return Response.json({ accepted: true, cooldown: true });
    }

    this.db.exec(
      `INSERT INTO otp_challenges
       (id, email_hash, code_hash, expires_at, resend_available_at, failed_attempts, created_at)
       VALUES (?, ?, ?, ?, ?, 0, ?)`,
      body.challengeId,
      emailHash,
      body.codeHash,
      body.expiresAt,
      body.resendAvailableAt,
      now
    );
    return Response.json({ accepted: true, cooldown: false });
  }

  private async handleOtpVerify(request: Request): Promise<Response> {
    const body = await request.json<{
      email?: unknown;
      challengeId?: unknown;
      codeHash?: unknown;
      now?: unknown;
    }>();
    const email = normalizeEmail(body.email);
    if (!email || typeof body.codeHash !== 'string') {
      return Response.json({ verified: false, error: 'Invalid request' }, { status: 400 });
    }
    const now = Number.isSafeInteger(body.now) ? Number(body.now) : Date.now();
    const emailHash = await sha256(email);
    const rows = (
      typeof body.challengeId === 'string' && body.challengeId.length > 0
        ? this.db
            .exec(
              `SELECT id, code_hash, expires_at, failed_attempts, consumed_at
               FROM otp_challenges WHERE id = ? AND email_hash = ?`,
              body.challengeId,
              emailHash
            )
            .toArray()
        : this.db
            .exec(
              `SELECT id, code_hash, expires_at, failed_attempts, consumed_at
               FROM otp_challenges WHERE email_hash = ? AND consumed_at IS NULL AND expires_at > ?
               ORDER BY created_at DESC LIMIT 1`,
              emailHash,
              now
            )
            .toArray()
    ) as Array<{
      id: string;
      code_hash: string;
      expires_at: number;
      failed_attempts: number;
      consumed_at: number | null;
    }>;
    const row = rows[0];
    if (!row || row.consumed_at !== null || row.expires_at <= now) {
      return Response.json({ verified: false }, { status: 401 });
    }
    if (row.failed_attempts >= 5 || row.code_hash !== body.codeHash) {
      this.db.exec(
        'UPDATE otp_challenges SET failed_attempts = failed_attempts + 1 WHERE id = ?',
        row.id
      );
      return Response.json({ verified: false }, { status: 401 });
    }

    const existing = this.db
      .exec('SELECT account_id FROM account_directory WHERE email_hash = ?', emailHash)
      .toArray() as Array<{ account_id: AccountId }>;
    const accountId = existing[0]?.account_id || (`acc_${crypto.randomUUID()}` as AccountId);
    if (!existing[0]) {
      this.db.exec(
        'INSERT INTO account_directory (account_id, email_hash) VALUES (?, ?)',
        accountId,
        emailHash
      );
    }
    this.db.exec('UPDATE otp_challenges SET consumed_at = ? WHERE id = ?', now, row.id);
    return Response.json({ verified: true, accountId, email });
  }

  private async handleAccountLookup(request: Request): Promise<Response> {
    const body = await request.json<{ email?: unknown }>();
    const email = normalizeEmail(body.email);
    if (!email) return Response.json({ account_id: null });
    const emailHash = await sha256(email);
    const rows = this.db
      .exec('SELECT account_id FROM account_directory WHERE email_hash = ?', emailHash)
      .toArray() as Array<{ account_id: AccountId }>;
    return Response.json({ account_id: rows[0]?.account_id || null });
  }
}
