// Copyright (c) 2026 888CloudSSH contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import { t, translateDocument } from './i18n';
import { confirmAction, notify, requestText } from './ui-feedback';

export function isPasskeySupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.PublicKeyCredential !== undefined &&
    typeof window.PublicKeyCredential === 'function'
  );
}

export function base64UrlToBytes(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4 === 0 ? '' : '='.repeat(4 - (base64.length % 4));
  const binary = atob(base64 + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function loginWithPasskey(turnstileToken?: string): Promise<{
  success: boolean;
  account_id: string;
  email: string;
}> {
  if (!isPasskeySupported()) {
    throw new Error(t('auth.passkeyNotSupported'));
  }

  // 1. Get challenge
  const chalRes = await fetch('/api/auth/passkey/login-challenge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ turnstile_token: turnstileToken }),
  });
  if (!chalRes.ok) {
    const err = (await chalRes.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || 'Failed to start passkey login');
  }
  const chalData = (await chalRes.json()) as { challenge: string; rpId: string };

  // 2. Call navigator.credentials.get
  const challengeBytes = base64UrlToBytes(chalData.challenge);
  let assertion: any;
  try {
    assertion = await navigator.credentials.get({
      publicKey: {
        challenge: challengeBytes,
        rpId: chalData.rpId,
        userVerification: 'preferred',
        timeout: 60000,
      },
    });
  } catch (e: any) {
    if (e.name === 'NotAllowedError') {
      throw new Error(t('auth.passkeyCancelled'));
    }
    throw e;
  }

  if (!assertion) {
    throw new Error(t('auth.passkeyCancelled'));
  }

  // 3. Post to /api/auth/passkey/login
  const loginRes = await fetch('/api/auth/passkey/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      assertion: {
        id: assertion.id,
        rawId: bytesToBase64Url(new Uint8Array(assertion.rawId)),
        response: {
          clientDataJSON: bytesToBase64Url(new Uint8Array(assertion.response.clientDataJSON)),
          authenticatorData: bytesToBase64Url(new Uint8Array(assertion.response.authenticatorData)),
          signature: bytesToBase64Url(new Uint8Array(assertion.response.signature)),
          userHandle: assertion.response.userHandle
            ? bytesToBase64Url(new Uint8Array(assertion.response.userHandle))
            : undefined,
        },
      },
      turnstile_token: turnstileToken,
    }),
  });

  const data = (await loginRes.json()) as {
    success: boolean;
    error?: string;
    account_id: string;
    email: string;
  };
  if (!loginRes.ok || !data.success) {
    throw new Error(data.error || 'Passkey login failed');
  }
  return data;
}

export async function registerPasskey(name?: string): Promise<{
  success: boolean;
  id: string;
  name: string;
}> {
  if (!isPasskeySupported()) {
    throw new Error(t('auth.passkeyNotSupported'));
  }

  // 1. Get challenge
  const chalRes = await fetch('/api/auth/passkey/register-challenge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!chalRes.ok) {
    const err = (await chalRes.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || 'Failed to start passkey registration');
  }
  const chalData = (await chalRes.json()) as {
    challenge: string;
    rp: { name: string; id: string };
    user: { id: string; name: string; displayName: string };
    pubKeyCredParams: Array<{ type: string; alg: number }>;
    authenticatorSelection?: any;
    timeout?: number;
    attestation?: any;
  };

  // 2. Call navigator.credentials.create
  const challengeBytes = base64UrlToBytes(chalData.challenge);
  const userIdBytes = new TextEncoder().encode(chalData.user.id);

  let credential: any;
  try {
    credential = await navigator.credentials.create({
      publicKey: {
        challenge: challengeBytes,
        rp: chalData.rp,
        user: {
          id: userIdBytes,
          name: chalData.user.name,
          displayName: chalData.user.displayName,
        },
        pubKeyCredParams: chalData.pubKeyCredParams as PublicKeyCredentialParameters[],
        authenticatorSelection: chalData.authenticatorSelection,
        timeout: chalData.timeout || 60000,
        attestation: chalData.attestation || 'none',
      },
    });
  } catch (e: any) {
    if (e.name === 'NotAllowedError') {
      throw new Error(t('auth.passkeyCancelled'));
    }
    throw e;
  }

  if (!credential) {
    throw new Error(t('auth.passkeyCancelled'));
  }

  // 3. Post to /api/auth/passkey/register
  const regRes = await fetch('/api/auth/passkey/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: name || undefined,
      registration: {
        id: credential.id,
        rawId: bytesToBase64Url(new Uint8Array(credential.rawId)),
        response: {
          clientDataJSON: bytesToBase64Url(new Uint8Array(credential.response.clientDataJSON)),
          attestationObject: bytesToBase64Url(new Uint8Array(credential.response.attestationObject)),
        },
      },
    }),
  });

  const data = (await regRes.json()) as {
    success: boolean;
    error?: string;
    id: string;
    name: string;
  };
  if (!regRes.ok || !data.success) {
    throw new Error(data.error || 'Passkey registration failed');
  }
  return data;
}

