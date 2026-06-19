import { NextRequest, NextResponse } from 'next/server';
import { signInWithPassword, refreshSession } from '@/utils/localAuth';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': '*',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const grantType = url.searchParams.get('grant_type');
  let body: { email?: string; password?: string; refresh_token?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error_description: 'Invalid JSON' }, { status: 400, headers: CORS }); }

  if (grantType === 'password') {
    if (!body.email || !body.password) return NextResponse.json({ error_description: 'email and password required' }, { status: 400, headers: CORS });
    try {
      const session = await signInWithPassword(body.email, body.password);
      return NextResponse.json(session, { status: 200, headers: CORS });
    } catch (err) {
      return NextResponse.json({ error_description: err instanceof Error ? err.message : 'login failed' }, { status: 400, headers: CORS });
    }
  }
  if (grantType === 'refresh_token') {
    if (!body.refresh_token) return NextResponse.json({ error_description: 'refresh_token required' }, { status: 400, headers: CORS });
    const session = await refreshSession(body.refresh_token);
    if (!session) return NextResponse.json({ error_description: 'invalid refresh token' }, { status: 400, headers: CORS });
    return NextResponse.json(session, { status: 200, headers: CORS });
  }
  return NextResponse.json({ error_description: 'unsupported grant_type' }, { status: 400, headers: CORS });
}
