// 管理员用户管理 API — 单个用户操作
// PUT    /api/admin/users/[id] — 更新用户（密码/名称/头像/配额/角色）
// DELETE /api/admin/users/[id] — 删除用户
// v8.19.0: 角色层级保护 — canManageUser 校验：
//   - super_admin 可以管理除自己外的所有人，但不能管理其他 super_admin
//   - admin 只能管理 user
//   - 不能操作自己（已有逻辑）
//   - 无人能修改/删除 super_admin
import { NextRequest, NextResponse } from 'next/server';
import { validateAdmin } from '@/utils/localAuth';
import { isValidAvatarUrl, isValidDisplayName } from '@/utils/userValidation';
import { canManageUser, canCreateRole, isSuperAdmin } from '@/utils/permissions';
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
    const { password, displayName, avatarUrl, storageQuotaMB, translationQuotaKB, email, role } = body;

    const targetUser = await prismaClient.user.findUnique({ where: { id } });
    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // v8.19.0: 角色层级 — 校验当前用户是否可以管理目标用户
    if (!canManageUser(adminUser, targetUser)) {
      if (isSuperAdmin(targetUser)) {
        return NextResponse.json({ error: 'Cannot modify a super admin' }, { status: 403 });
      }
      if (targetUser.id === adminUser.id) {
        return NextResponse.json({ error: 'Cannot modify yourself via admin API' }, { status: 400 });
      }
      return NextResponse.json({ error: 'Only super admins can manage admins' }, { status: 403 });
    }

    // v8.18.9: 校验 displayName —— 不允许 @ 等特殊字符
    if (displayName !== undefined && displayName !== null && typeof displayName === 'string' && displayName.trim()) {
      if (!isValidDisplayName(displayName)) {
        return NextResponse.json(
          { error: 'Display name cannot contain "@", angle brackets, quotes, slashes, or other special characters' },
          { status: 400 },
        );
      }
    }

    // v8.18.9: 校验 avatarUrl —— 接受任意格式包括 SVG；允许显式清空（'' 或 null）
    let normalizedAvatar: string | null | undefined = undefined;
    if (avatarUrl !== undefined) {
      if (avatarUrl === null) {
        normalizedAvatar = null;
      } else if (typeof avatarUrl === 'string') {
        if (avatarUrl.trim() === '') {
          normalizedAvatar = null;
        } else {
          if (!isValidAvatarUrl(avatarUrl)) {
            return NextResponse.json(
              { error: 'Avatar URL must be a valid http(s) or data: URL' },
              { status: 400 },
            );
          }
          normalizedAvatar = avatarUrl.trim();
        }
      }
    }

    const updateData: Record<string, unknown> = {};

    if (password && typeof password === 'string' && password.length > 0) {
      updateData['encryptedPass'] = await argon2.hash(password);
      // v8.4: 改密码时清空 encryptedVaultKey
      // 旧密码派的 KE 无法解密新密码登录后的 K_enc，用户需重新设置 vault
      updateData['encryptedVaultKey'] = null;
    }
    if (displayName !== undefined) {
      updateData['displayName'] = displayName || null;
    }
    // v8.18.9: 头像 URL 更新（已校验）
    if (normalizedAvatar !== undefined) {
      updateData['avatarUrl'] = normalizedAvatar;
    }
    if (typeof storageQuotaMB === 'number') {
      updateData['storageQuotaMB'] = storageQuotaMB;
    }
    if (typeof translationQuotaKB === 'number') {
      updateData['translationQuotaKB'] = translationQuotaKB;
    }
    if (email && typeof email === 'string') {
      updateData['email'] = email.toLowerCase().trim();
    }

    // v8.19.0: 角色变更 — super_admin 可以把 user 升级为 admin 或降级为 user；
    //   admin 不能改角色（canCreateRole 会拒绝）。
    //   任何人都不能把用户改为 super_admin（super_admin 由 SUPER_ADMIN_EMAIL 控制）。
    if (role !== undefined && typeof role === 'string') {
      const targetRole = role === 'admin' ? 'admin' : (role === 'user' ? 'user' : targetUser.role);
      if (targetRole !== targetUser.role) {
        // 校验：当前用户能创建目标角色
        if (!canCreateRole(adminUser, targetRole)) {
          return NextResponse.json(
            { error: 'You do not have permission to assign this role' },
            { status: 403 },
          );
        }
        // 防止降级最后一个 admin（保护至少有一个 admin）
        if (targetUser.role === 'admin' && targetRole === 'user') {
          const adminCount = await prismaClient.user.count({ where: { role: 'admin' } });
          if (adminCount <= 1) {
            return NextResponse.json(
              { error: 'Cannot demote the last admin' },
              { status: 400 },
            );
          }
        }
        updateData['role'] = targetRole;
      }
    }

    const updated = await prismaClient.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        role: true,
        displayName: true,
        avatarUrl: true,
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

  // v8.19.0: 无人能删除 super_admin
  if (isSuperAdmin(targetUser)) {
    return NextResponse.json({ error: 'Cannot delete a super admin' }, { status: 403 });
  }

  // v8.19.0: 角色层级 — 校验当前用户是否可以管理目标用户
  if (!canManageUser(adminUser, targetUser)) {
    return NextResponse.json({ error: 'Only super admins can manage admins' }, { status: 403 });
  }

  // 不能删除最后一个 admin
  if (targetUser.role === 'admin') {
    const adminCount = await prismaClient.user.count({ where: { role: 'admin' } });
    if (adminCount <= 1) {
      return NextResponse.json({ error: 'Cannot delete the last admin' }, { status: 400 });
    }
  }

  await prismaClient.user.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
