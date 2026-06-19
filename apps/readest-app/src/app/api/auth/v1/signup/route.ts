import { NextResponse } from 'next/server';
export function OPTIONS() { return new NextResponse(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': '*' } }); }
export function POST() { return NextResponse.json({ error: 'Sign-up is disabled.', code: 'signup_disabled' }, { status: 403, headers: { 'Access-Control-Allow-Origin': '*' } }); }
