// v8.19.0: 角色权限工具 — super_admin > admin > user
//
// 角色层级：
//   - super_admin: 最高权限，可以管理 admin 和 user。不能被任何人删除或降级。
//                  通常通过 SUPER_ADMIN_EMAIL 环境变量在容器启动时指定。
//   - admin: 可以管理 user（创建、修改、删除）。不能管理其他 admin 或 super_admin。
//   - user: 普通用户，只能管理自己的账号。
//
// 兼容性：旧的 validateAdmin 调用现在等价于 isAdmin（admin 或 super_admin）。
// 新代码应显式使用 isSuperAdmin / isAdmin / canManageUser 表达意图。

export type UserRole = 'super_admin' | 'admin' | 'user';

export interface RoleUser {
  role: string;
  email: string;
}

export interface ManagedUser {
  id: string;
  role: string;
}

/**
 * 是否为超级管理员。
 * 兼容 SUPER_ADMIN_EMAIL 环境变量：如果用户邮箱匹配，也视为超级管理员
 * （即使 DB role 还未同步，例如首次启动前的状态）。
 */
export const isSuperAdmin = (user: { role: string; email: string }): boolean => {
  if (user.role === 'super_admin') return true;
  const superEmail = process.env['SUPER_ADMIN_EMAIL'];
  if (superEmail && user.email && user.email.toLowerCase() === superEmail.toLowerCase()) {
    return true;
  }
  return false;
};

/**
 * 是否为管理员（admin 或 super_admin）。
 */
export const isAdmin = (user: { role: string; email: string }): boolean => {
  if (user.role === 'admin' || user.role === 'super_admin') return true;
  // 兼容 SUPER_ADMIN_EMAIL 环境变量
  return isSuperAdmin(user);
};

/**
 * 当前用户是否可以管理目标用户（创建/修改/删除）。
 *
 * 规则：
 *   - 不能操作自己（currentUser.id === targetUser.id）
 *   - super_admin 可以管理除自己外的所有人，但不能管理其他 super_admin
 *   - admin 只能管理 user
 *   - user 不能管理任何人
 */
export const canManageUser = (
  currentUser: { id: string; role: string; email: string },
  targetUser: { id: string; role: string },
): boolean => {
  if (currentUser.id === targetUser.id) return false;
  if (isSuperAdmin(currentUser)) {
    return targetUser.role !== 'super_admin';
  }
  if (isAdmin(currentUser)) {
    return targetUser.role === 'user';
  }
  return false;
};

/**
 * 当前用户是否可以创建目标角色的用户。
 *
 * 规则：
 *   - super_admin 可以创建 admin 和 user
 *   - admin 只能创建 user
 *   - user 不能创建任何人（也不应该调用此函数）
 */
export const canCreateRole = (
  currentUser: { role: string; email: string },
  targetRole: string,
): boolean => {
  if (isSuperAdmin(currentUser)) {
    return targetRole === 'admin' || targetRole === 'user';
  }
  if (isAdmin(currentUser)) {
    return targetRole === 'user';
  }
  return false;
};
