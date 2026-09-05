// 改造自原 src/app/api/share/[token]/download/route.ts。
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
