import { describe, expect, it, vi } from 'vitest';
import { SSHSession } from '../../src/worker/ssh-session';

describe('SSHSession Agent UserDB Shard Routing', () => {
  it('Email OTP 账户 (instanceId: acc_xxx, githubId: 0) 正确路由至对应 UserDBDO 实例分區', async () => {
    const fetchMock = vi.fn(async (req: Request) => {
      const url = new URL(req.url);
      expect(url.pathname).toBe('/internal/ai-config/decrypt');
      expect(url.searchParams.get('user_id')).toBe('1');
      return Response.json({
        base_url: 'https://api.openai.com/v1',
        model: 'gpt-4o',
        api_key: 'sk-test-decrypted-key',
      });
    });

    const idFromNameMock = vi.fn((name: string) => `stub-for-${name}`);
    const getMock = vi.fn((id: string) => ({ fetch: fetchMock }));

    const env = {
      USER_DB: {
        idFromName: idFromNameMock,
        get: getMock,
      },
    };

    const config = {
      host: 'ssh.example.com',
      port: 22,
      username: 'root',
      password: 'pwd',
      serverId: 42,
      instanceId: 'acc_7480a424a2ef69c6',
      accountId: 'acc_7480a424a2ef69c6',
      githubId: '0',
      userId: '1',
    };

    const session = new SSHSession(
      { readyState: WebSocket.OPEN, send: vi.fn() } as unknown as WebSocket,
      {} as never,
      config,
      true,
      false,
      undefined,
      env as never,
      '1',
      '0',
      { instanceId: 'acc_7480a424a2ef69c6' }
    );

    // Call fetchAgentAIConfig via reflection / private call
    const res = await (session as any).fetchAgentAIConfig('1', (session as any).getUserDBTarget());

    expect(idFromNameMock).toHaveBeenCalledWith('acc_7480a424a2ef69c6');
    expect(res).toEqual({
      base_url: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      api_key: 'sk-test-decrypted-key',
    });
  });

  it('GitHub OAuth 账户 (githubId: 12345) 路由至 githubId 对应的 UserDBDO 实例分區', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        base_url: 'https://api.anthropic.com',
        model: 'claude-3-5-sonnet',
        api_key: 'sk-ant-test',
      })
    );

    const idFromNameMock = vi.fn((name: string) => `stub-for-${name}`);
    const getMock = vi.fn(() => ({ fetch: fetchMock }));

    const env = {
      USER_DB: {
        idFromName: idFromNameMock,
        get: getMock,
      },
    };

    const config = {
      host: 'ssh.example.com',
      port: 22,
      username: 'root',
      password: 'pwd',
      serverId: 42,
      githubId: '12345',
      userId: '2',
    };

    const session = new SSHSession(
      { readyState: WebSocket.OPEN, send: vi.fn() } as unknown as WebSocket,
      {} as never,
      config,
      true,
      false,
      undefined,
      env as never,
      '2',
      '12345'
    );

    const res = await (session as any).fetchAgentAIConfig('2', (session as any).getUserDBTarget());

    expect(idFromNameMock).toHaveBeenCalledWith('12345');
    expect(res).toEqual({
      base_url: 'https://api.anthropic.com',
      model: 'claude-3-5-sonnet',
      api_key: 'sk-ant-test',
    });
  });

  it('直连连接且传入 accountId 时，getUserDBTarget 能正确提取', () => {
    const config = {
      host: 'ssh.example.com',
      port: 22,
      username: 'root',
      password: 'pwd',
      accountId: 'acc_abc123',
    };

    const session = new SSHSession(
      { readyState: WebSocket.OPEN, send: vi.fn() } as unknown as WebSocket,
      {} as never,
      config,
      true,
      false,
      undefined,
      undefined,
      '1',
      '0',
      { instanceId: 'acc_abc123' }
    );

    expect((session as any).getUserDBTarget()).toBe('acc_abc123');
  });

  it('Email OTP 账户检测远端 OS 时，持久化至对应 accountId 分區', async () => {
    const fetchMock = vi.fn(async () => Response.json({ success: true }));
    const idFromNameMock = vi.fn((name: string) => `stub-for-${name}`);
    const env = {
      USER_DB: {
        idFromName: idFromNameMock,
        get: vi.fn(() => ({ fetch: fetchMock })),
      },
    };

    const config = {
      host: 'ssh.example.com',
      port: 22,
      username: 'alice',
      password: 'pwd',
      serverId: 77,
      os: null,
      instanceId: 'acc_email_user',
      accountId: 'acc_email_user',
    };

    const session = new SSHSession(
      { readyState: WebSocket.OPEN, send: vi.fn() } as unknown as WebSocket,
      {} as never,
      config,
      true,
      false,
      undefined,
      env as never,
      '1',
      '0',
      { instanceId: 'acc_email_user' }
    );

    (session as any).executeAgentCommand = vi.fn(async () => ({
      stdout: 'ID=ubuntu\n',
      stderr: '',
      exitCode: 0,
    }));

    await (session as any).detectRemoteOS();

    expect(idFromNameMock).toHaveBeenCalledWith('acc_email_user');
    expect(config.os).toBe('ubuntu');
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
