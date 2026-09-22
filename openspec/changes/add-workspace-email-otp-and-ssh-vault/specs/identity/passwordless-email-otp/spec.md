# Spec Delta

## Purpose

Provide an independent, passwordless CloudSSH identity flow that uses verified email OTPs, protects OTP issuance with native rate limiting and optional Turnstile, enforces bootstrap safety, and remains usable when email is unavailable through dual-field one-time recovery codes.

## ADDED Requirements

### Requirement: Email OTP is the primary CloudSSH login with safe bootstrap

The system SHALL allow an eligible user to request a one-time login code using a normalized email address, enforce safe bootstrap configuration, and create a CloudSSH session only after the code is verified.

#### Scenario: Bootstrap owner requests an OTP

- **WHEN** a newly deployed system has no existing accounts and the submitted email matches `BOOTSTRAP_OWNER_EMAIL`
- **THEN** the system issues an OTP via Resend and designates this email as the future Workspace Owner

#### Scenario: Unconfigured bootstrap fails closed

- **WHEN** a system has no existing accounts and `BOOTSTRAP_OWNER_EMAIL` is not configured
- **THEN** the system rejects OTP requests with a configuration error and refuses to send emails, preventing unauthorized instance takeover

#### Scenario: Invited member requests an OTP

- **WHEN** an email address has a pending valid Workspace invitation
- **THEN** the system sends a login OTP through the configured Resend account without exposing the Resend API key to the browser

#### Scenario: Ineligible email requests an OTP

- **WHEN** an email address is not enrolled and has no pending Workspace invitation
- **THEN** the system returns an indistinguishable generic response and does not create an active OTP challenge

### Requirement: OTP challenges are bounded and single-use

The system SHALL store only an HMAC-SHA256 verifier for each OTP challenge, enforce a 10-minute expiry, enforce a 60-second resend cooldown per email, limit failed attempts to at most 5, and invalidate a challenge immediately after verification.

#### Scenario: Expired OTP

- **WHEN** a user submits a correct code after the 10-minute challenge expiry
- **THEN** the system rejects the code and requires a new challenge

#### Scenario: Replayed OTP

- **WHEN** a user submits a code that has already been verified to create a session
- **THEN** the system rejects the replay

#### Scenario: Excessive failed attempts

- **WHEN** an OTP challenge reaches 5 failed verification attempts
- **THEN** the system invalidates the challenge and requires a new request

#### Scenario: Resend cooldown active

- **WHEN** a user requests another OTP for the same email within 60 seconds of the previous request
- **THEN** the system rejects the request with a cooldown error and does not invoke Resend

### Requirement: Abuse protection via native rate limiting and optional Turnstile

The system SHALL enforce sliding-window rate limiting per IP and per Email in `AccountDirectoryDO` as the baseline protection, and SHALL optionally validate a Turnstile result (action and hostname) when Turnstile is configured, without locking out operators if Turnstile is disabled or unconfigured.

#### Scenario: Turnstile unconfigured or disabled

- **WHEN** Turnstile configuration is absent or disabled
- **THEN** the system accepts OTP and recovery requests protected by native backend sliding-window rate limits without requiring a Turnstile token

#### Scenario: Turnstile enabled and valid

- **WHEN** Turnstile is configured and the client provides a valid siteverify token matching the expected action (`otp_request` or `recovery_login`) and approved hostname
- **THEN** the system proceeds to process the request

#### Scenario: Turnstile enabled and invalid

- **WHEN** Turnstile is configured and siteverify returns failure, an unexpected action, or an unapproved hostname
- **THEN** the system rejects the request before sending an email or consuming a recovery code

### Requirement: Dual-field recovery codes provide an offline fallback

The system SHALL generate a set of 10 single-use recovery codes during account setup, display them once during enrollment, store them as salted hashes, and require both the email address and recovery code for emergency authentication.

#### Scenario: Emergency login with unused recovery code

- **WHEN** a user submits their registered email and an unused valid recovery code
- **THEN** the system authenticates the user, creates an `acc:...` session, and marks that specific recovery code consumed

#### Scenario: Consumed recovery code

- **WHEN** a user attempts to log in with an already consumed recovery code
- **THEN** the system rejects the login attempt

#### Scenario: Excessive failed recovery attempts

- **WHEN** an account records 5 consecutive failed recovery code attempts
- **THEN** the system locks recovery code login for that account for 15 minutes to prevent brute-force attacks

### Requirement: Session tokens use namespace prefixes for single-hop routing

The system SHALL prefix session tokens with `acc:<accountId>:` for Email OTP accounts and `gh:<githubId>:` for GitHub OAuth accounts, enabling the Worker to route requests to the correct Durable Object without central directory queries.

#### Scenario: Authenticate Email OTP session

- **WHEN** a request arrives with cookie `session=acc:acc_12345:token_secret`
- **THEN** the Worker routes directly to the `AccountDO` instance for `acc_12345` to verify the session

#### Scenario: Authenticate legacy GitHub session

- **WHEN** a request arrives with cookie `session=123456:token_secret` or `session=gh:123456:token_secret`
- **THEN** the Worker routes to the legacy `UserDBDO` instance for `123456`

### Requirement: GitHub login is optional

The system SHALL keep GitHub OAuth disabled by default for the independent distribution and SHALL permit an administrator to enable it separately without making it a prerequisite for Email OTP login.

#### Scenario: GitHub is disabled

- **WHEN** GitHub OAuth configuration is absent or explicitly disabled
- **THEN** the Email OTP login flow remains available and GitHub login is hidden from the UI
