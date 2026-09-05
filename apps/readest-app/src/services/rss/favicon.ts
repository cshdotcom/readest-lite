/**
 * Auto-detect site favicon for RSS feed books.
 *
 * Strategy (in order):
 *  1. <link rel="icon" type="image/svg+xml" href="...">  (preferred: SVG, no size needed)
 *  2. <link rel="icon" href="...">  (any type — PNG/ICO)
 *  3. <link rel="apple-touch-icon" href="...">  (often a high-res PNG)
 *  4. <link rel="shortcut icon" href="...">  (legacy)
 *  5. /favicon.ico  (browser default)
 *
 * Returned image is `{ bytes, mime }` ready for `CoverInput.favicon`. When
 * nothing is reachable (offline, no permission, opaque response) the caller
 * keeps the default RSS orange icon.
 *
 * The fetch uses the in-app proxy when `proxyEnabled=true` (so users behind
 * GFW can still get favicons for foreign sites) and a 5-second timeout so a
 * slow CDN doesn't hold up the cover generation.
 */
import { isProxyEnabled, fetchViaProxy } from '@/utils/proxy';

const FAVICON_TIMEOUT_MS = 5000;

const fetchWithTimeout = async (url: string, signal?: AbortSignal): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FAVICON_TIMEOUT_MS);
  try {
    // Combine caller signal with our timeout
    if (signal) {
      signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
    // Use proxy when enabled — same path as Wikipedia fetch
    return isProxyEnabled()
      ? await fetchViaProxy(url, controller.signal)
      : await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

const toAbsoluteUrl = (href: string, base: URL): string => {
  try {
    return new URL(href, base).toString();
  } catch {
    return '';
  }
};

export interface FetchedFavicon {
  bytes: ArrayBuffer;
  mime: string;
}

/**
 * Returns a fetched favicon for the given feed URL, or null when no favicon
 * could be located / fetched within the timeout. The caller is expected to
 * fall back to the default RSS icon when this returns null.
 */
export async function fetchFeedFavicon(feedUrl: string): Promise<FetchedFavicon | null> {
  let baseUrl: URL;
  try {
    baseUrl = new URL(feedUrl);
  } catch {
    return null;
  }
  const siteOrigin = `${baseUrl.protocol}//${baseUrl.host}/`;

  // 1) Try the feed URL itself first — RSS/Atom feeds sometimes embed icon
  //    references in <image> / <icon> / <logo> elements, but we leave that
  //    for the feedParser stage; here we only look at the site's HTML head.
  let html: string;
  try {
    const res = await fetchWithTimeout(siteOrigin);
    if (!res.ok) throw new Error(`status ${res.status}`);
    html = await res.text();
  } catch {
    // 2) Fall back to /favicon.ico without parsing HTML.
    try {
      const res = await fetchWithTimeout(`${siteOrigin}favicon.ico`);
      if (!res.ok) return null;
      const mime = res.headers.get('content-type') || 'image/x-icon';
      const bytes = await res.arrayBuffer();
      if (bytes.byteLength === 0) return null;
      return { bytes, mime };
    } catch {
      return null;
    }
  }

  // 3) Walk HTML <head> for icon link tags. Pick SVG first (best quality),
  //    then largest png, then any other icon type.
  const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  const head = headMatch ? headMatch[1]! : html;
  const linkRe = /<link\s+([^>]+?)\/?>/gi;
  const candidates: { href: string; rel: string; type?: string; sizes?: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(head)) !== null) {
    const attrs = m[1]!;
    const getAttr = (name: string): string | undefined => {
      const re = new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i');
      const am = attrs.match(re);
      return am ? am[1] : undefined;
    };
    const rel = (getAttr('rel') || '').toLowerCase();
    if (!rel.includes('icon')) continue;
    const href = getAttr('href');
    if (!href) continue;
    candidates.push({
      href,
      rel,
      type: getAttr('type')?.toLowerCase(),
      sizes: getAttr('sizes'),
    });
  }

  // Rank: SVG first (always crisp), then largest png, then any other.
  const rank = (c: { type?: string; sizes?: string; rel: string }): number => {
    if (c.type === 'image/svg+xml') return 1000;
    let sizeScore = 0;
    if (c.sizes) {
      const sm = c.sizes.match(/(\d+)x(\d+)/i);
      if (sm) {
        const w = parseInt(sm[1]!, 10);
        const h = parseInt(sm[2]!, 10);
        sizeScore = Math.min(w * h, 256 * 256); // cap; ignore "any"
      }
    }
    const relBonus = c.rel.includes('apple-touch') ? 64 : 0;
    return sizeScore + relBonus;
  };
  candidates.sort((a, b) => rank(b) - rank(a));

  for (const c of candidates) {
    const abs = toAbsoluteUrl(c.href, baseUrl);
    if (!abs) continue;
    try {
      const res = await fetchWithTimeout(abs);
      if (!res.ok) continue;
      const mime = c.type || res.headers.get('content-type') || 'image/png';
      const bytes = await res.arrayBuffer();
      if (bytes.byteLength === 0) continue;
      // Trivial sanity check: favicon files should be at least 50 bytes
      if (bytes.byteLength < 50) continue;
      return { bytes, mime };
    } catch {
      // try next candidate
    }
  }

  // 4) Final fallback: /favicon.ico (already tried in step 2 if HTML fetch
  //    failed, but if HTML fetched and no <link> tags found, try here too).
  try {
    const res = await fetchWithTimeout(`${siteOrigin}favicon.ico`);
    if (!res.ok) return null;
    const mime = res.headers.get('content-type') || 'image/x-icon';
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength === 0) return null;
    return { bytes, mime };
  } catch {
    return null;
  }
}
