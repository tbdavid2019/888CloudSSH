import { expect, test } from '@playwright/test';
import { mockAnonymousSession } from './helpers';

test.describe('终端触控板与滚轮平滑滚动', () => {
  test('Mac 触控板微步手势在 normal 缓冲区平滑向上和向下滚动', async ({ page }) => {
    await mockAnonymousSession(page);
    await page.goto('/?lang=zh-CN');

    const result = await page.evaluate(async () => {
      const terminalModule = await (window as any).eval("import('/src/terminal.ts')");
      const root = document.createElement('div');
      root.id = 'terminal-wheel-test-root';
      root.style.position = 'fixed';
      root.style.left = '0';
      root.style.top = '0';
      root.style.width = '800px';
      root.style.height = '400px';
      root.style.zIndex = '9999';
      document.body.appendChild(root);

      const terminal = new terminalModule.SSHTerminal(root.id);
      terminal.mount();
      const xterm = terminal.xterm;

      // 写入 100 行以撑破视口产生历史滚动条
      const text = Array.from({ length: 100 }, (_, i) => `Terminal Output Line #${i}\r\n`).join('');
      await new Promise<void>((resolve) => xterm.write(text, resolve));

      (window as any).__testTerminal = terminal;

      return {
        initialBaseY: xterm.buffer.active.baseY,
        initialViewportY: xterm.buffer.active.viewportY,
      };
    });

    expect(result.initialBaseY).toBeGreaterThan(50);
    expect(result.initialViewportY).toBe(result.initialBaseY);

    // 鼠标移动到终端区域中心
    await page.mouse.move(400, 200);

    // 模拟 macOS 触控板双指向上滑动（微步 -15px）20 次
    for (let i = 0; i < 20; i++) {
      await page.mouse.wheel(0, -15);
      await page.waitForTimeout(16);
    }
    await page.waitForTimeout(100);

    const scrolledUp = await page.evaluate(() => {
      const xterm = (window as any).__testTerminal.xterm;
      return {
        baseY: xterm.buffer.active.baseY,
        viewportY: xterm.buffer.active.viewportY,
      };
    });

    // 向上滑动后，视口必须向上移动，看到上方历史输出
    expect(scrolledUp.viewportY).toBeLessThan(result.initialViewportY);

    // 模拟 macOS 触控板双指向下滑动（微步 +15px）20 次
    for (let i = 0; i < 20; i++) {
      await page.mouse.wheel(0, 15);
      await page.waitForTimeout(16);
    }
    await page.waitForTimeout(100);

    const scrolledDown = await page.evaluate(() => {
      const xterm = (window as any).__testTerminal.xterm;
      return {
        baseY: xterm.buffer.active.baseY,
        viewportY: xterm.buffer.active.viewportY,
      };
    });

    // 向下滑动后，视口必须向底部返回
    expect(scrolledDown.viewportY).toBeGreaterThan(scrolledUp.viewportY);
  });

  test('macOS 双指捏合缩放（ctrlKey=true）不触发终端行滚动', async ({ page }) => {
    await mockAnonymousSession(page);
    await page.goto('/?lang=zh-CN');

    const result = await page.evaluate(async () => {
      const terminalModule = await (window as any).eval("import('/src/terminal.ts')");
      const root = document.createElement('div');
      root.id = 'terminal-pinch-test-root';
      root.style.position = 'fixed';
      root.style.left = '0';
      root.style.top = '0';
      root.style.width = '800px';
      root.style.height = '400px';
      root.style.zIndex = '9999';
      document.body.appendChild(root);

      const terminal = new terminalModule.SSHTerminal(root.id);
      terminal.mount();
      const xterm = terminal.xterm;

      const text = Array.from({ length: 100 }, (_, i) => `Terminal Output Line #${i}\r\n`).join('');
      await new Promise<void>((resolve) => xterm.write(text, resolve));

      (window as any).__testTerminal = terminal;

      // 派发带 ctrlKey 的 WheelEvent（模拟 Mac 触控板 pinch 捏合缩放）
      const screen = root.querySelector('.xterm-screen')!;
      screen.dispatchEvent(
        new WheelEvent('wheel', {
          bubbles: true,
          cancelable: true,
          deltaY: -100,
          ctrlKey: true,
        })
      );

      return {
        baseY: xterm.buffer.active.baseY,
        viewportY: xterm.buffer.active.viewportY,
      };
    });

    // 捏合缩放不应当改变终端视口行数
    expect(result.viewportY).toBe(result.baseY);
  });

  test('alternate 备用缓冲下向服务端发送上下光标键序列以翻页', async ({ page }) => {
    await mockAnonymousSession(page);
    await page.goto('/?lang=zh-CN');

    const result = await page.evaluate(async () => {
      const terminalModule = await (window as any).eval("import('/src/terminal.ts')");
      const root = document.createElement('div');
      root.id = 'terminal-alt-test-root';
      root.style.position = 'fixed';
      root.style.left = '0';
      root.style.top = '0';
      root.style.width = '800px';
      root.style.height = '400px';
      root.style.zIndex = '9999';
      document.body.appendChild(root);

      const terminal = new terminalModule.SSHTerminal(root.id);
      terminal.mount();
      const xterm = terminal.xterm;

      // 模拟进入备用屏幕（CSI ? 1049 h）
      await new Promise<void>((resolve) => xterm.write('\x1b[?1049h', resolve));

      const sentInputs: string[] = [];
      terminal.sendInput = (data: string) => {
        sentInputs.push(data);
        return true;
      };

      const screen = root.querySelector('.xterm-screen')!;
      // 模拟向上滚动（微步累加超过一个字符行高度，如 -50px）
      screen.dispatchEvent(
        new WheelEvent('wheel', {
          bubbles: true,
          cancelable: true,
          deltaY: -50,
          deltaMode: 0,
        })
      );

      // 模拟向下滚动（+50px）
      screen.dispatchEvent(
        new WheelEvent('wheel', {
          bubbles: true,
          cancelable: true,
          deltaY: 50,
          deltaMode: 0,
        })
      );

      return {
        bufferType: xterm.buffer.active.type,
        sentInputs,
      };
    });

    expect(result.bufferType).toBe('alternate');
    expect(result.sentInputs.length).toBeGreaterThan(0);
    // 向上滑动发送 Up 箭头 (\x1b[A 或 \x1bOA)
    expect(result.sentInputs.some((seq) => seq.includes('\x1b[A') || seq.includes('\x1bOA'))).toBe(true);
    // 向下滑动发送 Down 箭头 (\x1b[B 或 \x1bOB)
    expect(result.sentInputs.some((seq) => seq.includes('\x1b[B') || seq.includes('\x1bOB'))).toBe(true);
  });

  test('normal 缓冲在无历史行（baseY=0，如 chat.hf.co 全屏 TUI）时滚轮向上向下发送光标键序列', async ({ page }) => {
    await mockAnonymousSession(page);
    await page.goto('/?lang=zh-CN');

    const result = await page.evaluate(async () => {
      const terminalModule = await (window as any).eval("import('/src/terminal.ts')");
      const root = document.createElement('div');
      root.id = 'terminal-tui-test-root';
      root.style.position = 'fixed';
      root.style.left = '0';
      root.style.top = '0';
      root.style.width = '800px';
      root.style.height = '400px';
      root.style.zIndex = '9999';
      document.body.appendChild(root);

      const terminal = new terminalModule.SSHTerminal(root.id);
      terminal.mount();
      const xterm = terminal.xterm;

      // 仅写入几行，未超出屏幕（baseY === 0，模拟全屏 TUI 应用）
      await new Promise<void>((resolve) => xterm.write('Welcome to chat.hf.co\r\nPrompt: ', resolve));

      const sentInputs: string[] = [];
      terminal.sendInput = (data: string) => {
        sentInputs.push(data);
        return true;
      };

      const screen = root.querySelector('.xterm-screen')!;
      // 模拟向上滚动（微步累加超过一个字符行高度，如 -50px）
      screen.dispatchEvent(
        new WheelEvent('wheel', {
          bubbles: true,
          cancelable: true,
          deltaY: -50,
          deltaMode: 0,
        })
      );

      // 模拟向下滚动（+50px）
      screen.dispatchEvent(
        new WheelEvent('wheel', {
          bubbles: true,
          cancelable: true,
          deltaY: 50,
          deltaMode: 0,
        })
      );

      return {
        baseY: xterm.buffer.active.baseY,
        bufferType: xterm.buffer.active.type,
        sentInputs,
      };
    });

    expect(result.baseY).toBe(0);
    expect(result.bufferType).toBe('normal');
    expect(result.sentInputs.length).toBeGreaterThan(0);
    expect(result.sentInputs.some((seq) => seq.includes('\x1b[A') || seq.includes('\x1bOA'))).toBe(true);
    expect(result.sentInputs.some((seq) => seq.includes('\x1b[B') || seq.includes('\x1bOB'))).toBe(true);
  });

  test('chat.hf.co 会话在滚轮滑动时发送 PageUp 与 PageDown 翻页序列', async ({ page }) => {
    await mockAnonymousSession(page);
    await page.goto('/?lang=zh-CN');

    const result = await page.evaluate(async () => {
      const terminalModule = await (window as any).eval("import('/src/terminal.ts')");
      const root = document.createElement('div');
      root.id = 'terminal-chat-hf-test-root';
      root.style.position = 'fixed';
      root.style.left = '0';
      root.style.top = '0';
      root.style.width = '800px';
      root.style.height = '400px';
      root.style.zIndex = '9999';
      document.body.appendChild(root);

      const terminal = new terminalModule.SSHTerminal(root.id);
      terminal.mount();
      (terminal as any).targetHost = 'chat.hf.co';

      const sentInputs: string[] = [];
      terminal.sendInput = (data: string) => {
        sentInputs.push(data);
        return true;
      };

      const screen = root.querySelector('.xterm-screen')!;
      // 模拟向上滑动（双指滑动超阈值）
      screen.dispatchEvent(
        new WheelEvent('wheel', {
          bubbles: true,
          cancelable: true,
          deltaY: -50,
          deltaMode: 0,
        })
      );

      // 模拟向下滑动
      screen.dispatchEvent(
        new WheelEvent('wheel', {
          bubbles: true,
          cancelable: true,
          deltaY: 50,
          deltaMode: 0,
        })
      );

      const hasScrollbar = Boolean(root.querySelector('.terminal-scrollbar'));
      const isAltModeScrollbar = root.querySelector('.terminal-scrollbar')?.classList.contains('alt-mode');
      terminal.dispose();
      root.remove();

      return {
        sentInputs,
        hasScrollbar,
        isAltModeScrollbar,
      };
    });

    expect(result.hasScrollbar).toBe(true);
    expect(result.isAltModeScrollbar).toBe(true);
    expect(result.sentInputs.some((seq) => seq.includes('\x1b[5~'))).toBe(true);
    expect(result.sentInputs.some((seq) => seq.includes('\x1b[6~'))).toBe(true);
  });

  test('自定义终端滚动条（TerminalScrollbar）随历史行展现并响应按钮点击', async ({ page }) => {
    await mockAnonymousSession(page);
    await page.goto('/?lang=zh-CN');

    const result = await page.evaluate(async () => {
      const terminalModule = await (window as any).eval("import('/src/terminal.ts')");
      const root = document.createElement('div');
      root.id = 'terminal-scrollbar-ui-root';
      root.style.position = 'fixed';
      root.style.left = '0';
      root.style.top = '0';
      root.style.width = '800px';
      root.style.height = '400px';
      root.style.zIndex = '9999';
      document.body.appendChild(root);

      const terminal = new terminalModule.SSHTerminal(root.id);
      terminal.mount();
      const xterm = terminal.xterm;

      // 写入 80 行
      const text = Array.from({ length: 80 }, (_, i) => `Scrollbar Test Line #${i}\r\n`).join('');
      await new Promise<void>((resolve) => xterm.write(text, resolve));

      const scrollbar = root.querySelector('.terminal-scrollbar') as HTMLElement;
      const upBtn = root.querySelector('.terminal-scrollbar-btn-up') as HTMLButtonElement;
      const downBtn = root.querySelector('.terminal-scrollbar-btn-down') as HTMLButtonElement;
      const thumb = root.querySelector('.terminal-scrollbar-thumb') as HTMLElement;

      const initialViewportY = xterm.buffer.active.viewportY;
      // 点击向上按钮
      upBtn.click();
      const afterUpViewportY = xterm.buffer.active.viewportY;

      // 点击向下按钮
      downBtn.click();
      const afterDownViewportY = xterm.buffer.active.viewportY;

      const result = {
        hasScrollbar: Boolean(scrollbar),
        isVisible: scrollbar?.classList.contains('visible'),
        hasThumb: Boolean(thumb),
        initialViewportY,
        afterUpViewportY,
        afterDownViewportY,
      };

      terminal.dispose();
      root.remove();

      return result;
    });

    expect(result.hasScrollbar).toBe(true);
    expect(result.isVisible).toBe(true);
    expect(result.hasThumb).toBe(true);
    expect(result.afterUpViewportY).toBeLessThan(result.initialViewportY);
    expect(result.afterDownViewportY).toBeGreaterThanOrEqual(result.afterUpViewportY);
  });
});

