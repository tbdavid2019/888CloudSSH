# Spec Delta

## Purpose

Provide isolated multi-user Workspaces so a team can share approved SSH resources while retaining explicit ownership, membership, role, and access boundaries.

## ADDED Requirements

### Requirement: First eligible user owns the initial Workspace

The system SHALL create a default Workspace for the first eligible Email OTP user upon initial verification and SHALL assign that user the Owner role.

#### Scenario: First successful login creates Workspace

- **WHEN** the verified bootstrap user completes their initial Email OTP verification
- **THEN** the system creates an `AccountDO`, initializes a new `WorkspaceDO`, assigns the user as Workspace Owner, and returns the workspace context

#### Scenario: Subsequent logins do not duplicate Workspace

- **WHEN** an existing user logs in again via Email OTP
- **THEN** the system reattaches to their existing Workspace memberships without creating duplicate Workspaces

### Requirement: Workspace invitations use Email OTP identity

Owner and Admin users SHALL be able to invite an email address with a specified role (Admin, Member, or Viewer), and the invitee SHALL join only after completing the Email OTP verification for the invited address.

#### Scenario: Invite accepted by invited email

- **WHEN** an invited email address completes Email OTP verification
- **THEN** the system activates the pending invitation, adds the account to the target Workspace with the specified role, and invalidates the invitation

#### Scenario: Invite expired or revoked

- **WHEN** an invitation is expired or revoked by an Admin prior to acceptance
- **THEN** the system rejects acceptance and does not grant membership

#### Scenario: Member or Viewer attempts to issue invite

- **WHEN** a Member or Viewer attempts to invite a new user
- **THEN** the system rejects the request with a forbidden response

### Requirement: Workspace roles enforce access boundaries

The system SHALL enforce a role-based access control matrix across all Workspace APIs, distinguishing Owner, Admin, Member, and Viewer roles. Viewer users SHALL be strictly read-only observers and SHALL NOT initiate SSH or SFTP connections.

#### Scenario: Owner or Admin manages shared resources

- **WHEN** an Owner or Admin creates, edits, or deletes a shared server or Vault key
- **THEN** the system authorizes the modification and records an audit log entry

#### Scenario: Member uses an authorized shared server

- **WHEN** a Member requests a connection token for an authorized shared server
- **THEN** the system issues a short-lived connection token using Workspace credentials without exposing secrets to the browser

#### Scenario: Member attempts administrative resource mutation

- **WHEN** a Member attempts to delete a shared server, modify member roles, or delete a Vault key
- **THEN** the system rejects the request with a forbidden status

#### Scenario: Viewer attempts to establish a connection

- **WHEN** a user with the Viewer role attempts to initiate an SSH or SFTP connection to any Workspace server
- **THEN** the system strictly rejects the connection request with a forbidden response

#### Scenario: Cross-Workspace access attempt

- **WHEN** an authenticated user attempts to access a server or Vault key belonging to a Workspace in which they hold no membership
- **THEN** the system returns a 404 not found response without revealing the resource's existence

### Requirement: Workspace ownership lifecycle is protected

The system SHALL require an explicit transfer of the Owner role to an active Admin before the current Owner can leave the Workspace, and SHALL prevent a Workspace from becoming an orphan.

#### Scenario: Transfer ownership

- **WHEN** an Owner transfers the Owner role to an existing Admin
- **THEN** the recipient becomes Owner, the former Owner is demoted to Admin, and an audit event is recorded

#### Scenario: Sole Owner attempts to leave

- **WHEN** the sole Owner attempts to leave the Workspace without transferring ownership
- **THEN** the system rejects the operation and requires either ownership transfer or Workspace deletion

### Requirement: Workspace membership changes are auditable

The system SHALL record membership invitations, role changes, member removals, and ownership transfers with actor, target, Workspace ID, action, and timestamp.

#### Scenario: Admin removes a member

- **WHEN** an authorized Admin removes a Member from the Workspace
- **THEN** the membership is revoked, active sessions lose access to Workspace resources, and an audit record is persisted without logging sensitive data
