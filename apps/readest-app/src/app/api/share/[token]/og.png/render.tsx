// 改造自原 src/app/api/share/[token]/og.png/render.tsx。
// 仅替换 supabase → prisma（resolveActiveShare 已内部完成）。
import { ImageResponse } from 'next/og';
import { NextResponse } from 'next/server';
import { getDownloadSignedUrl } from '@/utils/object';
import { rejectionToHttp, resolveActiveShare } from '@/libs/shareServer';
import { SHARE_PRESIGN_TTL_SECONDS } from '@/services/constants';

const WIDTH = 1200;
const HEIGHT = 630;

const arrayBufferToBase64 = (buffer: ArrayBuffer): string =>
  Buffer.from(buffer).toString('base64');

export const renderShareOgImage = async (token: string, requestOrigin?: string): Promise<Response> => {
  const result = await resolveActiveShare(token);
  if (!result.ok) {
    const { status, body } = rejectionToHttp(result.reason);
    return NextResponse.json(body, { status });
  }
  const { share } = result;

  let coverDataUrl: string | null = null;
  if (share.coverFileKey) {
    try {
      // For server-side fetch we need an absolute URL — pass requestOrigin
      // (derived from the request by the calling route handler).
      const signedUrl = await getDownloadSignedUrl(
        share.coverFileKey,
        SHARE_PRESIGN_TTL_SECONDS,
        undefined,
        requestOrigin,
      );
      const response = await fetch(signedUrl);
      if (response.ok) {
        const buffer = await response.arrayBuffer();
        const contentType = response.headers.get('content-type') ?? 'image/jpeg';
        coverDataUrl = `data:${contentType};base64,${arrayBufferToBase64(buffer)}`;
      }
    } catch (err) {
      console.error('Share og.png cover fetch failed:', err);
    }
  }

  return new ImageResponse(
    coverDataUrl
      ? withCoverCard(coverDataUrl, share.bookTitle, share.bookAuthor)
      : textOnlyCard(share.bookTitle, share.bookAuthor),
    {
      width: WIDTH,
      height: HEIGHT,
      headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=3600' },
    },
  );
};

// JSX 卡片渲染（与原版一致，使用 next/og 的 JSX 形式）
function withCoverCard(coverDataUrl: string, title: string, author: string | null) {
  return (
    <div style={{ display: 'flex', flexDirection: 'row', width: '100%', height: '100%', backgroundColor: '#0f172a', color: '#f8fafc' }}>
      <img src={coverDataUrl} style={{ width: 480, height: 630, objectFit: 'cover' }} />
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 48, flex: 1 }}>
        <div style={{ fontSize: 36, fontWeight: 700, marginBottom: 16 }}>{title}</div>
        {author ? <div style={{ fontSize: 24, opacity: 0.7 }}>{author}</div> : null}
        <div style={{ marginTop: 32, fontSize: 18, opacity: 0.5 }}>Shared via Readest</div>
      </div>
    </div>
  );
}

function textOnlyCard(title: string, author: string | null) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', width: '100%', height: '100%', backgroundColor: '#0f172a', color: '#f8fafc', padding: 80 }}>
      <div style={{ fontSize: 48, fontWeight: 700, textAlign: 'center', marginBottom: 24 }}>{title}</div>
      {author ? <div style={{ fontSize: 28, opacity: 0.7 }}>{author}</div> : null}
      <div style={{ marginTop: 48, fontSize: 20, opacity: 0.5 }}>Shared via Readest</div>
    </div>
  );
}
