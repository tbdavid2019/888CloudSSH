# Design

## Context

See `proposal.md` for motivation and behavior scope. The current application uses GitHub OAuth identities as the UserDBDO key, stores per-user servers in UserDBDO, and encrypts server credentials with an AES-256-GCM key derived from a Durable Object secret. Turnstile currently protects anonymous connection access through a generic verification cookie, while GitHub OAuth is optional.

## Goals / Non-Goals

**Goals:**

- Make Email OTP the independent primary CloudSSH account login.
- Support bootstrap safety via `BOOTSTRAP_OWNER_EMAIL` to prevent unauthenticated ownership hijacking on public instances.
- Adopt pure invitation-based onboarding post-bootstrap, avoiding orphan accounts and redundant static email allowlists.
- Support multiple users and isolated Workspaces with an unambiguous Owner, Admin, Member, and Viewer role matrix.
- Store shared SSH connection records and Private Keys encrypted at rest within `WorkspaceDO`.
- Let authorized members use vault keys to connect without receiving plaintext key material in the browser.
- Support cascade vault key resolution across multi-hop SSH jump hosts.
- Maintain shared known-host (TOFU) fingerprints per Workspace, requiring Owner/Admin approval for any host fingerprint changes.
- Provide defense-in-depth rate limiting: backend sliding-window limits protect against abuse natively, with Turnstile as an optional extra bot shield that never acts as a single point of failure during third-party outages.
- Keep GitHub OAuth optional and disabled by default, providing an explicit linking and credential re-encryption path.

**Non-Goals:**

- Parse passphrase-encrypted OpenSSH private keys inside the SSH engine runtime. The Vault accepts only valid unencrypted OpenSSH PEM keys (Ed25519, RSA, ECDSA); Cloudflare Workers lacks native `bcrypt_pbkdf` and running pure JS key derivation risks exceeding Worker CPU execution limits.
- Make Turnstile a hard mandatory dependency. If Turnstile is unconfigured, disabled, or unreachable, operators must not be locked out from emergency SSH access; the backend sliding-window rate limiter provides independent baseline defense.
- Single-field recovery code lookup without an email. Recovery code login requires both email and recovery code to avoid O(N) database-wide hash verification and DoS vulnerability.
- Enterprise SSO / SAML / OIDC directory federation (out of scope for lightweight serverless CloudSSH).
- Automatically migrate legacy GitHub accounts without explicit user initiation.

## Decisions

### 1. Separate authentication directory, personal account, and Workspace data

To avoid schema constraints and architectural friction:

1. **`AccountDirectoryDO` (Singleton `idFromName('global')`)**:
   - Maps normalized verified email addresses to internal Account IDs (`acc_<uuid>`).
   - Manages pending OTP challenges, failed attempts, and sliding-window rate-limiting cooldowns per IP and per Email.
   - Manages pending Workspace invitations.

2. **`AccountDO` (Keyed by `acc_<uuid>`)**:
   - Dedicated Durable Object class for individual Email OTP accounts.
   - Stores personal profile, recovery codes, personal command snippets, custom themes, and personal SSH sessions.
   - Avoids modifying or breaking the legacy `UserDBDO` schema (which has `github_id INTEGER UNIQUE NOT NULL`).

3. **`WorkspaceDO` (Keyed by `ws_<uuid>`)**:
   - Manages Workspace memberships, roles (Owner, Admin, Member, Viewer), and invitation lifecycle.
   - Stores shared SSH server records and encrypted Private Key Vault entries.
   - Stores Workspace-wide shared `workspace_known_hosts` (TOFU) fingerprints.
   - Stores immutable Workspace audit events.

4. **Session Token Routing & Namespace**:
   - New Account session tokens use the prefix format: `acc:<accountId>:<randomSecret>`.
   - Legacy GitHub session tokens retain: `gh:<githubId>:<randomSecret>` (or `<githubId>:<randomSecret>`).
   - The Worker inspects the session token prefix on incoming requests and routes directly to either `AccountDO` or legacy `UserDBDO` in a single hop without central directory overhead.

### 2. Passwordless Email OTP with Resend, Bootstrap Safety, and Resilient Protection

- **Configuration**:
  - `RESEND_API_KEY`: Server-only secret; never exposed to client.
  - `RESEND_FROM_EMAIL`: Configured verified sender address (e.g. `login@ssh.example.com`).
  - `BOOTSTRAP_OWNER_EMAIL`: The initial owner's email address for zero-account bootstrap.
  - `TURNSTILE_SECRET` / `TURNSTILE_SITEKEY`: Optional bot protection; unconfigured means Turnstile is skipped in favor of backend rate limits.

