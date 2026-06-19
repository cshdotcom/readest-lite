// 替换原 utils/access.ts。
// 所有 Pro/配额判断改为"无限"返回，前端零判断直接开放所有功能。
// 兼容原 access.ts 的所有导出：getSubscriptionPlan / getUserProfilePlan /
// EMAIL_IN_PLANS / isEmailInPlan / STORAGE_QUOTA_GRACE_BYTES /
// getStoragePlanData / getTranslationQuota / getTranslationPlanData /
// getDailyTranslationPlanData / getAccessToken / getUserID / validateUserAndToken
//
// 关键：validateUserAndToken 用 dynamic import 加载 localAuth（含 argon2/prisma），
// 避免客户端 build 时把 argon2 / @prisma/client 打到 bundle（会因 'fs' 找不到失败）。
import type { UserPlan } from '@/types/quota';

// 兼容前端类型；plan 在新系统里恒为 'pro'。
export const getSubscriptionPlan = (_token: string): UserPlan => 'pro';
export const getUserProfilePlan = (_token: string): UserPlan => 'pro';

// Pro 体系删除：所有 plan 都视为可使用 email-in。
export const EMAIL_IN_PLANS: readonly UserPlan[] = ['plus', 'pro', 'purchase'];
export const isEmailInPlan = (_plan: UserPlan): boolean => true;

// 配额：100TB（足够大但不溢出 UI 显示）
const QUOTA_100TB = 100 * 1024 * 1024 * 1024 * 1024;
export const STORAGE_QUOTA_GRACE_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB grace

export const getStoragePlanData = (_token: string) => {
  return {
    plan: 'pro' as UserPlan,
    usage: 0,
    quota: QUOTA_100TB,
  };
};

export const getTranslationQuota = (_plan: UserPlan): number => QUOTA_100TB;

export const getTranslationPlanData = (_token: string) => {
  return {
    plan: 'pro' as UserPlan,
    usage: 0,
    quota: QUOTA_100TB,
  };
};

export const getDailyTranslationPlanData = (_token: string) => {
  return {
    plan: 'pro' as UserPlan,
    quota: QUOTA_100TB,
  };
};

// ───────────────────────────────────────────────────────────────────────────
// 兼容前端 getAccessToken / getUserID
// ───────────────────────────────────────────────────────────────────────────
export const getAccessToken = async (): Promise<string | null> => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('token') ?? null;
};

export const getUserID = async (): Promise<string | null> => {
  if (typeof window === 'undefined') return null;
  const user = localStorage.getItem('user') ?? '{}';
  try {
    return (JSON.parse(user) as { id?: string }).id ?? null;
  } catch {
    return null;
  }
};

// ───────────────────────────────────────────────────────────────────────────
// 服务端校验（替代原 supabase.auth.getUser）
// 路由侧调用：const { user, token } = await validateUserAndToken(req.headers.get('authorization'))
//
// 关键：用 dynamic import 加载 localAuth，避免客户端 build 时把 argon2/@prisma/client
// 打到 bundle（会因 'fs' 找不到失败）。客户端代码不会调用 validateUserAndToken，
// 但 webpack 仍会跟随静态 import 解析整个依赖图，所以必须用 dynamic import。
// ───────────────────────────────────────────────────────────────────────────
export interface AuthUser {
  id: string;
  email: string;
  aud: string;
  role: string;
  app_metadata: Record<string, unknown>;
  user_metadata: Record<string, unknown>;
  created_at: string;
  userRole?: string;
  displayName?: string | null;
  storageQuotaMB?: number;
  translationQuotaKB?: number;
}

export const validateUserAndToken = async (
  authHeader: string | null | undefined,
): Promise<{ user?: AuthUser; token?: string }> => {
  if (!authHeader) return {};
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const { verifyAccessToken } = await import('./localAuth');
  const user = verifyAccessToken(token);
  if (!user) return {};
  const { prismaClient } = await import('./db');
  const dbUser = await prismaClient.user.findUnique({ where: { id: user.id } });
  if (!dbUser) return {};
  user.userRole = dbUser.role;
  user.displayName = dbUser.displayName;
  user.storageQuotaMB = dbUser.storageQuotaMB;
  user.translationQuotaKB = dbUser.translationQuotaKB;
  return { user, token };
};

export const validateAdmin = async (
  authHeader: string | null | undefined,
): Promise<{ user?: AuthUser; token?: string }> => {
  const result = await validateUserAndToken(authHeader);
  if (!result.user || result.user.userRole !== 'admin') return {};
  return result;
};

export const getActualStorageUsage = async (userId: string): Promise<number> => {
  const { prismaClient } = await import('./db');
  const agg = await prismaClient.file.aggregate({
    where: { userId, deletedAt: null },
    _sum: { fileSize: true },
  });
  return Number(agg._sum.fileSize ?? 0);
};
