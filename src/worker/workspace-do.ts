import type { Env } from '../types';

/** Per-workspace consistency and authorization boundary. */
export class WorkspaceDO {
  private db: any;

  constructor(state: DurableObjectState, _env: Env) {
    this.db = (state.storage as any).sql;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS workspace (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS memberships (
        account_id TEXT PRIMARY KEY,
        role TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS shared_servers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        encrypted_config TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS vault_keys (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        key_type TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        encrypted_private_key TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS resource_permissions (
        resource_type TEXT NOT NULL,
        resource_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        can_connect INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (resource_type, resource_id, account_id)
      );
      CREATE TABLE IF NOT EXISTS workspace_known_hosts (
        server_id TEXT NOT NULL,
        identity TEXT NOT NULL,
        port INTEGER NOT NULL,
        fingerprint TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (server_id, identity, port)
      );
      CREATE TABLE IF NOT EXISTS workspace_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        actor_id TEXT NOT NULL,
        action TEXT NOT NULL,
        resource_type TEXT,
        resource_id TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_memberships_role ON memberships(role);
      CREATE INDEX IF NOT EXISTS idx_permissions_account ON resource_permissions(account_id);
      CREATE INDEX IF NOT EXISTS idx_workspace_audit_created ON workspace_audit(created_at DESC);
    `);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/internal/workspace/bootstrap' && request.method === 'POST') {
      return this.handleBootstrap(request);
    }
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  private async handleBootstrap(request: Request): Promise<Response> {
    const body = await request.json<{ workspace_id?: unknown; name?: unknown; owner_id?: unknown }>();
    if (
      typeof body.workspace_id !== 'string' ||
      !body.workspace_id.startsWith('ws_') ||
      typeof body.name !== 'string' ||
      typeof body.owner_id !== 'string'
    ) {
      return Response.json({ error: 'Invalid workspace bootstrap' }, { status: 400 });
    }
    const now = Date.now();
    this.db.exec(
      `INSERT INTO workspace (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
      body.workspace_id,
      body.name.trim().slice(0, 80) || 'Workspace',
      now,
      now
    );
    this.db.exec(
      `INSERT INTO memberships (account_id, role, created_at, updated_at)
       VALUES (?, 'owner', ?, ?)
       ON CONFLICT(account_id) DO NOTHING`,
      body.owner_id,
      now,
      now
    );
    return Response.json({ workspace_id: body.workspace_id, owner_id: body.owner_id, role: 'owner' });
  }
}
