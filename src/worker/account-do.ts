import {
  constantTimeEqual,
  generateRecoveryCodes,
  hashRecoveryCode,
  randomBase64Url,
  sha256,
} from './email-auth';
import type { AccountId, Env } from '../types';

/** Per-account private data boundary for Email OTP identities. */
export class AccountDO {
  private env: Env;
  private db: any;

  constructor(state: DurableObjectState, env: Env) {
    this.env = env;
    this.db = (state.storage as any).sql;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS system_config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS account_profile (
        account_id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS recovery_codes (
        id TEXT PRIMARY KEY,
        code_hash TEXT NOT NULL,
        consumed_at INTEGER DEFAULT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS recovery_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        failed_attempts INTEGER NOT NULL DEFAULT 0,
        locked_until INTEGER DEFAULT NULL
      );
      CREATE TABLE IF NOT EXISTS personal_servers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        encrypted_config TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS personal_vault_keys (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        key_type TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        encrypted_private_key TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS workspace_memberships (
        workspace_id TEXT PRIMARY KEY,
        role TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/internal/account/profile' && request.method === 'POST') {
      return this.handleProfileInit(request);
    }
    if (url.pathname === '/internal/account/session/create' && request.method === 'POST') {
      return this.handleSessionCreate(request);
    }
    if (url.pathname === '/internal/account/session/verify' && request.method === 'POST') {
      return this.handleSessionVerify(request);
    }
    if (url.pathname === '/internal/account/session/delete' && request.method === 'POST') {
      return this.handleSessionDelete(request);
    }
    if (url.pathname === '/internal/account/recovery/enroll' && request.method === 'POST') {
      return this.handleRecoveryEnroll(request);
    }
    if (url.pathname === '/internal/account/recovery/verify' && request.method === 'POST') {
      return this.handleRecoveryVerify(request);
    }
    if (
      url.pathname === '/internal/account/recovery/status' &&
      (request.method === 'GET' || request.method === 'POST')
    ) {
      return this.handleRecoveryStatus();
    }
    if (url.pathname === '/internal/account/recovery/regenerate' && request.method === 'POST') {
      return this.handleRecoveryRegenerate(request);
    }
    if (url.pathname === '/internal/account/workspaces' && request.method === 'GET') {
      return Response.json({ workspaces: this.listWorkspaces() });
    }
    if (url.pathname === '/internal/account/workspaces' && request.method === 'POST') {
      return this.handleAddWorkspace(request);
    }
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  private async handleProfileInit(request: Request): Promise<Response> {
    const body = await request.json<{ account_id?: unknown; email?: unknown }>();
    if (
      typeof body.account_id !== 'string' ||
      !body.account_id.startsWith('acc_') ||
      typeof body.email !== 'string'
    ) {
      return Response.json({ error: 'Invalid account profile' }, { status: 400 });
    }
    this.db.exec(
      `INSERT INTO account_profile (account_id, email) VALUES (?, ?)
       ON CONFLICT(account_id) DO UPDATE SET email = excluded.email, updated_at = datetime('now')`,
      body.account_id,
      body.email
    );
    return Response.json({ id: body.account_id, account_id: body.account_id, email: body.email });
  }

  private async handleSessionCreate(request: Request): Promise<Response> {
    const body = await request.json<{ account_id?: unknown }>();
    if (typeof body.account_id !== 'string' || !body.account_id.startsWith('acc_')) {
      return Response.json({ error: 'Invalid account ID' }, { status: 400 });
    }
    const tokenSecret = randomBase64Url(32);
    const token = `acc:${body.account_id}:${tokenSecret}`;
    const tokenHash = await sha256(token);
    this.db.exec(
      'INSERT INTO sessions (token_hash, expires_at, created_at) VALUES (?, ?, ?)',
      tokenHash,
      Date.now() + 7 * 24 * 60 * 60 * 1000,
      Date.now()
    );
    return Response.json({ token });
  }

  private async handleSessionVerify(request: Request): Promise<Response> {
    const body = await request.json<{ token?: unknown }>();
    if (typeof body.token !== 'string') return Response.json({ error: 'Invalid session' }, { status: 401 });
    const tokenHash = await sha256(body.token);
    const rows = this.db
      .exec(
        `SELECT s.expires_at, p.email, p.account_id
         FROM sessions s JOIN account_profile p ON p.account_id = ?
         WHERE s.token_hash = ?`,
        body.token.split(':')[1] || '',
        tokenHash
      )
      .toArray() as Array<{ expires_at: number; email: string; account_id: AccountId }>;
    const row = rows[0];
    if (!row || row.expires_at <= Date.now()) return Response.json({ error: 'Invalid session' }, { status: 401 });
    return Response.json({ id: row.account_id, account_id: row.account_id, email: row.email });
  }

  private async handleSessionDelete(request: Request): Promise<Response> {
    const body = await request.json<{ token?: unknown }>();
    if (typeof body.token !== 'string') return Response.json({ success: true });
    this.db.exec('DELETE FROM sessions WHERE token_hash = ?', await sha256(body.token));
    return Response.json({ success: true });
  }

  private getRecoverySecret(): string {
    const rows = this.db
      .exec("SELECT value FROM system_config WHERE key = 'recovery_secret'")
      .toArray() as Array<{ value: string }>;
    if (rows.length > 0) return rows[0].value;
    const secret = randomBase64Url(32);
    this.db.exec(
      "INSERT INTO system_config (key, value) VALUES ('recovery_secret', ?)",
      secret
    );
    return secret;
  }

  private async handleRecoveryEnroll(request: Request): Promise<Response> {
    const body = await request.json<{ account_id?: unknown }>();
    if (typeof body.account_id !== 'string' || !body.account_id.startsWith('acc_')) {
      return Response.json({ error: 'Recovery code enrollment unavailable' }, { status: 400 });
    }
    const existing = this.db.exec('SELECT COUNT(*) AS count FROM recovery_codes').one() as { count: number };
    if (existing.count > 0) return Response.json({ error: 'Recovery codes already enrolled' }, { status: 409 });
    const codes = generateRecoveryCodes();
    const now = Date.now();
    const recoverySecret = this.getRecoverySecret();
    for (const code of codes) {
      this.db.exec(
        'INSERT INTO recovery_codes (id, code_hash, created_at) VALUES (?, ?, ?)',
        crypto.randomUUID(),
        await hashRecoveryCode(code, body.account_id, recoverySecret),
        now
      );
    }
    this.db.exec('INSERT OR IGNORE INTO recovery_state (id) VALUES (1)');
    return Response.json({ codes });
  }

  private async handleRecoveryVerify(request: Request): Promise<Response> {
    const body = await request.json<{ account_id?: unknown; code?: unknown }>();
    if (
      typeof body.account_id !== 'string' ||
      !body.account_id.startsWith('acc_') ||
      typeof body.code !== 'string'
    ) {
      return Response.json({ verified: false }, { status: 401 });
    }
    const now = Date.now();
    const state = this.db
      .exec('SELECT failed_attempts, locked_until FROM recovery_state WHERE id = 1')
      .toArray() as Array<{ failed_attempts: number; locked_until: number | null }>;
    if (state[0]?.locked_until && state[0].locked_until > now) {
      return Response.json({ verified: false, locked: true }, { status: 429 });
    }
    const recoverySecret = this.getRecoverySecret();
    const expected = await hashRecoveryCode(body.code, body.account_id, recoverySecret);
    const rows = this.db
      .exec('SELECT id, code_hash FROM recovery_codes WHERE consumed_at IS NULL')
      .toArray() as Array<{ id: string; code_hash: string }>;
    const matched = rows.find((row) => constantTimeEqual(row.code_hash, expected));
    if (!matched) {
      const failedAttempts = (state[0]?.failed_attempts || 0) + 1;
      this.db.exec(
        `INSERT INTO recovery_state (id, failed_attempts, locked_until) VALUES (1, ?, ?)
         ON CONFLICT(id) DO UPDATE SET failed_attempts = excluded.failed_attempts, locked_until = excluded.locked_until`,
        failedAttempts,
        failedAttempts >= 5 ? now + 15 * 60 * 1000 : null
      );
      return Response.json({ verified: false, locked: failedAttempts >= 5 }, { status: 401 });
    }
    this.db.exec('UPDATE recovery_codes SET consumed_at = ? WHERE id = ?', now, matched.id);
    this.db.exec('UPDATE recovery_state SET failed_attempts = 0, locked_until = NULL WHERE id = 1');
    return Response.json({ verified: true });
  }

  private async handleRecoveryStatus(): Promise<Response> {
    const totalRow = this.db.exec('SELECT COUNT(*) AS count FROM recovery_codes').one() as
      | { count: number }
      | undefined;
    const remainingRow = this.db
      .exec('SELECT COUNT(*) AS count FROM recovery_codes WHERE consumed_at IS NULL')
      .one() as { count: number } | undefined;
    const total = totalRow?.count || 0;
    const remaining = remainingRow?.count || 0;
    return Response.json({
      total,
      remaining,
      enrolled: total > 0,
    });
  }

  private async handleRecoveryRegenerate(request: Request): Promise<Response> {
    const body = await request.json<{ account_id?: unknown }>();
    if (typeof body.account_id !== 'string' || !body.account_id.startsWith('acc_')) {
      return Response.json({ error: 'Recovery code regeneration unavailable' }, { status: 400 });
    }
    const codes = generateRecoveryCodes();
    const now = Date.now();
    const recoverySecret = this.getRecoverySecret();
    this.db.exec('DELETE FROM recovery_codes');
    for (const code of codes) {
      this.db.exec(
        'INSERT INTO recovery_codes (id, code_hash, created_at) VALUES (?, ?, ?)',
        crypto.randomUUID(),
        await hashRecoveryCode(code, body.account_id, recoverySecret),
        now
      );
    }
    this.db.exec(
      `INSERT INTO recovery_state (id, failed_attempts, locked_until) VALUES (1, 0, NULL)
       ON CONFLICT(id) DO UPDATE SET failed_attempts = 0, locked_until = NULL`
    );
    return Response.json({ codes });
  }

  private listWorkspaces(): Array<{ workspace_id: string; role: string }> {
    return this.db
      .exec('SELECT workspace_id, role FROM workspace_memberships ORDER BY created_at ASC')
      .toArray() as Array<{ workspace_id: string; role: string }>;
  }

  private async handleAddWorkspace(request: Request): Promise<Response> {
    const body = await request.json<{ workspace_id?: unknown; role?: unknown }>();
    if (
      typeof body.workspace_id !== 'string' ||
      !body.workspace_id.startsWith('ws_') ||
      typeof body.role !== 'string'
    ) {
      return Response.json({ error: 'Invalid workspace membership' }, { status: 400 });
    }
    const now = Date.now();
    this.db.exec(
      `INSERT INTO workspace_memberships (workspace_id, role, created_at, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(workspace_id) DO UPDATE SET role = excluded.role, updated_at = excluded.updated_at`,
      body.workspace_id,
      body.role,
      now,
      now
    );
    return Response.json({ workspace_id: body.workspace_id, role: body.role });
  }
}
