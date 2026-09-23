// Copyright (c) 2026 888CloudSSH contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 校验 HTTP 請求是否同源（防 CSRF 與非授權跨域呼叫）。
 * 具備 Cloudflare Workers 邊緣適配特性：
 * 1. 優先遵循現代瀏覽器 Sec-Fetch-Site 標頭（same-origin / none 放行，cross-site 嚴格攔截）
 * 2. 支援 Origin 與 Referer 雙重比對，允許 Cloudflare SSL 終止協議差異（http ↔ https）
 * 3. 提取 host 進行不區分大小寫的比對，避免端口與協議字面量不匹配
 */
export function hasSameOrigin(request: Request): boolean {
  const secFetchSite = request.headers.get('Sec-Fetch-Site');
  if (secFetchSite === 'cross-site') {
    return false;
  }
  if (secFetchSite === 'same-origin' || secFetchSite === 'none') {
    return true;
  }

  let requestHost = '';
  try {
    requestHost = new URL(request.url).host.toLowerCase();
  } catch {
    return false;
  }
  const hostHeader = (request.headers.get('Host') || '').toLowerCase();
  const effectiveHost = requestHost || hostHeader;

  const origin = request.headers.get('Origin');
  if (origin) {
    try {
      const originHost = new URL(origin).host.toLowerCase();
      return originHost === effectiveHost;
    } catch {
      return false;
    }
  }

  const referer = request.headers.get('Referer');
  if (referer) {
    try {
      const refererHost = new URL(referer).host.toLowerCase();
      return refererHost === effectiveHost;
    } catch {
      return false;
    }
  }

  // 若均未提供標頭（如無狀態客戶端、私密無頭模式），信任同源
  return true;
}

/**
 * 校验 WebSocket 連線請求來源（防 Cross-Site WebSocket Hijacking）。
 * RFC 6455 規範下瀏覽器 WebSocket 連線必定攜帶 Origin 標頭。
 */
export function hasSameWebSocketOrigin(request: Request, url: URL): boolean {
  const secFetchSite = request.headers.get('Sec-Fetch-Site');
  if (secFetchSite === 'cross-site') {
    return false;
  }
  if (secFetchSite === 'same-origin') {
    return true;
  }

  const origin = request.headers.get('Origin');
  if (!origin) return false;

  try {
    const originHost = new URL(origin).host.toLowerCase();
    const urlHost = url.host.toLowerCase();
    const hostHeader = (request.headers.get('Host') || '').toLowerCase();
    return originHost === urlHost || (!!hostHeader && originHost === hostHeader);
  } catch {
    return false;
  }
}