export interface PasskeyInfo {
  id: string;
  name: string;
  created_at: number;
  last_used_at: number | null;
}

export async function listPasskeys(): Promise<PasskeyInfo[]> {
  const res = await fetch('/api/user/passkeys');
  if (!res.ok) {
    throw new Error('Failed to list passkeys');
  }
  const data = (await res.json()) as { passkeys?: PasskeyInfo[] };
  return data.passkeys || [];
}

export async function deletePasskey(id: string): Promise<void> {
  const res = await fetch(`/api/user/passkeys/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || 'Failed to delete passkey');
  }
}

/**
 * 彈出 Touch ID / Passkey 管理對話框
 */
export async function showPasskeyManagerModal(): Promise<void> {
  if (document.getElementById('passkey-manager-modal')) return;

  const overlay = document.createElement('div');
  overlay.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm';
  overlay.id = 'passkey-manager-modal';

  // pi-lens-ignore: no-inner-html
  overlay.innerHTML = `
    <div class="cyber-box w-full max-w-lg p-6 relative shadow-2xl bg-surface border border-dim text-on-surface">
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-2 text-[var(--accent)]">
          <span class="material-symbols-outlined" style="font-size: 24px;">fingerprint</span>
          <h3 class="text-sm font-bold tracking-[0.1em] uppercase" data-i18n="auth.passkeyManagerTitle">${t('auth.passkeyManagerTitle')}</h3>
        </div>
        <button id="close-passkey-manager-x" type="button" class="text-muted hover:text-primary transition-colors cursor-pointer bg-transparent border-0 p-1">
          <span class="material-symbols-outlined" style="font-size: 20px;">close</span>
        </button>
      </div>

      <p class="text-xs text-muted leading-relaxed mb-4" data-i18n="auth.passkeyManagerHint">
        ${t('auth.passkeyManagerHint')}
      </p>

      <div class="mb-4">
        <button
          id="add-passkey-btn"
          type="button"
          class="connect-btn w-full py-2.5 px-4 text-xs font-bold tracking-[0.1em] uppercase flex items-center justify-center gap-2"
        >
          <span class="material-symbols-outlined" style="font-size: 18px;">add</span>
          <span data-i18n="auth.addPasskey">${t('auth.addPasskey')}</span>
        </button>
      </div>

      <div id="passkey-list-container" class="space-y-2 max-h-60 overflow-y-auto mb-4">
        <div class="text-center py-6 text-muted text-xs">載入中…</div>
      </div>

      <div class="pt-3 border-t border-dim flex justify-end">
        <button id="close-passkey-manager-btn" type="button" class="cyber-button py-2 px-5 text-xs font-bold border border-dim">
          關閉
        </button>
      </div>
    </div>
  `;

  translateDocument(overlay);
  document.body.appendChild(overlay);

  const close = () => {
    overlay.remove();
  };

  overlay.querySelector('#close-passkey-manager-x')?.addEventListener('click', close);
  overlay.querySelector('#close-passkey-manager-btn')?.addEventListener('click', close);

  const listContainer = overlay.querySelector('#passkey-list-container') as HTMLElement;
  const addBtn = overlay.querySelector('#add-passkey-btn') as HTMLButtonElement;

  const renderPasskeys = async () => {
    try {
      const passkeys = await listPasskeys();
      if (passkeys.length === 0) {
        listContainer.innerHTML = `
          <div class="p-6 text-center text-xs text-muted bg-elevated border border-dim rounded">
            ${t('auth.noPasskeys')}
          </div>
        `;
        return;
      }

      listContainer.innerHTML = passkeys
        .map((p) => {
          const created = new Date(p.created_at).toLocaleString();
          const lastUsed = p.last_used_at
            ? new Date(p.last_used_at).toLocaleString()
            : t('auth.neverUsed');
          return `
            <div class="flex items-center justify-between p-3 bg-elevated border border-dim rounded hover:border-[var(--accent)]/50 transition-colors">
              <div class="flex items-center gap-3">
                <span class="material-symbols-outlined text-[var(--accent)]" style="font-size: 20px;">fingerprint</span>
                <div>
                  <div class="text-xs font-bold text-on-surface">${escapeHtml(p.name)}</div>
                  <div class="text-[11px] text-muted flex gap-3 mt-0.5">
                    <span>${t('auth.createdAt', { time: created })}</span>
                    <span>•</span>
                    <span>${t('auth.lastUsed', { time: lastUsed })}</span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                data-delete-id="${p.id}"
                class="delete-passkey-btn text-muted hover:text-red-400 p-1.5 transition-colors cursor-pointer bg-transparent border-0"
                title="刪除"
              >
                <span class="material-symbols-outlined" style="font-size: 18px;">delete</span>
              </button>
            </div>
          `;
        })
        .join('');

      listContainer.querySelectorAll('.delete-passkey-btn').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          const target = e.currentTarget as HTMLElement;
          const id = target.getAttribute('data-delete-id');
          if (!id) return;
          const confirmed = await confirmAction({
            message: t('auth.passkeyDeleteConfirm'),
            variant: 'danger',
          });
          if (!confirmed) return;

          try {
            await deletePasskey(id);
            notify(t('auth.passkeyDeleted'), { variant: 'info' });
            void renderPasskeys();
          } catch (err: any) {
            notify(err.message || 'Delete failed', { variant: 'danger' });
          }
        });
      });
    } catch (err: any) {
      listContainer.innerHTML = `
        <div class="p-4 text-center text-xs text-red-400 bg-elevated border border-dim rounded">
          ${err.message || 'Failed to load passkeys'}
        </div>
      `;
    }
  };

  addBtn.addEventListener('click', async () => {
    let defaultName = 'Passkey';
    if (typeof navigator !== 'undefined' && navigator.userAgent) {
      if (navigator.userAgent.includes('Mac')) defaultName = 'MacBook Touch ID';
      else if (navigator.userAgent.includes('iPhone')) defaultName = 'iPhone Face ID';
      else if (navigator.userAgent.includes('iPad')) defaultName = 'iPad Touch ID';
      else if (navigator.userAgent.includes('Windows')) defaultName = 'Windows Hello';
      else if (navigator.userAgent.includes('Android')) defaultName = 'Android Passkey';
    }

    const deviceName = await requestText({
      message: t('auth.passkeyNamePrompt'),
      defaultValue: defaultName,
    });
    if (deviceName === null) return; // cancelled prompt

    addBtn.disabled = true;
    addBtn.textContent = '註冊中…';

    try {
      await registerPasskey(deviceName || defaultName);
      notify(t('auth.passkeyAdded'), { variant: 'info' });
      void renderPasskeys();
    } catch (err: any) {
      notify(err.message || 'Registration failed', { variant: 'warning' });
    } finally {
      addBtn.disabled = false;
      addBtn.innerHTML = `
        <span class="material-symbols-outlined" style="font-size: 18px;">add</span>
        <span>${t('auth.addPasskey')}</span>
      `;
    }
  });

  void renderPasskeys();
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
