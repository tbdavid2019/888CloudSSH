import { describe, expect, it } from 'vitest';
import { handleStaticAsset } from '../../src/worker/static-assets';
import { HTML } from '../../src/worker/html';

describe('Static assets and SEO meta tags', () => {
  it('serves favicon.svg with correct MIME type and cache header', () => {
    const res = handleStaticAsset(new URL('https://ssh.david888.com/favicon.svg'));
    expect(res).not.toBeNull();
    expect(res?.status).toBe(200);
    expect(res?.headers.get('Content-Type')).toContain('image/svg+xml');
    expect(res?.headers.get('Cache-Control')).toContain('public');
  });

  it('serves apple-touch-icon with image/svg+xml', () => {
    const res = handleStaticAsset(new URL('https://ssh.david888.com/apple-touch-icon.png'));
    expect(res).not.toBeNull();
    expect(res?.status).toBe(200);
    expect(res?.headers.get('Content-Type')).toContain('image/svg+xml');
  });

  it('serves og-image.png with image/svg+xml', () => {
    const res = handleStaticAsset(new URL('https://ssh.david888.com/og-image.png'));
    expect(res).not.toBeNull();
    expect(res?.status).toBe(200);
    expect(res?.headers.get('Content-Type')).toContain('image/svg+xml');
  });

  it('serves site.webmanifest with application/manifest+json', async () => {
    const res = handleStaticAsset(new URL('https://ssh.david888.com/site.webmanifest'));
    expect(res).not.toBeNull();
    expect(res?.status).toBe(200);
    expect(res?.headers.get('Content-Type')).toContain('application/manifest+json');
    const data = (await res?.json()) as { name: string; icons: unknown[] };
    expect(data.name).toBe('888CloudSSH');
    expect(data.icons.length).toBeGreaterThan(0);
  });

  it('serves robots.txt with allow all', async () => {
    const res = handleStaticAsset(new URL('https://ssh.david888.com/robots.txt'));
    expect(res).not.toBeNull();
    expect(res?.status).toBe(200);
    expect(res?.headers.get('Content-Type')).toContain('text/plain');
    const text = await res?.text();
    expect(text).toContain('Allow: /');
  });

  it('returns null for non-static routes', () => {
    expect(handleStaticAsset(new URL('https://ssh.david888.com/api/servers'))).toBeNull();
    expect(handleStaticAsset(new URL('https://ssh.david888.com/'))).toBeNull();
  });

  it('inlines complete OpenGraph, Twitter, canonical, and JSON-LD tags into production HTML', () => {
    expect(HTML).toContain('property="og:title"');
    expect(HTML).toContain('property="og:description"');
    expect(HTML).toContain('property="og:image"');
    expect(HTML).toContain('property="og:url"');
    expect(HTML).toContain('https://ssh.david888.com');
    expect(HTML).toContain('name="twitter:card"');
    expect(HTML).toContain('rel="canonical"');
    expect(HTML).toContain('rel="manifest"');
    expect(HTML).toContain('rel="apple-touch-icon"');
    expect(HTML).toContain('application/ld+json');
    expect(HTML).toMatch(/<h1[^>]*>[\s\S]*?CloudSSH[\s\S]*?<\/h1>/);
  });
});
