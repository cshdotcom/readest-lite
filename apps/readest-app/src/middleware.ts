import { NextRequest, NextResponse } from 'next/server';

const allowedOrigins = [
  'https://tauri.localhost',
  'http://tauri.localhost',
  'http://localhost:3000',
  'http://localhost:3001',
  'tauri://localhost',
];

const corsOptions = {
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

export function middleware(request: NextRequest) {
  const isApi = request.nextUrl.pathname.startsWith('/api/');

  if (isApi) {
    const origin = request.headers.get('origin') ?? '';
    const isAllowedOrigin = allowedOrigins.includes(origin);

    if (request.method === 'OPTIONS') {
      // Echo the requested headers rather than answering `*`: the Fetch spec
      // excludes `Authorization` from wildcard matching in the browser's
      // preflight cache, so a wildcard answer forces a fresh OPTIONS round
      // trip before every authenticated API call despite Max-Age.
      const requestedHeaders = request.headers.get('access-control-request-headers');
      const preflightHeaders = new Headers({
        ...corsOptions,
        'Access-Control-Allow-Headers': requestedHeaders || 'Authorization, Content-Type',
        Vary: 'Origin, Access-Control-Request-Headers',
        ...(isAllowedOrigin && { 'Access-Control-Allow-Origin': origin }),
      });

      return new NextResponse(null, {
        status: 200,
        headers: preflightHeaders,
      });
    }

    const response = NextResponse.next();

    if (isAllowedOrigin) {
      response.headers.set('Access-Control-Allow-Origin', origin);
    }

    Object.entries(corsOptions).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    return response;
  }

  // Cross-origin isolation enables SharedArrayBuffer, which the Turso WASM
  // thread pool requires (initThreadPool hangs without it). Set on every
  // document response, not just /api/* — `crossOriginIsolated` is a property
  // of the top-level browsing context, determined by the document's headers.
  const response = NextResponse.next();
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  // The /s share landing embeds the book cover via an <img> that redirects to a
  // cross-origin R2 presigned URL. Under COEP: require-corp the browser blocks
  // that image, because R2 can't attach a Cross-Origin-Resource-Policy header to
  // a presigned GET. `credentialless` keeps the page cross-origin isolated — so
  // EnvContext can still boot the Turso replica (SharedArrayBuffer) here when the
  // user has sync enabled — while dropping the CORP requirement for no-cors
  // subresources, letting the cover load with no client-side change. Every other
  // route keeps the stricter require-corp.
  const path = request.nextUrl.pathname;
  const coep = path === '/s' || path.startsWith('/s/') ? 'credentialless' : 'require-corp';
  response.headers.set('Cross-Origin-Embedder-Policy', coep);
  return response;
}

export const config = {
  // ⚠️ Next.js 16 会对被 middleware/proxy 匹配到的、带请求体的请求做
  // "cloneable body" 包装（server/body-streams.js），缓冲上限由
  // experimental.proxyClientMaxBodySize 控制，默认 10MB。超限时请求流会被
  // 静默提前 close，API handler 只能读到前 ~10MB（issue #8：超过 10M 的
  // 书籍 PUT /api/storage/_put 被截断，且 3 倍内存驻留 clone 流）。
  //
  // 大文件二进制端点从 matcher 排除，让原始请求流直达 API handler：
  //   - /api/storage/_put   书籍/副本签名 PUT 直传。鉴权由 query 里的
  //                         HMAC 签名（key/expires/sig）提供；CORS 由
  //                         handler 内的 corsAllMethods 提供，无需 middleware。
  //   - /api/send/inbox/file 收件箱文件直传（上限 40MB，浏览器扩展 POST）。
  //                         handler 内同样自带 corsAllMethods；扩展的
  //                         host_permissions 使其不受 CORS 限制。
  //   - /api/readera-import ReadEra .bak 导入（上限 200MB formData）。
  //                         仅同源 Web UI / Tauri 调用，无 CORS 需求。
  //
  // 其余 /api/* 均为小 JSON 元数据请求（<10MB），继续走 middleware。
  // 若未来新增大 body 端点，务必把路径加进这个排除列表，或改用
  // /api/storage/_put 的签名 URL 直传协议。
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.json|api/storage/_put|api/send/inbox/file|api/readera-import).*)',
  ],
};
