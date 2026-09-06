/**
 * v8.19.0: Role hierarchy and permission helpers.
 * super_admin > admin > user
 * Super admin: can manage admins and users, can't manage other super admins or self
 * Admin: can only manage regular users
 * Nobody can delete/modify a super admin
 */

export const isSuperAdmin = (user: { role: string; email: string }): boolean =>
  user.role === 'super_admin' || user.email === process.env['SUPER_ADMIN_EMAIL'];

export const isAdmin = (user: { role: string }): boolean =>
  user.role === 'admin' || user.role === 'super_admin';

export const canManageUser = (
  currentUser: { id: string; role: string; email: string },
  targetUser: { id: string; role: string; email: string },
): boolean => {
  // Can't operate on self
  if (currentUser.id === targetUser.id) return false;
  // Super admin can manage everyone except other super admins
  if (isSuperAdmin(currentUser)) return !isSuperAdmin(targetUser);
  // Admin can only manage regular users
  if (isAdmin(currentUser)) return targetUser.role === 'user';
  return false;
};

export const canDeleteUser = canManageUser;

export const canModifyUserRole = (
  currentUser: { id: string; role: string; email: string },
  targetUser: { id: string; role: string; email: string },
  newRole: string,
): boolean => {
  if (!canManageUser(currentUser, targetUser)) return false;
  // Only super admin can set super_admin role
  if (newRole === 'super_admin' && !isSuperAdmin(currentUser)) return false;
  // Only super admin can set admin role
  if (newRole === 'admin' && !isSuperAdmin(currentUser)) return false;
  return true;
};
