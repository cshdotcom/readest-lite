// 管理员用户管理 API
// GET  /api/admin/users — 列出所有用户
// POST /api/admin/users — 创建新用户
import { NextRequest, NextResponse } from 'next/server';
import { validateAdmin } from '@/utils/localAuth';
import { prismaClient } from '@/utils/db';
import argon2 from 'argon2';
import { randomUUID } from 'crypto';

export async function GET(req: NextRequest) {
  const { user, token } = await validateAdmin(req.headers.get('authorization'));
  if (!user || !token) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const users = await prismaClient.user.findMany({
    select: {
      id: true,
      email: true,
      role: true,
      displayName: true,
      storageQuotaMB: true,
      translationQuotaKB: true,
      createdAt: true,
      lastSignInAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json({ users });
}

export async function POST(req: NextRequest) {
  const { user, token } = await validateAdmin(req.headers.get('authorization'));
  if (!user || !token) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { email, password, displayName, storageQuotaMB, translationQuotaKB } = body;

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // 检查是否已存在
    const existing = await prismaClient.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      return NextResponse.json({ error: 'User already exists' }, { status: 409 });
    }

    const encryptedPass = await argon2.hash(password);
    const newUser = await prismaClient.user.create({
      data: {
        id: randomUUID(),
        email: normalizedEmail,
        encryptedPass,
        role: 'user',
        displayName: displayName || null,
        storageQuotaMB: typeof storageQuotaMB === 'number' ? storageQuotaMB : 0,
        translationQuotaKB: typeof translationQuotaKB === 'number' ? translationQuotaKB : 0,
      },
      select: {
        id: true,
        email: true,
        role: true,
        displayName: true,
        storageQuotaMB: true,
        translationQuotaKB: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ user: newUser }, { status: 201 });
  } catch (error) {
    console.error('Create user error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create user' },
      { status: 500 },
    );
  }
}
