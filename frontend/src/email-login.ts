// Copyright (c) 2026 888CloudSSH contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import { t, translateDocument, type TranslationKey } from './i18n';
import { notify } from './ui-feedback';
import { isPasskeySupported, loginWithPasskey } from './passkey';

export interface EmailLoginFormOptions {
  container: HTMLElement;
  turnstileEnabled?: boolean;
  turnstileSitekey?: string;
  onLoginSuccess: (user: any) => void;
  onSwitchToDirect?: () => void;
}

export class EmailLoginForm {
  private options: EmailLoginFormOptions;
  private challengeId: string | null = null;
  private countdownTimer: number | null = null;
  private countdownRemaining = 0;
  private isRecoveryMode = false;
  private turnstileWidgetId: string | null = null;
  private turnstileToken: string | null = null;

  constructor(options: EmailLoginFormOptions) {
    this.options = options;
    this.render();
  }

  public render(): void {
    const showPasskey = isPasskeySupported();
    // pi-lens-ignore: no-inner-html
    this.options.container.innerHTML = `
      <div id="email-login-panel" class="space-y-5">
        ${
          showPasskey
            ? `
        <!-- Passkey 1-Click Login -->
        <div id="passkey-login-container" class="space-y-3">
          <button
            id="passkey-login-btn"
            type="button"
            class="cyber-button w-full py-3 px-4 text-xs font-bold tracking-[0.1em] uppercase flex items-center justify-center gap-2 border border-[var(--accent)]/50 hover:border-[var(--accent)] text-[var(--accent)] bg-elevated hover:bg-surface transition-all shadow-sm"
          >
            <span class="material-symbols-outlined" style="font-size: 20px;">fingerprint</span>
            <span data-i18n="auth.passkeyLoginAction">${t('auth.passkeyLoginAction')}</span>
          </button>
          <div class="relative flex py-1 items-center">
            <div class="flex-grow border-t border-dim"></div>
            <span class="flex-shrink mx-3 text-[11px] text-muted tracking-wider" data-i18n="auth.orEmailOtp">${t('auth.orEmailOtp')}</span>
            <div class="flex-grow border-t border-dim"></div>
          </div>
        </div>
        `
            : ''
        }
        <!-- OTP Login Mode -->
        <div id="email-otp-view" class="space-y-4">
          <div class="space-y-1.5">
            <label for="email-input" class="block text-xs font-bold tracking-[0.1em] text-muted uppercase" data-i18n="auth.emailLabel">電子郵件</label>
            <div class="flex items-center">
              <span class="material-symbols-outlined text-muted mr-2" style="font-size: 16px;">mail</span>
              <input
                id="email-input"
                class="terminal-input text-[13px] w-full"
                type="email"
                placeholder="you@example.com"
                value=""
                autocomplete="email"
                required
              />
            </div>
          </div>

          <div id="email-turnstile-container" class="my-2" style="display: none;">
            <div id="email-turnstile-widget" class="flex justify-center"></div>
          </div>

          <!-- Step 1: Send OTP -->
          <div id="send-otp-container">
            <button
              id="send-otp-btn"
              type="button"
              class="connect-btn w-full py-3 px-4 text-xs font-bold tracking-[0.1em] uppercase flex items-center justify-center gap-2"
            >
              <span class="material-symbols-outlined" style="font-size: 18px;">send</span>
              <span data-i18n="auth.sendOtp">獲取驗證碼</span>
            </button>
          </div>

          <!-- Step 2: Input OTP & Verify -->
          <div id="verify-otp-container" class="space-y-3 hidden">
            <div class="space-y-1.5">
              <div class="flex justify-between items-center">
                <label for="otp-input" class="block text-xs font-bold tracking-[0.1em] text-muted uppercase" data-i18n="auth.otpCode">6 位數驗證碼</label>
                <button
                  id="resend-otp-btn"
                  type="button"
                  class="text-xs text-[var(--accent)] hover:underline cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled
                >
                  <span data-i18n="auth.resendReady">重新發送驗證碼</span>
                </button>
              </div>
              <div class="flex items-center">
                <span class="material-symbols-outlined text-muted mr-2" style="font-size: 16px;">lock</span>
                <input
                  id="otp-input"
                  class="terminal-input text-center text-base font-mono tracking-[0.4em] font-bold w-full"
                  type="text"
                  inputmode="numeric"
                  pattern="[0-9]{6}"
                  maxlength="6"
                  placeholder="······"
                  autocomplete="one-time-code"
                />
              </div>
            </div>

            <button
              id="verify-otp-btn"
              type="button"
              class="connect-btn w-full py-3 px-4 text-xs font-bold tracking-[0.1em] uppercase flex items-center justify-center gap-2"
            >
              <span class="material-symbols-outlined" style="font-size: 18px;">login</span>
              <span data-i18n="auth.verifyAndLogin">驗證並登入</span>
            </button>
          </div>
        </div>

        <!-- Recovery Code Mode -->
        <div id="email-recovery-view" class="space-y-4 hidden">
          <div class="space-y-1.5">
            <label for="recovery-email-input" class="block text-xs font-bold tracking-[0.1em] text-muted uppercase" data-i18n="auth.emailLabel">電子郵件</label>
            <div class="flex items-center">
              <span class="material-symbols-outlined text-muted mr-2" style="font-size: 16px;">mail</span>
              <input
                id="recovery-email-input"
                class="terminal-input text-[13px] w-full"
                type="email"
                placeholder="you@example.com"
                value=""
                autocomplete="email"
                required
              />
            </div>
          </div>

          <div class="space-y-1.5">
            <label for="recovery-code-input" class="block text-xs font-bold tracking-[0.1em] text-muted uppercase" data-i18n="auth.recoveryCode">8 位救援碼 (xxxx-xxxx)</label>
            <div class="flex items-center">
              <span class="material-symbols-outlined text-muted mr-2" style="font-size: 16px;">vpn_key</span>
              <input
                id="recovery-code-input"
                class="terminal-input text-center text-sm font-mono tracking-[0.2em] w-full uppercase"
                type="text"
                maxlength="9"
                placeholder="abcd-1234"
              />
            </div>
          </div>

          <button
            id="verify-recovery-btn"
            type="button"
            class="connect-btn w-full py-3 px-4 text-xs font-bold tracking-[0.1em] uppercase flex items-center justify-center gap-2"
          >
            <span class="material-symbols-outlined" style="font-size: 18px;">key</span>
            <span data-i18n="auth.recoveryLoginAction">救援登入</span>
          </button>
        </div>

        <!-- Footer / Switching options -->
        <div class="pt-3 border-t border-dim flex items-center justify-between text-xs">
          <button
            id="toggle-mode-btn"
            type="button"
            class="text-muted hover:text-primary transition-colors flex items-center gap-1 cursor-pointer bg-transparent border-0 p-0"
          >
            <span class="material-symbols-outlined" style="font-size: 14px;">key</span>
            <span id="toggle-mode-label" data-i18n="auth.useRecoveryCode">使用救援碼登入</span>
          </button>
          ${
            this.options.onSwitchToDirect
              ? `
              <button
                id="switch-to-direct-btn"
                type="button"
                class="text-muted hover:text-primary transition-colors flex items-center gap-1 cursor-pointer bg-transparent border-0 p-0"
              >
                <span class="material-symbols-outlined" style="font-size: 14px;">terminal</span>
                <span data-i18n="auth.directTab">匿名連線</span>
              </button>
              `
              : ''
          }
        </div>
      </div>
    `;

    translateDocument(this.options.container);
    this.bindEvents();
    this.initTurnstile();
  }

