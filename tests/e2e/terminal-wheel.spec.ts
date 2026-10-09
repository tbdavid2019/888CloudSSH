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
});
