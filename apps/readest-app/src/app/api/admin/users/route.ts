// 管理员用户管理 API
// GET  /api/admin/users — 列出所有用户
// POST /api/admin/users — 创建新用户
import { NextRequest, NextResponse } from 'next/server';
import { validateAdmin, resolveAvatarUrl } from '@/utils/localAuth';
import { isValidAvatarUrl, isValidDisplayName } from '@/utils/userValidation';
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
      // v8.18.9: 列表里展示头像
      avatarUrl: true,
      storageQuotaMB: true,
      translationQuotaKB: true,
      createdAt: true,
      lastSignInAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  // v8.18.9: 管理员头像在响应时应用 ADMIN_AVATAR_URL 优先级覆盖，保证列表
  // 里看到的头像和该用户登录后看到自己的头像一致。
  const usersWithAvatar = users.map((u) => ({
    ...u,
    avatarUrl: resolveAvatarUrl(u),
  }));

  return NextResponse.json({ users: usersWithAvatar });
}

export async function POST(req: NextRequest) {
  const { user, token } = await validateAdmin(req.headers.get('authorization'));
  if (!user || !token) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { email, password, displayName, avatarUrl, storageQuotaMB, translationQuotaKB } = body;

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    // v8.18.9: 校验 displayName —— 不允许 @ 等特殊字符（避免和 email 混淆/注入风险）
    if (displayName && !isValidDisplayName(displayName)) {
      return NextResponse.json(
        { error: 'Display name cannot contain "@", angle brackets, quotes, slashes, or other special characters' },
        { status: 400 },
      );
    }

    // v8.18.9: 校验 avatarUrl —— 拒绝 SVG
    let normalizedAvatar: string | null = null;
    if (avatarUrl && typeof avatarUrl === 'string' && avatarUrl.trim()) {
      if (!isValidAvatarUrl(avatarUrl)) {
        return NextResponse.json(
          { error: 'Avatar URL must be a valid http(s) or data: URL and cannot be SVG' },
          { status: 400 },
        );
      }
      normalizedAvatar = avatarUrl.trim();
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
        // v8.18.9: 头像 URL（已校验非 SVG）
        avatarUrl: normalizedAvatar,
        storageQuotaMB: typeof storageQuotaMB === 'number' ? storageQuotaMB : 0,
        translationQuotaKB: typeof translationQuotaKB === 'number' ? translationQuotaKB : 0,
      },
      select: {
        id: true,
        email: true,
        role: true,
        displayName: true,
        avatarUrl: true,
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