  private initTurnstile(): void {
    if (!this.options.turnstileEnabled || !this.options.turnstileSitekey || !window.turnstile) {
      return;
    }
    const container = document.getElementById('email-turnstile-widget');
    const wrapper = document.getElementById('email-turnstile-container');
    if (!container || !wrapper) return;

    wrapper.style.display = 'block';
    if (this.turnstileWidgetId) {
      window.turnstile.remove(this.turnstileWidgetId);
    }
    this.turnstileWidgetId = window.turnstile.render(container, {
      sitekey: this.options.turnstileSitekey,
      theme: 'dark',
      callback: (token: string) => {
        this.turnstileToken = token;
      },
    });
  }

  private bindEvents(): void {
    const sendBtn = document.getElementById('send-otp-btn');
    const verifyBtn = document.getElementById('verify-otp-btn');
    const resendBtn = document.getElementById('resend-otp-btn');
    const toggleBtn = document.getElementById('toggle-mode-btn');
    const recoveryBtn = document.getElementById('verify-recovery-btn');
    const directBtn = document.getElementById('switch-to-direct-btn');
    const otpInput = document.getElementById('otp-input') as HTMLInputElement | null;
    const emailInput = document.getElementById('email-input') as HTMLInputElement | null;

    const passkeyBtn = document.getElementById('passkey-login-btn');
    passkeyBtn?.addEventListener('click', () => void this.handlePasskeyLogin());

    sendBtn?.addEventListener('click', () => void this.handleSendOtp());
    resendBtn?.addEventListener('click', () => void this.handleSendOtp());
    verifyBtn?.addEventListener('click', () => void this.handleVerifyOtp());
    recoveryBtn?.addEventListener('click', () => void this.handleVerifyRecovery());

    toggleBtn?.addEventListener('click', () => {
      this.isRecoveryMode = !this.isRecoveryMode;
      const otpView = document.getElementById('email-otp-view');
      const recoveryView = document.getElementById('email-recovery-view');
      const toggleLabel = document.getElementById('toggle-mode-label');
      if (this.isRecoveryMode) {
        otpView?.classList.add('hidden');
        recoveryView?.classList.remove('hidden');
        if (toggleLabel) toggleLabel.textContent = t('auth.backToOtp');
      } else {
        otpView?.classList.remove('hidden');
        recoveryView?.classList.add('hidden');
        if (toggleLabel) toggleLabel.textContent = t('auth.useRecoveryCode');
      }
    });

    directBtn?.addEventListener('click', () => {
      this.options.onSwitchToDirect?.();
    });

    emailInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void this.handleSendOtp();
      }
    });

    otpInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void this.handleVerifyOtp();
      }
    });
  }

  private async handlePasskeyLogin(): Promise<void> {
    const passkeyBtn = document.getElementById('passkey-login-btn') as HTMLButtonElement | null;
    if (passkeyBtn) {
      passkeyBtn.disabled = true;
      passkeyBtn.textContent = t('auth.verifying');
    }

    try {
      await loginWithPasskey(this.turnstileToken || undefined);
      notify(t('feedback.success'), { variant: 'info' });
      try {
        const meRes = await fetch('/api/auth/me');
        if (meRes.ok) {
          const user = await meRes.json();
          this.options.onLoginSuccess(user);
          return;
        }
      } catch {
        /* fallback reload */
      }
      window.location.reload();
    } catch (e: any) {
      notify(e.message || String(e), { variant: 'warning' });
      if (passkeyBtn) {
        passkeyBtn.disabled = false;
        passkeyBtn.innerHTML = `
          <span class="material-symbols-outlined" style="font-size: 20px;">fingerprint</span>
          <span data-i18n="auth.passkeyLoginAction">${t('auth.passkeyLoginAction')}</span>
        `;
      }
    }
  }

  private async handleSendOtp(): Promise<void> {
    const emailInput = document.getElementById('email-input') as HTMLInputElement | null;
    const email = emailInput?.value.trim() || '';
    if (!email || !email.includes('@')) {
      notify(t('dialog.inputRequired'), { variant: 'warning' });
      emailInput?.focus();
      return;
    }

    const sendBtn = document.getElementById('send-otp-btn') as HTMLButtonElement | null;
    if (sendBtn) {
      sendBtn.disabled = true;
      sendBtn.textContent = t('auth.sendingOtp');
    }

    try {
      const response = await fetch('/api/auth/email/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          turnstile_token: this.turnstileToken || undefined,
        }),
      });

      const data = (await response.json()) as {
        success?: boolean;
        error?: string;
        challenge_id?: string;
        debug_code?: string;
      };

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Request OTP failed');
      }

      this.challengeId = data.challenge_id || null;

      notify(t('auth.otpSent'), { variant: 'info' });

      // Reveal Step 2
      const sendContainer = document.getElementById('send-otp-container');
      const verifyContainer = document.getElementById('verify-otp-container');
      sendContainer?.classList.add('hidden');
      verifyContainer?.classList.remove('hidden');

      const otpInput = document.getElementById('otp-input') as HTMLInputElement | null;
      if (data.debug_code) {
        notify(t('auth.testOtpNotice', { code: data.debug_code }), { variant: 'info' });
      }
      otpInput?.focus();

      this.startCountdown(60);
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), { variant: 'danger' });
      if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.innerHTML = `
          <span class="material-symbols-outlined" style="font-size: 18px;">send</span>
          <span>${t('auth.sendOtp')}</span>
        `;
      }
    }
  }

  private startCountdown(seconds: number): void {
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    this.countdownRemaining = seconds;
    const resendBtn = document.getElementById('resend-otp-btn') as HTMLButtonElement | null;
    if (!resendBtn) return;

    resendBtn.disabled = true;
    resendBtn.textContent = t('auth.resendOtp', { seconds: this.countdownRemaining });

    this.countdownTimer = window.setInterval(() => {
      this.countdownRemaining--;
      if (this.countdownRemaining <= 0) {
        clearInterval(this.countdownTimer!);
        this.countdownTimer = null;
        resendBtn.disabled = false;
        resendBtn.textContent = t('auth.resendReady');
      } else {
        resendBtn.textContent = t('auth.resendOtp', { seconds: this.countdownRemaining });
      }
    }, 1000);
  }

  private async handleVerifyOtp(): Promise<void> {
    const emailInput = document.getElementById('email-input') as HTMLInputElement | null;
    const otpInput = document.getElementById('otp-input') as HTMLInputElement | null;
    const email = emailInput?.value.trim() || '';
    const code = otpInput?.value.trim() || '';

    if (!code || code.length < 6) {
      notify(t('dialog.inputRequired'), { variant: 'warning' });
      otpInput?.focus();
      return;
    }

    const verifyBtn = document.getElementById('verify-otp-btn') as HTMLButtonElement | null;
    if (verifyBtn) {
      verifyBtn.disabled = true;
      verifyBtn.textContent = t('auth.verifying');
    }

    try {
      const response = await fetch('/api/auth/email/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          code,
          challenge_id: this.challengeId || undefined,
          turnstile_token: this.turnstileToken || undefined,
        }),
      });

      const data = (await response.json()) as {
        success?: boolean;
        error?: string;
        account_id?: string;
        email?: string;
        recovery_codes?: string[];
      };

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Verification failed');
      }

      notify(t('feedback.success'), { variant: 'info' });

      const onComplete = async () => {
        try {
          const meRes = await fetch('/api/auth/me');
          if (meRes.ok) {
            const user = await meRes.json();
            this.options.onLoginSuccess(user);
            return;
          }
        } catch {
          /* reload fallback */
        }
        window.location.reload();
      };

      if (data.recovery_codes && data.recovery_codes.length > 0) {
        showRecoveryCodesModal(data.recovery_codes, () => {
          void onComplete();
        });
      } else {
        void onComplete();
      }
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), { variant: 'danger' });
      if (verifyBtn) {
        verifyBtn.disabled = false;
        verifyBtn.innerHTML = `
          <span class="material-symbols-outlined" style="font-size: 18px;">login</span>
          <span>${t('auth.verifyAndLogin')}</span>
        `;
      }
    }
  }

  private async handleVerifyRecovery(): Promise<void> {
    const emailInput = document.getElementById('recovery-email-input') as HTMLInputElement | null;
    const codeInput = document.getElementById('recovery-code-input') as HTMLInputElement | null;
    const email = emailInput?.value.trim() || '';
    const recoveryCode = codeInput?.value.trim().toLowerCase() || '';

    if (!email || !recoveryCode) {
      notify(t('dialog.inputRequired'), { variant: 'warning' });
      return;
    }

    const btn = document.getElementById('verify-recovery-btn') as HTMLButtonElement | null;
    if (btn) {
      btn.disabled = true;
      btn.textContent = t('auth.verifying');
    }

    try {
      const response = await fetch('/api/auth/recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          recovery_code: recoveryCode,
          turnstile_token: this.turnstileToken || undefined,
        }),
      });

      const data = (await response.json()) as { success?: boolean; error?: string };
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Recovery login failed');
      }

      notify(t('feedback.success'), { variant: 'info' });
      const meRes = await fetch('/api/auth/me');
      if (meRes.ok) {
        const user = await meRes.json();
        this.options.onLoginSuccess(user);
      } else {
        window.location.reload();
      }
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), { variant: 'danger' });
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `
          <span class="material-symbols-outlined" style="font-size: 18px;">key</span>
          <span>${t('auth.recoveryLoginAction')}</span>
        `;
      }
    }
  }
}

