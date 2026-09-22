# Tasks

## 1. Identity and storage foundation

- [x] 1.1 Add Account, Workspace, Membership, Invitation, OTP Challenge, Recovery Code, Vault Key, and session namespace prefix (`acc:` / `gh:`) types; verify Worker and frontend typechecks compile.
- [x] 1.2 Create `AccountDirectoryDO`, `AccountDO`, and `WorkspaceDO` class skeletons with SQLite schemas; add `[[durable_objects.bindings]]` and `[[migrations]] tag = "v3"` in `wrangler.toml` for test and production environments; verify fresh DO and existing DO instances initialize cleanly.
- [x] 1.3 Add email normalization, HMAC-SHA256 challenge hashing, constant-time verification, resend cooldown (60s), sliding-window rate limiters (per-IP and per-email), failed-attempt counters (max 5), and recovery code (`xxxx-xxxx`) generator helpers; verify unit tests cover brute-force limits, expiry, and normalization.

## 2. Passwordless Email OTP authentication

- [x] 2.1 Add Resend email delivery using server-only `RESEND_API_KEY` and configured `RESEND_FROM_EMAIL`; verify integration tests mock the Resend API and assert keys are never exposed.
- [x] 2.2 Implement Email OTP request and verify endpoints in Worker and `AccountDirectoryDO`: enforce `BOOTSTRAP_OWNER_EMAIL` for initial zero-account setup with fail-closed behavior, allow registered accounts and pending workspace invitations, return generic anti-enumeration responses for ineligible emails, and issue `acc:<accountId>:<token>` session cookies on verification.
- [x] 2.3 Integrate optional Turnstile verification for `otp_request` and `recovery_login` actions with hostname checks: verify that requests succeed with backend rate limits when Turnstile is unconfigured/disabled, and verify invalid Turnstile tokens are rejected when configured.
- [ ] 2.4 Implement dual-field recovery code enrollment (10 codes per account), `email + recovery_code` emergency login endpoint, 5-attempt lockout (15 minutes), and secure copy/download confirmation UI.
- [ ] 2.5 Update Worker session middleware to route `acc:` tokens to `AccountDO` and legacy `gh:` tokens to `UserDBDO`; implement legacy GitHub linking flow that decrypts legacy servers from `UserDBDO` and re-encrypts them into `WorkspaceDO`.

## 3. Workspace membership and authorization

- [x] 3.1 Automatically create the initial default Workspace and assign the Owner role upon bootstrap user's first successful OTP login; verify subsequent logins reuse existing memberships.
- [ ] 3.2 Implement Workspace email invitations with Admin, Member, and Viewer roles; verify invitation activation upon OTP verification of the invited email, and reject expired or revoked invites.
- [ ] 3.3 Implement role-based authorization: verify Owner/Admin can manage resources, Members can initiate connections to authorized servers, Viewers are strictly denied SSH/SFTP connection attempts, and cross-Workspace requests return 404 without data leakage.
- [ ] 3.4 Implement Workspace ownership transfer to active Admins and prevent sole Owners from orphaning Workspaces.
- [ ] 3.5 Add Workspace, member management, invitation, and role UI with full i18n parity across zh-CN, zh-TW, and en-US dictionaries.

## 4. Workspace SSH records and Private Key Vault

- [ ] 4.1 Implement Private Key Vault in `WorkspaceDO`: validate unencrypted OpenSSH PEM keys (Ed25519, RSA, ECDSA), reject passphrase-protected keys, encrypt with AES-256-GCM at rest, and enforce no-export metadata-only API contracts.
- [ ] 4.2 Implement shared SSH server records referencing Vault keys, and implement cascade Vault key resolution across multi-hop jump host chains (up to 3 hops) during connection token minting.
- [ ] 4.3 Implement Workspace shared known hosts (`workspace_known_hosts`) with Admin-gated change governance: verify first connection records the fingerprint, fingerprint mismatches block regular Members, and only Owner/Admin can review and authorize updates with audit logging.
- [ ] 4.4 Implement Vault UI for key import, renaming, deletion, and connection selection; add secret-free audit logging for all key lifecycle and connection events.

## 5. Integration and release verification

- [ ] 5.1 Document new configuration variables (`RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `BOOTSTRAP_OWNER_EMAIL`), roles, recovery codes, and Vault policies in `README.md` and `AGENTS.md`; record changes in `CHANGELOG.md` under a date-based heading.
- [ ] 5.2 Execute local verification gate (`pnpm run verify`: typecheck, unit tests, frontend build, and Playwright E2E); verify anonymous connections (if enabled), legacy GitHub accounts, SFTP, and one-time sharing regress cleanly.
- [ ] 5.3 Deploy to staging environment; exercise Email OTP bootstrap, member invitation, Viewer read-only restrictions, dual-field recovery login, multi-hop jump host Vault connections, and Admin TOFU change authorization; record sign-off in `CHANGELOG.md`.