- **Bootstrap & Pure Invitation Onboarding**:
  - *Zero-account bootstrap*: If no accounts exist in `AccountDirectoryDO`, only the email matching `BOOTSTRAP_OWNER_EMAIL` is eligible to request an OTP and enroll as the first Workspace Owner. If `BOOTSTRAP_OWNER_EMAIL` is unconfigured, the system fails closed (returns a configuration error) to prevent public takeover.
  - *Post-bootstrap*: An email is eligible only if it is an already registered account or has an active, valid Workspace invitation. This eliminates static allowlists and prevents unattached orphan accounts.
  - *Ineligible emails*: The endpoint returns a generic successful response indistinguishable in timing and structure to prevent account enumeration.

- **Resilient Multi-Layer Abuse Protection**:
  - *Layer 1 (Native Backend Rate Limiting)*: `AccountDirectoryDO` enforces bounded in-memory sliding windows: max 5 requests per 15 minutes per IP, and 60-second cooldown per email.
  - *Layer 2 (Challenge Bounds)*: OTP is a 6-digit numeric code valid for 10 minutes. Max 5 failed verification attempts per challenge before invalidation.
  - *Layer 3 (Optional Turnstile)*: When `TURNSTILE_SECRET` is configured, Turnstile siteverify (`action: 'otp_request'` or `'recovery_login'`) is checked. If Turnstile is unconfigured or disabled, the endpoint remains fully operational protected by Layer 1 and 2, guaranteeing availability during third-party incidents.

### 3. Dual-Field Recovery Codes as Emergency Fallback

- During first account enrollment, the system generates 10 single-use recovery codes (format: `xxxx-xxxx` alphanumeric).
- Shown once in the UI with copy/download options; the client must explicitly confirm before continuing.
- Stored as SHA-256 hashes with a per-account salt.
- **Login requires both `email` and `recovery_code`**:
  - Using email allows an O(1) indexed lookup in `AccountDO`.
  - Verifies code using constant-time comparison against unused hashes.
  - Marks the matching code as consumed upon successful login.
  - Locks the account's recovery login for 15 minutes after 5 consecutive failed attempts.
  - If Turnstile is configured, validates `action: 'recovery_login'`.

### 4. Workspace Roles and Authorization Matrix

Workspaces enforce a strict role-based access model:

| Capability | Owner | Admin | Member | Viewer |
| :--- | :---: | :---: | :---: | :---: |
| Edit Workspace name / delete Workspace | ✅ | ❌ | ❌ | ❌ |
| Transfer Workspace ownership | ✅ | ❌ | ❌ | ❌ |
| Invite / remove Admins | ✅ | ❌ | ❌ | ❌ |
| Invite / remove Members & Viewers | ✅ | ✅ | ❌ | ❌ |
| Create / edit / delete shared servers | ✅ | ✅ | ❌ | ❌ |
| Create / rename / delete Vault private keys | ✅ | ✅ | ❌ | ❌ |
| Authorize shared host key (TOFU) changes | ✅ | ✅ | ❌ | ❌ |
| View Workspace audit logs | ✅ | ✅ | ❌ | ❌ |
| View shared server metadata & tags | ✅ | ✅ | ✅ | ✅ |
| Initiate SSH / SFTP connection to shared server | ✅ | ✅ | ✅ | ❌ (Strictly Forbidden) |
| Manage personal servers & personal keys | ✅ | ✅ | ✅ | ✅ |

- **Viewer is strictly read-only**: Viewers can monitor server statuses, tags, and configurations for observability or compliance, but cannot initiate interactive SSH or SFTP sessions.

### 5. Private Key Vault Encryption, Jump Host Cascade, and TOFU Governance

