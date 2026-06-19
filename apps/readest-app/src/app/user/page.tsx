'use client';

import clsx from 'clsx';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEnv } from '@/context/EnvContext';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/hooks/useTheme';
import { useThemeStore } from '@/store/themeStore';
import { useQuotaStats } from '@/hooks/useQuotaStats';
import { useTranslation } from '@/hooks/useTranslation';
import { useUserActions } from '@/hooks/useUserActions';
import { navigateToLibrary } from '@/utils/nav';
import { eventDispatcher } from '@/utils/event';
import { Toast } from '@/components/Toast';
import LegalLinks from '@/components/LegalLinks';
import ProfileHeader from './components/Header';
import UserInfo from './components/UserInfo';
import UsageStats from './components/UsageStats';
import AccountActions from './components/AccountActions';
import StorageManager from './components/StorageManager';
import SharedLinksSection from './components/SharedLinksSection';
import { SyncPassphraseSection } from './components/SyncPassphraseSection';
import { SyncCategoriesSection } from './components/SyncCategoriesSection';
import UserManagement from './components/UserManagement';

// Readest Lite — 用户中心。
// Pro 体系已删除：移除 PlansComparison / Checkout / Stripe / IAP / useAvailablePlans。
// 保留：账号信息、用量统计、账号操作（登出/改邮箱/删账号）、存储管理、共享链接、同步设置。
const ProfilePage = () => {
  const _ = useTranslation();
  const router = useRouter();
  const { appService } = useEnv();
  const { token, user, refresh } = useAuth();
  const { safeAreaInsets, isRoundedWindow } = useThemeStore();

  const [showStorageManager, setShowStorageManager] = useState(false);
  const [showSharedLinksManager, setShowSharedLinksManager] = useState(false);
  const searchParams = useSearchParams();
  const [showSyncManager, setShowSyncManager] = useState(
    () => searchParams?.get('section') === 'sync',
  );

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted) return;

    const isAuthenticated = user && token && appService;
    if (isAuthenticated) return;

    const timer = setTimeout(() => {
      router.push('/auth?redirect=/library');
    }, 1000);

    return () => clearTimeout(timer);
  }, [mounted, user, token, appService, router]);

  useTheme({ systemUIVisible: false });

  const { quotas } = useQuotaStats();
  const { handleLogout, handleResetPassword, handleUpdateEmail, handleConfirmDelete } =
    useUserActions();

  const handleGoBack = () => {
    if (showStorageManager) {
      setShowStorageManager(false);
      refresh();
    } else if (showSharedLinksManager) {
      setShowSharedLinksManager(false);
    } else if (showSyncManager) {
      setShowSyncManager(false);
    } else {
      navigateToLibrary(router);
    }
  };

  const handleDeleteWithMessage = () => {
    handleConfirmDelete(_('Failed to delete user. Please try again later.'));
  };

  const handleManageStorage = () => setShowStorageManager(true);
  const handleManageSharedLinks = () => setShowSharedLinksManager(true);
  const handleManageSync = () => setShowSyncManager(true);

  if (!mounted) return null;

  if (!user || !token || !appService) {
    return (
      <div className='mx-auto max-w-4xl px-4 py-8'>
        <div className='overflow-hidden rounded-lg shadow-md'>
          <div className='flex min-h-[300px] items-center justify-center p-6'>
            <div className='text-base-content animate-pulse'>{_('Loading profile...')}</div>
          </div>
        </div>
      </div>
    );
  }

  const avatarUrl = user?.user_metadata?.['picture'] || user?.user_metadata?.['avatar_url'];
  const userFullName = user?.user_metadata?.['full_name'] || '-';
  const userEmail = user?.email || '';

  return (
    <div
      className={clsx(
        'bg-base-100 full-height inset-0 select-none overflow-hidden',
        appService?.hasRoundedWindow && isRoundedWindow && 'window-border rounded-window',
      )}
    >
      <div
        className={clsx('flex h-full w-full flex-col items-center overflow-y-auto')}
        style={{ paddingTop: `${safeAreaInsets?.top || 0}px` }}
      >
        <ProfileHeader onGoBack={handleGoBack} />
        <div className='w-full min-w-60 max-w-4xl py-10'>
          <div className='sm:bg-base-200 overflow-hidden rounded-lg sm:p-6 sm:shadow-md'>
            <div className='flex flex-col gap-y-8'>
              <div className='flex flex-col gap-y-8 px-6'>
                <UserInfo
                  avatarUrl={avatarUrl}
                  userFullName={userFullName}
                  userEmail={userEmail}
                  planDetails={null}
                />

                {!showStorageManager && !showSharedLinksManager && !showSyncManager && (
                  <UsageStats quotas={quotas} />
                )}
              </div>

              {showStorageManager ? (
                <div className='flex flex-col gap-y-8 px-6'>
                  <StorageManager />
                </div>
              ) : showSharedLinksManager ? (
                <div className='flex flex-col gap-y-8 px-6'>
                  <SharedLinksSection />
                </div>
              ) : showSyncManager ? (
                <div className='flex flex-col gap-y-8 px-6'>
                  <SyncCategoriesSection />
                  <SyncPassphraseSection />
                </div>
              ) : (
                <div className='flex flex-col gap-y-8 px-6'>
                  {/* 管理员可见用户管理 */}
                  {(user as unknown as { userRole?: string })?.userRole === 'admin' && (
                    <UserManagement />
                  )}
                  <AccountActions
                    userPlan={'pro'}
                    iapAvailable={false}
                    onLogout={handleLogout}
                    onResetPassword={handleResetPassword}
                    onUpdateEmail={handleUpdateEmail}
                    onConfirmDelete={handleDeleteWithMessage}
                    onRestorePurchase={() => {
                      eventDispatcher.dispatch('toast', {
                        type: 'info',
                        message: _('In-app purchases are not available in Readest Lite.'),
                      });
                    }}
                    onManageSubscription={() => {
                      eventDispatcher.dispatch('toast', {
                        type: 'info',
                        message: _('Subscription management is not available in Readest Lite.'),
                      });
                    }}
                    onManageStorage={handleManageStorage}
                    onManageSharedLinks={handleManageSharedLinks}
                    onManageSync={handleManageSync}
                  />
                </div>
              )}

              <LegalLinks />
            </div>
          </div>
        </div>
        <Toast />
      </div>
    </div>
  );
};

export default ProfilePage;
