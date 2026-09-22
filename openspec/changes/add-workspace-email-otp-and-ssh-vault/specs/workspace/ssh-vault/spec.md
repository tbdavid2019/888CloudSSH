# Spec Delta

## Purpose

Provide Workspace-scoped SSH connection records, shared host fingerprints with Admin-gated change protection, and an encrypted Private Key Vault that allows team members to connect through jump host chains without reading or exporting private key material.

## ADDED Requirements

### Requirement: Workspace owns shared SSH resources and Private Key Vault

The system SHALL associate shared SSH connection records and Private Key Vault entries with exactly one Workspace, and SHALL isolate them strictly from other Workspaces and personal accounts.

#### Scenario: Workspace resource listing

- **WHEN** an authorized member queries the Workspace server or key list
- **THEN** the system returns only non-secret metadata (ID, name, fingerprint, host, port, tags, creator) belonging to that specific Workspace

### Requirement: Private Keys are encrypted at rest and never exported

The system SHALL validate that imported Private Keys are unencrypted OpenSSH PEM formats (Ed25519, RSA, ECDSA), encrypt them with AES-256-GCM before persistence, reject passphrase-encrypted keys, and never expose plaintext private keys in any API response.

#### Scenario: Import valid unencrypted OpenSSH key

- **WHEN** an Admin or Owner uploads a valid unencrypted OpenSSH PEM private key with a unique name
- **THEN** the system validates the format, computes the public key fingerprint, encrypts the key at rest, and returns only the key ID, fingerprint, and metadata

#### Scenario: Import passphrase-encrypted key rejected

- **WHEN** a user uploads a passphrase-protected or encrypted private key
- **THEN** the system rejects the upload with a validation error instructing the user to decrypt the key before uploading

#### Scenario: Export request rejected

- **WHEN** any user (including Owner or Admin) requests the plaintext private key material via API or UI
- **THEN** the system strictly rejects the request with a method not allowed or forbidden status

### Requirement: Vault keys resolve recursively across SSH jump host chains

The system SHALL resolve and decrypt Vault private keys and server credentials within `WorkspaceDO` memory during connection token generation, including multi-hop jump hosts (`jump_server_id`) up to 3 hops, without exposing key text to the browser.

#### Scenario: Multi-hop jump host connection token generation

- **WHEN** an authorized Member requests to connect to a target server that routes through one or more jump hosts referencing Vault keys
- **THEN** the system verifies permissions, decrypts the keys for all hops in DO memory, packages the complete `SSHConnectionConfig`, and returns a single-use connection token

#### Scenario: Revoked key in jump chain blocks connection

- **WHEN** any key in the jump host chain or target server configuration is deleted or inaccessible
- **THEN** the system rejects the connection token generation and terminates the request

### Requirement: Workspace maintains shared known hosts (TOFU) with Admin-gated change governance

The system SHALL store known host fingerprints for shared servers in a Workspace-scoped table (`workspace_known_hosts`), and SHALL require Owner or Admin authorization before updating any existing host fingerprint.

#### Scenario: First connection records shared fingerprint

- **WHEN** an authorized member establishes the first successful SSH connection to a Workspace server
- **THEN** the server's public key fingerprint is persisted to `workspace_known_hosts` as the trusted fingerprint for all Workspace members

#### Scenario: Fingerprint mismatch blocks regular Member

- **WHEN** a Member attempts to connect to a server whose presented host key differs from the stored Workspace fingerprint
- **THEN** the system blocks the connection and prevents the Member from overriding the fingerprint

#### Scenario: Owner or Admin authorizes fingerprint update

- **WHEN** an Owner or Admin reviews a host key fingerprint mismatch and confirms the update
- **THEN** the system updates `workspace_known_hosts` with the new fingerprint and appends an audit log entry detailing the actor, server, old fingerprint, and new fingerprint

### Requirement: Key management and usage are auditable without secrets

The system SHALL record create, rename, delete, fingerprint update, and connection-use events for Vault keys, including actor, Workspace ID, key identifier, target server identifier, and timestamp, while excluding all private key material.

#### Scenario: Audit logging on key-based SSH connection

- **WHEN** an SSH connection is established using a Vault private key
- **THEN** an audit event is appended containing the actor ID, server ID, key ID, and timestamp without recording private keys or credentials
