import { t } from './i18n';
import type { Terminal } from '@xterm/xterm';

export interface TerminalScrollbarOptions {
  container: HTMLElement;
  terminal: Terminal;
  onSendKey?: (key: 'page_up' | 'page_down') => void;
  isAlternateMode?: () => boolean;
}

export class TerminalScrollbar {
  private readonly container: HTMLElement;
  private readonly terminal: Terminal;
  private readonly onSendKey?: (key: 'page_up' | 'page_down') => void;
  private readonly isAlternateMode?: () => boolean;

  private rootEl: HTMLElement | null = null;
  private upBtn: HTMLButtonElement | null = null;
  private downBtn: HTMLButtonElement | null = null;
  private trackEl: HTMLElement | null = null;
  private thumbEl: HTMLElement | null = null;

  private dragging = false;
  private dragPointerId: number | null = null;
  private dragStartY = 0;
  private dragStartThumbTop = 0;
  private dragAccumulator = 0;
  private updateFrame: number | null = null;
  private resizeObserver: ResizeObserver | null = null;

  private disposables: Array<() => void> = [];

  constructor(options: TerminalScrollbarOptions) {
    this.container = options.container;
    this.terminal = options.terminal;
    this.onSendKey = options.onSendKey;
    this.isAlternateMode = options.isAlternateMode;

    this.mount();
  }

  private mount(): void {
    if (this.rootEl) return;

    const root = document.createElement('div');
    root.className = 'terminal-scrollbar';
    root.setAttribute('role', 'scrollbar');
    root.setAttribute('aria-orientation', 'vertical');

    const upBtn = document.createElement('button');
    upBtn.type = 'button';
    upBtn.className = 'terminal-scrollbar-btn terminal-scrollbar-btn-up';
    upBtn.title = t('terminal.scrollUp');
    upBtn.setAttribute('aria-label', t('terminal.scrollUp'));
    upBtn.innerHTML = `
      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 8l-6 6 1.41 1.41L12 10.83l4.59 4.58L18 14z"/>
      </svg>
    `;

    const track = document.createElement('div');
    track.className = 'terminal-scrollbar-track';

    const thumb = document.createElement('div');
    thumb.className = 'terminal-scrollbar-thumb';
    track.appendChild(thumb);

    const downBtn = document.createElement('button');
    downBtn.type = 'button';
    downBtn.className = 'terminal-scrollbar-btn terminal-scrollbar-btn-down';
    downBtn.title = t('terminal.scrollDown');
    downBtn.setAttribute('aria-label', t('terminal.scrollDown'));
    downBtn.innerHTML = `
      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
        <path d="M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z"/>
      </svg>
    `;

    root.appendChild(upBtn);
    root.appendChild(track);
    root.appendChild(downBtn);

    this.container.appendChild(root);

    this.rootEl = root;
    this.upBtn = upBtn;
    this.downBtn = downBtn;
    this.trackEl = track;
    this.thumbEl = thumb;

    this.setupListeners();
    this.resizeObserver = new ResizeObserver(() => this.update());
    this.resizeObserver.observe(this.container);
    this.update();
  }

  private setupListeners(): void {
    if (!this.rootEl || !this.upBtn || !this.downBtn || !this.trackEl || !this.thumbEl) return;

    // Up button click
    const handleUpClick = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const isAlt = this.isAlt();
      if (isAlt) {
        this.onSendKey?.('page_up');
      } else {
        const rows = Math.max(1, Math.floor(this.terminal.rows / 2));
        this.terminal.scrollLines(-rows);
      }
      this.update();
    };
    this.upBtn.addEventListener('click', handleUpClick);

