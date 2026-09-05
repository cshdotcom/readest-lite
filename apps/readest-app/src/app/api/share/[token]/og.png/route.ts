// 改造自原 src/app/api/share/[token]/og.png/route.ts
import { renderShareOgImage } from './render';

interface RouteParams { params: Promise<{ token: string }> }

export async function GET(request: Request, { params }: RouteParams) {
  const { token } = await params;
  // Pass request origin so render() can build absolute URLs for server-side fetch
  const requestOrigin = new URL(request.url).origin;
  return renderShareOgImage(token, requestOrigin);
}
