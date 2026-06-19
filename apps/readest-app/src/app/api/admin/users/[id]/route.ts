// 管理员用户管理 API — 单个用户操作
// PUT    /api/admin/users/[id] — 更新用户（密码/名称/配额）
// DELETE /api/admin/users/[id] — 删除用户
import { NextRequest, NextResponse } from 'next/server';
import { validateAdmin } from '@/utils/localAuth';
import { prismaClient } from '@/utils/db';
import argon2 from 'argon2';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const { user: adminUser, token } = await validateAdmin(req.headers.get('authorization'));
  if (!adminUser || !token) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const { id } = await params;

  try {
    const body = await req.json();
    const { password, displayName, storageQuotaMB, translationQuotaKB, email } = body;

    const targetUser = await prismaClient.user.findUnique({ where: { id } });
    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // 不能删除/修改最后一个管理员
    if (targetUser.role === 'admin' && targetUser.id !== adminUser.id) {
      // 允许管理员修改其他管理员，但防止降级最后一个管理员
    }

    const updateData: Record<string, unknown> = {};

    if (password && typeof password === 'string' && password.length > 0) {
      updateData.encryptedPass = await argon2.hash(password);
    }
    if (displayName !== undefined) {
      updateData.displayName = displayName || null;
    }
    if (typeof storageQuotaMB === 'number') {
      updateData.storageQuotaMB = storageQuotaMB;
    }
    if (typeof translationQuotaKB === 'number') {
      updateData.translationQuotaKB = translationQuotaKB;
    }
    if (email && typeof email === 'string') {
      updateData.email = email.toLowerCase().trim();
    }

    const updated = await prismaClient.user.update({
      where: { id },
      data: updateData,
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
    });

    return NextResponse.json({ user: updated });
  } catch (error) {
    console.error('Update user error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update user' },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const { user: adminUser, token } = await validateAdmin(req.headers.get('authorization'));
  if (!adminUser || !token) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const { id } = await params;

  // 不能删除自己
  if (id === adminUser.id) {
    return NextResponse.json({ error: 'Cannot delete yourself' }, { status: 400 });
  }

  const targetUser = await prismaClient.user.findUnique({ where: { id } });
  if (!targetUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  // 不能删除最后一个管理员
  if (targetUser.role === 'admin') {
    const adminCount = await prismaClient.user.count({ where: { role: 'admin' } });
    if (adminCount <= 1) {
      return NextResponse.json({ error: 'Cannot delete the last admin' }, { status: 400 });
    }
  }

  await prismaClient.user.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