    // Down button click
    const handleDownClick = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const isAlt = this.isAlt();
      if (isAlt) {
        this.onSendKey?.('page_down');
      } else {
        const rows = Math.max(1, Math.floor(this.terminal.rows / 2));
        this.terminal.scrollLines(rows);
      }
      this.update();
    };
    this.downBtn.addEventListener('click', handleDownClick);

    // Track click (paging)
    const handleTrackClick = (e: MouseEvent) => {
      if (e.target === this.thumbEl) return;
      e.preventDefault();
      e.stopPropagation();
      const rect = this.trackEl!.getBoundingClientRect();
      const clickY = e.clientY - rect.top;
      const thumbTop = parseFloat(this.thumbEl!.dataset.top || '0');
      const thumbHeight = this.thumbEl!.offsetHeight;
      const isAlt = this.isAlt();

      if (clickY < thumbTop) {
        if (isAlt) {
          this.onSendKey?.('page_up');
        } else {
          this.terminal.scrollPages(-1);
        }
      } else if (clickY > thumbTop + thumbHeight) {
        if (isAlt) {
          this.onSendKey?.('page_down');
        } else {
          this.terminal.scrollPages(1);
        }
      }
      this.update();
    };
    this.trackEl.addEventListener('click', handleTrackClick);

    // Thumb dragging
    const handlePointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      this.dragging = true;
      this.dragPointerId = e.pointerId;
      this.dragStartY = e.clientY;
      this.dragStartThumbTop = parseFloat(this.thumbEl!.dataset.top || '0');
      this.dragAccumulator = 0;
      this.rootEl?.classList.add('dragging');

      try {
        this.thumbEl?.setPointerCapture(e.pointerId);
      } catch {
        /* synthetic/test environments */
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!this.dragging || e.pointerId !== this.dragPointerId) return;
      e.preventDefault();
      e.stopPropagation();

      const deltaY = e.clientY - this.dragStartY;
      const isAlt = this.isAlt();

      if (isAlt) {
        this.dragAccumulator += deltaY;
        this.dragStartY = e.clientY;
        const step = 28;
        if (Math.abs(this.dragAccumulator) >= step) {
          const isUp = this.dragAccumulator < 0;
          this.onSendKey?.(isUp ? 'page_up' : 'page_down');
          this.dragAccumulator = 0;
        }
        return;
      }

      // Normal mode drag
      const trackHeight = this.trackEl!.clientHeight;
      const thumbHeight = this.thumbEl!.offsetHeight;
      const available = Math.max(1, trackHeight - thumbHeight);
      const newTop = Math.max(0, Math.min(available, this.dragStartThumbTop + deltaY));
      const fraction = newTop / available;
      const buffer = this.terminal.buffer.active;
      const targetLine = Math.round(fraction * buffer.baseY);
      this.terminal.scrollToLine(targetLine);
      this.updateThumbPosition(newTop, thumbHeight);
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (!this.dragging || e.pointerId !== this.dragPointerId) return;
      this.dragging = false;
      this.dragPointerId = null;
      this.rootEl?.classList.remove('dragging');
      try {
        if (this.thumbEl?.hasPointerCapture(e.pointerId)) {
          this.thumbEl.releasePointerCapture(e.pointerId);
        }
      } catch {
        /* synthetic */
      }
      this.update();
    };

    this.thumbEl.addEventListener('pointerdown', handlePointerDown);
    this.thumbEl.addEventListener('pointermove', handlePointerMove);
    this.thumbEl.addEventListener('pointerup', handlePointerUp);
    this.thumbEl.addEventListener('pointercancel', handlePointerUp);
    this.thumbEl.addEventListener('lostpointercapture', handlePointerUp);

    this.disposables.push(() => {
      this.upBtn?.removeEventListener('click', handleUpClick);
      this.downBtn?.removeEventListener('click', handleDownClick);
      this.trackEl?.removeEventListener('click', handleTrackClick);
      this.thumbEl?.removeEventListener('pointerdown', handlePointerDown);
      this.thumbEl?.removeEventListener('pointermove', handlePointerMove);
      this.thumbEl?.removeEventListener('pointerup', handlePointerUp);
      this.thumbEl?.removeEventListener('pointercancel', handlePointerUp);
      this.thumbEl?.removeEventListener('lostpointercapture', handlePointerUp);
    });
  }

  private isAlt(): boolean {
    if (this.isAlternateMode) return this.isAlternateMode();
    return this.terminal.buffer.active.type === 'alternate';
  }

  public update(): void {
    if (!this.rootEl || !this.trackEl || !this.thumbEl) return;
    if (this.dragging) return;

    // Keep visibility current immediately, but measure the track only once per
    // frame after output parsing and layout have settled.
    const isAlt = this.isAlt();
    const visible = isAlt || this.terminal.buffer.active.baseY > 0;
    this.rootEl.classList.toggle('visible', visible);
    this.rootEl.classList.toggle('hidden-scrollbar', !visible);
    this.rootEl.classList.toggle('alt-mode', isAlt);
    if (!visible || this.updateFrame !== null) return;

    this.updateFrame = requestAnimationFrame(() => {
      this.updateFrame = null;
      this.updateGeometry();
    });
  }

  private updateGeometry(): void {
    if (!this.rootEl || !this.trackEl || !this.thumbEl || this.dragging) return;
    const isAlt = this.isAlt();
    const buffer = this.terminal.buffer.active;
    const trackHeight = this.trackEl.clientHeight;
    if (trackHeight <= 0) return;

    if (isAlt) {
      const thumbHeight = Math.min(trackHeight, 36);
      const top = Math.max(0, Math.floor((trackHeight - thumbHeight) / 2));
      this.updateThumbPosition(top, thumbHeight);
      this.thumbEl.title = `${t('terminal.scrollUp')} / ${t('terminal.scrollDown')}`;
      return;
    }

    if (buffer.baseY <= 0) return;
    this.thumbEl.removeAttribute('title');
    this.rootEl.setAttribute('aria-valuemin', '0');
    this.rootEl.setAttribute('aria-valuemax', String(buffer.baseY));
    this.rootEl.setAttribute('aria-valuenow', String(buffer.viewportY));

    const rows = this.terminal.rows;
    const totalLines = buffer.baseY + rows;
    const thumbHeight = Math.max(24, Math.min(trackHeight, Math.round((rows / totalLines) * trackHeight)));
    const available = Math.max(1, trackHeight - thumbHeight);
    const fraction = buffer.baseY > 0 ? Math.max(0, Math.min(1, buffer.viewportY / buffer.baseY)) : 1;
    const thumbTop = Math.round(fraction * available);

    this.updateThumbPosition(thumbTop, thumbHeight);
  }

  private updateThumbPosition(top: number, height: number): void {
    if (!this.thumbEl) return;
    this.thumbEl.style.height = `${height}px`;
    this.thumbEl.style.transform = `translateY(${top}px)`;
    this.thumbEl.dataset.top = String(top);
  }

  public getRootElement(): HTMLElement | null {
    return this.rootEl;
  }

  public dispose(): void {
    if (this.updateFrame !== null) cancelAnimationFrame(this.updateFrame);
    this.updateFrame = null;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    for (const d of this.disposables) d();
    this.disposables = [];
    this.rootEl?.remove();
    this.rootEl = null;
    this.upBtn = null;
    this.downBtn = null;
    this.trackEl = null;
    this.thumbEl = null;
  }
}
