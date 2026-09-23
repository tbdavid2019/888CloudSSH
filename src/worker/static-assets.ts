// Copyright (c) 2026 888CloudSSH contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

export const SITE_MANIFEST = JSON.stringify({
  name: '888CloudSSH',
  short_name: 'CloudSSH',
  description: 'Serverless Web SSH Terminal & SFTP Client on Cloudflare Workers',
  start_url: '/',
  display: 'standalone',
  background_color: '#0a0f1d',
  theme_color: '#0a0f1d',
  icons: [
    {
      src: '/favicon.svg',
      sizes: 'any',
      type: 'image/svg+xml',
      purpose: 'any maskable',
    },
    {
      src: '/apple-touch-icon.png',
      sizes: '180x180',
      type: 'image/svg+xml',
    },
  ],
});

export const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="6" fill="#0d1117"/>
  <rect x="1.5" y="1.5" width="29" height="29" rx="5" fill="#161b22" stroke="#00e5ff" stroke-width="1.5"/>
  <path d="M7 10L13 16L7 22" stroke="#00e5ff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <line x1="16" y1="22" x2="25" y2="22" stroke="#00e5ff" stroke-width="2.5" stroke-linecap="round"/>
</svg>`;

export const APPLE_TOUCH_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180">
  <rect width="180" height="180" rx="36" fill="#0d1117"/>
  <rect x="8" y="8" width="164" height="164" rx="30" fill="#161b22" stroke="#00e5ff" stroke-width="6"/>
  <path d="M44 56L84 90L44 124" stroke="#00e5ff" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <line x1="100" y1="124" x2="144" y2="124" stroke="#00e5ff" stroke-width="14" stroke-linecap="round"/>
</svg>`;

export const OG_IMAGE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0a0f1d"/>
      <stop offset="100%" stop-color="#121829"/>
    </linearGradient>
    <linearGradient id="cyanGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#00e5ff"/>
      <stop offset="100%" stop-color="#7000ff"/>
    </linearGradient>
    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(0, 229, 255, 0.05)" stroke-width="1"/>
    </pattern>
  </defs>

  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#grid)"/>

  <!-- Glowing Border Card -->
  <rect x="60" y="60" width="1080" height="510" rx="24" fill="#0e1424" stroke="rgba(0, 229, 255, 0.3)" stroke-width="2"/>

  <!-- Terminal Header Bar -->
  <rect x="60" y="60" width="1080" height="56" rx="24" fill="#141c30"/>
  <circle cx="100" cy="88" r="8" fill="#ff5f56"/>
  <circle cx="126" cy="88" r="8" fill="#ffbd2e"/>
  <circle cx="152" cy="88" r="8" fill="#27c93f"/>

  <!-- Logo and Terminal Icon -->
  <g transform="translate(100, 160)">
    <path d="M0 24L36 54L0 84" stroke="#00e5ff" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <line x1="50" y1="84" x2="94" y2="84" stroke="#00e5ff" stroke-width="10" stroke-linecap="round"/>
  </g>

  <!-- Titles -->
  <text x="220" y="242" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="72" font-weight="900" fill="#ffffff" letter-spacing="-1">
    888<tspan fill="url(#cyanGrad)">CloudSSH</tspan>
  </text>

  <text x="100" y="330" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="32" font-weight="600" fill="#94a3b8">
    Serverless Web SSH Terminal &amp; SFTP Client
  </text>

  <text x="100" y="380" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="22" font-weight="400" fill="#64748b">
    Touch ID &amp; Passkey • Email OTP • Cloudflare Workers &amp; Durable Objects • AI Agent Assistant
  </text>

  <!-- Feature Pills -->
  <g transform="translate(100, 440)">
    <!-- Pill 1 -->
    <rect x="0" y="0" width="180" height="44" rx="22" fill="rgba(0, 229, 255, 0.1)" stroke="#00e5ff" stroke-width="1.5"/>
    <text x="90" y="27" font-family="sans-serif" font-size="16" font-weight="700" fill="#00e5ff" text-anchor="middle">⚡ Touch ID / Passkey</text>

    <!-- Pill 2 -->
    <rect x="200" y="0" width="160" height="44" rx="22" fill="rgba(112, 0, 255, 0.1)" stroke="#7000ff" stroke-width="1.5"/>
    <text x="280" y="27" font-family="sans-serif" font-size="16" font-weight="700" fill="#a855f7" text-anchor="middle">🛡️ Zero-Knowledge</text>

    <!-- Pill 3 -->
    <rect x="380" y="0" width="180" height="44" rx="22" fill="rgba(39, 201, 63, 0.1)" stroke="#27c93f" stroke-width="1.5"/>
    <text x="470" y="27" font-family="sans-serif" font-size="16" font-weight="700" fill="#27c93f" text-anchor="middle">📂 Integrated SFTP</text>

    <!-- Pill 4 -->
    <rect x="580" y="0" width="160" height="44" rx="22" fill="rgba(255, 189, 46, 0.1)" stroke="#ffbd2e" stroke-width="1.5"/>
    <text x="660" y="27" font-family="sans-serif" font-size="16" font-weight="700" fill="#ffbd2e" text-anchor="middle">🤖 AI Assistant</text>
  </g>

  <!-- Footer URL -->
  <text x="100" y="525" font-family="monospace" font-size="18" fill="#475569">
    https://ssh.david888.com
  </text>
</svg>`;

export const ROBOTS_TXT = `User-agent: *
Allow: /
`;

export function handleStaticAsset(url: URL): Response | null {
  const path = url.pathname;
  if (path === '/favicon.svg' || path === '/favicon.ico') {
    return new Response(FAVICON_SVG, {
      headers: {
        'Content-Type': 'image/svg+xml;charset=UTF-8',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  }

  if (path === '/apple-touch-icon.png' || path === '/apple-touch-icon-precomposed.png') {
    return new Response(APPLE_TOUCH_ICON_SVG, {
      headers: {
        'Content-Type': 'image/svg+xml;charset=UTF-8',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  }

  if (path === '/og-image.png' || path === '/og-image.jpg' || path === '/og-image.svg') {
    return new Response(OG_IMAGE_SVG, {
      headers: {
        'Content-Type': 'image/svg+xml;charset=UTF-8',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  }

  if (path === '/site.webmanifest' || path === '/manifest.json') {
    return new Response(SITE_MANIFEST, {
      headers: {
        'Content-Type': 'application/manifest+json;charset=UTF-8',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  }

  if (path === '/robots.txt') {
    return new Response(ROBOTS_TXT, {
      headers: {
        'Content-Type': 'text/plain;charset=UTF-8',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  }

  return null;
}