/**
 * 彈出一次性救援碼備份對話框
 */
export function showRecoveryCodesModal(
  codes: string[],
  onClose: () => void,
  options?: { dismissTextKey?: TranslationKey }
): void {
  const overlay = document.createElement('div');
  overlay.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm';
  overlay.id = 'recovery-codes-modal';

  const codeListFormatted = codes.map((c, i) => `${i + 1}. ${c}`).join('\n');
  const dismissKey = options?.dismissTextKey || 'auth.enterWorkspace';

  // pi-lens-ignore: no-inner-html
  overlay.innerHTML = `
    <div class="cyber-box w-full max-w-md p-6 relative shadow-2xl bg-surface border border-dim text-on-surface">
      <div class="flex items-center gap-2 mb-3 text-[var(--accent)]">
        <span class="material-symbols-outlined" style="font-size: 24px;">shield</span>
        <h3 class="text-sm font-bold tracking-[0.1em] uppercase" data-i18n="auth.recoveryCodesModalTitle">請妥善備份緊急救援碼</h3>
      </div>
      <p class="text-xs text-muted leading-relaxed mb-4" data-i18n="auth.recoveryCodesModalHint">
        以下為您的 10 組一次性救援碼。當無法接收 Email 驗證碼時，每組救援碼可登入一次，請妥善保存。
      </p>

      <div class="grid grid-cols-2 gap-2 p-3 bg-elevated border border-dim font-mono text-xs tracking-wider mb-4 select-all">
        ${codes.map((code) => `<div class="p-1.5 text-center bg-surface border border-dim">${code}</div>`).join('')}
      </div>

      <div class="flex flex-col gap-2">
        <div class="flex gap-2">
          <button id="copy-recovery-codes-btn" type="button" class="cyber-button flex-1 py-2 text-xs font-bold flex items-center justify-center gap-1.5 border border-dim">
            <span class="material-symbols-outlined" style="font-size: 16px;">content_copy</span>
            <span data-i18n="auth.copyAllCodes">複製全部救援碼</span>
          </button>
          <button id="download-recovery-codes-btn" type="button" class="cyber-button flex-1 py-2 text-xs font-bold flex items-center justify-center gap-1.5 border border-dim">
            <span class="material-symbols-outlined" style="font-size: 16px;">download</span>
            <span data-i18n="auth.downloadCodes">下載備份檔</span>
          </button>
        </div>
        <button id="dismiss-recovery-codes-btn" type="button" class="connect-btn w-full py-2.5 text-xs font-bold tracking-[0.1em] uppercase mt-1">
          <span data-i18n="${dismissKey}">${t(dismissKey)}</span>
        </button>
      </div>
    </div>
  `;

  translateDocument(overlay);
  document.body.appendChild(overlay);

  overlay.querySelector('#copy-recovery-codes-btn')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(`CloudSSH Emergency Recovery Codes:\n${codeListFormatted}`);
      notify(t('auth.codesCopied'), { variant: 'info' });
    } catch {
      notify('Clipboard copy failed', { variant: 'warning' });
    }
  });

  overlay.querySelector('#download-recovery-codes-btn')?.addEventListener('click', () => {
    const blob = new Blob([`CloudSSH Emergency Recovery Codes:\n${codeListFormatted}\n`], {
      type: 'text/plain;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cloudssh-recovery-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
  });

  overlay.querySelector('#dismiss-recovery-codes-btn')?.addEventListener('click', () => {
    overlay.remove();
    onClose();
  });
}
