import { NextResponse } from 'next/server';
export function OPTIONS() { return new NextResponse(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': '*' } }); }
export function POST() { return new NextResponse(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*' } }); }
