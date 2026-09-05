// 改造自原 src/app/api/share/[token]/download/route.ts。
// v8.18.3: feed:// 书籍分享返回 descriptor JSON（不是文件 redirect）。
import { NextResponse } from 'next/server';
import { getDownloadSignedUrl } from '@/utils/object';
import { rejectionToHttp, resolveActiveShare } from '@/libs/shareServer';
import { SHARE_PRESIGN_TTL_SECONDS } from '@/services/constants';

interface RouteParams { params: Promise<{ token: string }> }

export async function GET(request: Request, { params }: RouteParams) {
  const { token } = await params;
  const result = await resolveActiveShare(token);
  if (!result.ok) {
    const { status, body } = rejectionToHttp(result.reason);
    return NextResponse.json(body, { status });
  }
  const { share } = result;

  // v8.18.3: feed:// 书籍分享 → 返回 descriptor，让接收方在客户端重建订阅
  if (share.isFeedBook) {
    return NextResponse.json({
      kind: 'feed',
      bookHash: share.bookHash,
      bookTitle: share.bookTitle,
      bookAuthor: share.bookAuthor,
      bookFormat: share.bookFormat,
      bookUrl: share.bookUrl,
      cfi: share.cfi,
      // Cover URL is still useful (server has the cover bytes for this book_hash)
      coverUrl: share.coverFileKey
        ? `/api/share/${token}/cover`
        : null,
    }, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  }

  // Derive absolute origin from request URL so NextResponse.redirect works
  // when PUBLIC_BASE_URL is not set (relative URLs cannot be used for redirect).
  const requestOrigin = new URL(request.url).origin;
  let url: string;
  try {
    url = await getDownloadSignedUrl(share.bookFileKey, SHARE_PRESIGN_TTL_SECONDS, undefined, requestOrigin);
  } catch (err) {
    console.error('Share download presign failed:', err);
    return NextResponse.json({ error: 'Could not sign download URL' }, { status: 500 });
  }
  return NextResponse.redirect(url, {
    status: 302,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
