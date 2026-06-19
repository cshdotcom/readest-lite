import { NextResponse } from 'next/server';
export function GET() {
  return NextResponse.json({ external: { email: false, phone: false }, disable_signup: true, mailer_autoconfirm: false, phone_confirm: false, sms_confirm_change: false }, { status: 200, headers: { 'Access-Control-Allow-Origin': '*' } });
}
