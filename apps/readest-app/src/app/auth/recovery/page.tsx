'use client';

import { useRouter } from 'next/navigation';
import { useThemeStore } from '@/store/themeStore';
import { useTranslation } from '@/hooks/useTranslation';

// Readest Lite — 密码恢复页。
// Lite 单账号模式下密码由 ADMIN_PASSWORD 环境变量控制，不支持自助恢复。
export default function ResetPasswordPage() {
  const _ = useTranslation();
  const router = useRouter();
  const { isDarkMode } = useThemeStore();

  return (
    <div className='flex min-h-screen items-center justify-center'>
      <div className='w-full max-w-md p-8 text-center'>
        <h2 className='text-xl font-bold mb-4'>{_('Password Recovery Unavailable')}</h2>
        <p className='text-base-content/70 text-sm mb-6'>
          {_('In Readest Lite, the admin password is managed via the ADMIN_PASSWORD environment variable. Contact your administrator to reset it.')}
        </p>
        <button
          onClick={() => router.back()}
          className={`flex w-full items-center justify-center gap-2 rounded-md border px-4 py-2.5 text-sm transition-colors ${
            isDarkMode
              ? 'border-gray-600 text-gray-300 hover:bg-gray-800'
              : 'border-gray-300 text-gray-700 hover:bg-gray-100'
          }`}
        >
          <svg
            xmlns='http://www.w3.org/2000/svg'
            className='h-4 w-4'
            fill='none'
            viewBox='0 0 24 24'
            stroke='currentColor'
          >
            <path
              strokeLinecap='round'
              strokeLinejoin='round'
              strokeWidth={2}
              d='M15 19l-7-7 7-7'
            />
          </svg>
          {_('Back')}
        </button>
      </div>
    </div>
  );
}
