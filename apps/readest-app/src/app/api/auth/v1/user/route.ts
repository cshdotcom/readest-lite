import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken } from '@/utils/localAuth';
export function OPTIONS() { return new NextResponse(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': '*' } }); }
export function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.replace(/^Bearer\s+/i, '');
  const user = verifyAccessToken(token);
  if (!user) return NextResponse.json({ user: null, error: 'invalid token' }, { status: 401, headers: { 'Access-Control-Allow-Origin': '*' } });
  return NextResponse.json({ user, app_metadata: {}, user_metadata: {} }, { status: 200, headers: { 'Access-Control-Allow-Origin': '*' } });
}
