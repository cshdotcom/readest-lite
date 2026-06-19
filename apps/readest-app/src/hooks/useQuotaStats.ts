import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { QuotaType, UserPlan } from '@/types/quota';
import { useTranslation } from './useTranslation';

// Readest Lite — Pro 体系删除后，配额恒为无限。
// 仍保留 hooks 形态以兼容调用方（SettingsMenu / useUserActions 等）。
export const useQuotaStats = (briefName = false) => {
  const _ = useTranslation();
  const { token, user } = useAuth();
  const [quotas, setQuotas] = useState<QuotaType[]>([]);
  const [userProfilePlan, setUserProfilePlan] = useState<UserPlan | undefined>(undefined);

  useEffect(() => {
    if (!user || !token) return;

    // Pro 体系删除 — 配额 100TB
    const storageQuota: QuotaType = {
      name: briefName ? _('Storage') : _('Cloud Sync Storage'),
      tooltip: _('100TB storage'),
      used: 0,
      total: 100,
      unit: 'TB',
    };
    const now = new Date();
    const translationResetAt = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
    );
    const translationQuota: QuotaType = {
      name: briefName ? _('Translation') : _('Translation Characters'),
      tooltip: _('100TB daily translation'),
      used: 0,
      total: 100,
      unit: 'TB',
      resetAt: translationResetAt,
    };
    setUserProfilePlan('pro');
    setQuotas([storageQuota, translationQuota]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return {
    quotas,
    userProfilePlan,
  };
};