- **Key Formats**: Supports unencrypted OpenSSH PEM keys (Ed25519, RSA, ECDSA). Passphrase-encrypted keys are rejected at import to prevent Worker CPU limit exhaustion.
- **At-Rest Encryption**: `WorkspaceDO` encrypts private key text using AES-256-GCM with a Workspace-scoped secret and PBKDF2 salt `cloudssh:vault:${workspaceId}`.
- **No-Export Contract**: Normal API responses expose only key ID, custom name, key type, public key fingerprint (SHA256), created/updated timestamps, and creator ID. The private key text is never returned via any API endpoint.
- **Connection Token Minting & Jump Host Resolution**:
  1. Member requests a connection token via `POST /api/workspaces/:wid/servers/:sid/connect`.
  2. `WorkspaceDO` verifies the caller has connection permission.
  3. `WorkspaceDO` decrypts the server's credential or associated Vault key.
  4. If the server configures a jump server (`jump_server_id`), `WorkspaceDO` recursively inspects the jump host chain (up to 3 hops) and decrypts the respective credentials/vault keys for each hop.
  5. `WorkspaceDO` stores the complete `SSHConnectionConfig` in its short-lived in-memory token map (TTL: 60s) and returns a one-time token.
  6. The client connects WebSocket `/api/ssh?token=...`. The Worker consumes the token from `WorkspaceDO` and passes the config to `SSHSessionDO`. Decrypted keys never enter the client or browser memory.
- **Shared TOFU (Known Hosts) Governance**:
  - `WorkspaceDO` maintains a `workspace_known_hosts` table.
  - When any authorized member connects to a shared server for the first time, the host key fingerprint is recorded in the Workspace.
  - Subsequent connections by any member verify against this shared fingerprint.
  - **Fingerprint Change Protection**: If a server's presented host key changes, regular Members are blocked from connecting and cannot overwrite the fingerprint. Only an Owner or Admin can review the mismatch, verify the new fingerprint, and authorize the update with an audit log entry.

### 6. Legacy Account Linking and Credential Re-Encryption

- A signed-in Email OTP user can initiate GitHub linking from account settings.
- The user is redirected to GitHub OAuth with the existing session token encoded in state.
- Upon callback:
  - The Worker verifies the GitHub OAuth identity against `GITHUB_ALLOWED_USER_IDS` (if configured).
  - Connects to the user's legacy `UserDBDO` via `env.USER_DB.idFromName(githubId)`.
  - Decrypts legacy saved servers using the legacy `UserDBDO` key.
  - Creates or attaches to the user's personal Workspace in `WorkspaceDO`.
  - Re-encrypts server credentials using the new `WorkspaceDO` encryption key and writes the records.
  - Records the link relationship in `AccountDO`.
  - Legacy `UserDBDO` data is retained intact as a safety precaution.

## Risks / Trade-offs

- **Email delivery delays or outages** → Dual-field recovery codes allow offline emergency login; 60s resend cooldown prevents API flooding.
- **Third-party Turnstile outage** → Turnstile is opt-in; native sliding-window rate limiting in `AccountDirectoryDO` ensures critical SSH access remains available even during Turnstile outages.
- **Public takeover of new deployments** → Explicit `BOOTSTRAP_OWNER_EMAIL` requirement fails closed if unconfigured.
- **Durable Object coordination & latency** → `acc:<id>:<token>` prefix routing allows the Worker to route to `AccountDO` in a single hop for regular requests, avoiding singleton bottleneck.
- **Key material exposure during jump chain** → All jump host key resolutions and token minting happen within `WorkspaceDO` memory; no credentials are exposed in WebSocket messages or audit logs.

## Migration Plan

1. **Phase 1 (Bindings & Schema Migration)**:
   - Add DO classes: `AccountDirectoryDO`, `AccountDO`, `WorkspaceDO`.
   - Update `wrangler.toml` with bindings: `ACCOUNT_DIRECTORY`, `ACCOUNT_DO`, `WORKSPACE_DO`.
   - Add migration: `[[migrations]] tag = "v3" new_sqlite_classes = ["AccountDirectoryDO", "AccountDO", "WorkspaceDO"]`.
2. **Phase 2 (Configuration & Backend APIs)**:
   - Configure secrets: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `BOOTSTRAP_OWNER_EMAIL`.
   - Implement Email OTP with native rate limiting (and optional Turnstile), and Recovery Code endpoints.
   - Implement Workspace membership, RBAC, Vault CRUD, cascade SSH connection token generation, and Admin-gated TOFU updates.
3. **Phase 3 (Frontend & i18n)**:
   - Implement OTP login form, Recovery Code confirmation/download modal, Workspace switcher, member management, and Vault key picker UI.
   - Synchronize zh-CN, zh-TW, and en-US i18n dictionaries.
4. **Phase 4 (Validation & Verification)**:
   - Run full unit tests, Worker integration tests, typechecks, and Playwright E2E tests.
   - Verify legacy GitHub account linking and re-encryption in a staged test environment before disabling GitHub OAuth as default.
