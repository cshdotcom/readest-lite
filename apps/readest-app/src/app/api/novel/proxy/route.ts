// 网页小说导入代理 — POST /api/novel/proxy
// body: { url, cookie?, headers? }
// 服务器端抓取目标 URL，把 HTML 内容返回给前端，让 lite (web-only) 绕过 CORS
// 用户在 ImportNovelDialog 里填 cookie / headers（用于登录站点）
import { NextRequest, NextResponse } from 'next/server';
import { validateUserAndToken } from '@/utils/access';
import { isBlockedHost } from '@/utils/network';

export const runtime = 'nodejs';

const MAX_RESPONSE_SIZE = 20 * 1024 * 1024;  // 20MB

export async function POST(req: NextRequest) {
  const { user, token } = await validateUserAndToken(req.headers.get('authorization'));
  if (!user || !token) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 403 });
  }

  try {
    const { url, cookie, headers } = await req.json();
    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'URL required' }, { status: 400 });
    }

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return NextResponse.json({ error: 'Only http(s) URLs' }, { status: 400 });
    }
    // SSRF 防护：黑名单
    if (isBlockedHost(parsed.hostname)) {
      return NextResponse.json({ error: 'URL not allowed' }, { status: 400 });
    }

    // 拼请求头
    const reqHeaders: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    };
    if (cookie && typeof cookie === 'string' && cookie.trim()) {
      reqHeaders['Cookie'] = cookie.trim();
    }
    if (headers && typeof headers === 'object' && !Array.isArray(headers)) {
      for (const [k, v] of Object.entries(headers)) {
        if (typeof v === 'string') {
          reqHeaders[k] = v;
        }
      }
    }

    // 跟随 redirect 最多 5 次
    let currentUrl = url;
    let resp: Response;
    for (let i = 0; i < 5; i++) {
      resp = await fetch(currentUrl, {
        method: 'GET',
        headers: reqHeaders,
        redirect: 'manual',
        signal: AbortSignal.timeout(15000),
      });
      if (resp.status >= 300 && resp.status < 400) {
        const next = resp.headers.get('location');
        if (!next) break;
        currentUrl = new URL(next, currentUrl).href;
        continue;
      }
      break;
    }

    const finalUrl = currentUrl;
    const contentType = resp!.headers.get('content-type') || 'text/html; charset=utf-8';
    const buffer = await resp!.arrayBuffer();
    if (buffer.byteLength > MAX_RESPONSE_SIZE) {
      return NextResponse.json({ error: 'Response too large (max 20MB)' }, { status: 413 });
    }

    // 直接返回文本 — 让前端处理编码
    const text = new TextDecoder('utf-8').decode(buffer);
    return NextResponse.json({
      url: finalUrl,
      contentType,
      html: text,
      status: resp!.status,
    });
  } catch (error) {
    console.error('novel proxy error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Proxy failed' },
      { status: 500 },
    );
  }
}
