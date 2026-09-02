import { useEffect, useState } from 'react';
import Image from 'next/image';
import { FaGithub } from 'react-icons/fa';
import { useEnv } from '@/context/EnvContext';
import { useTranslation } from '@/hooks/useTranslation';
import { parseWebViewInfo } from '@/utils/ua';
import { getAppVersion } from '@/utils/version';
import Dialog from './Dialog';

export const setAboutDialogVisible = (visible: boolean) => {
  const dialog = document.getElementById('about_window');
  if (dialog) {
    const event = new CustomEvent('setDialogVisibility', {
      detail: { visible },
    });
    dialog.dispatchEvent(event);
  }
};

// v8.2.0: "Lite" 炫酷高亮样式 — 渐变 + 阴影发光
const LiteHighlight = () => (
  <span
    className='bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent font-extrabold tracking-wide drop-shadow-[0_0_8px_rgba(45,212,191,0.4)]'
  >
    Lite
  </span>
);

// Lite 仓库图标 — 渐变圆形 + Lite 字母
const LiteRepoIcon = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox='0 0 24 24' fill='none'>
    <circle cx='12' cy='12' r='11' fill='url(#lite-grad)' />
    <defs>
      <linearGradient id='lite-grad' x1='0' y1='0' x2='24' y2='24'>
        <stop offset='0%' stopColor='#34d399' />
        <stop offset='50%' stopColor='#5eead4' />
        <stop offset='100%' stopColor='#22d3ee' />
      </linearGradient>
    </defs>
    <text
      x='12'
      y='16'
      textAnchor='middle'
      fill='white'
      fontSize='10'
      fontWeight='bold'
      fontFamily='sans-serif'
    >
      L
    </text>
  </svg>
);

// 上游 Readest 仓库图标 — 深色圆形 + R 字母
const UpstreamRepoIcon = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox='0 0 24 24' fill='none'>
    <circle cx='12' cy='12' r='11' fill='#1e293b' />
    <text
      x='12'
      y='16'
      textAnchor='middle'
      fill='#94a3b8'
      fontSize='11'
      fontWeight='bold'
      fontFamily='sans-serif'
    >
      R
    </text>
  </svg>
);

export const AboutWindow = () => {
  const _ = useTranslation();
  const { appService } = useEnv();
  const [browserInfo, setBrowserInfo] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setBrowserInfo(parseWebViewInfo(appService));

    const handleCustomEvent = (event: CustomEvent) => {
      setIsOpen(event.detail.visible);
    };

    const el = document.getElementById('about_window');
    if (el) {
      el.addEventListener('setDialogVisibility', handleCustomEvent as EventListener);
    }

    return () => {
      if (el) {
        el.removeEventListener('setDialogVisibility', handleCustomEvent as EventListener);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClose = () => {
    setIsOpen(false);
  };

  return (
    <Dialog
      id='about_window'
      isOpen={isOpen}
      title={_('About Readest Lite')}
      onClose={handleClose}
      boxClassName='sm:!w-[480px] sm:!max-w-screen-sm sm:h-auto'
    >
      {isOpen && (
        // select-none + onContextMenu prevent 选中复制和右键
        <div
          className='about-content flex flex-col items-center justify-center gap-4 pb-10 sm:pb-0 select-none'
          onContextMenu={(e) => e.preventDefault()}
          style={{ userSelect: 'none', WebkitUserSelect: 'none', MozUserSelect: 'none' } as React.CSSProperties}
        >
          <div className='flex flex-1 flex-col items-center justify-end gap-2 px-8 py-2'>
            <div className='mb-2 mt-6'>
              <Image src='/icon.png' alt='App Logo' className='h-20 w-20' width={64} height={64} draggable={false} />
            </div>
            <div className='flex flex-col items-center'>
              <h2 className='mb-2 text-2xl font-bold'>
                Readest <LiteHighlight />
              </h2>
              <p className='text-neutral-content text-center text-sm' style={{ userSelect: 'none' }}>
                {_('Version {{version}}', { version: getAppVersion() })} {`(${browserInfo})`}
              </p>
            </div>
          </div>

          <hr aria-hidden='true' className='border-base-300 my-8 w-full sm:my-4' />

          {/* 仓库链接区 — 区分 Lite 和上游 */}
          <div className='flex flex-col items-center gap-3 px-4' dir='ltr'>
            {/* Lite 仓库 */}
            <a
              href='https://github.com/cshdotcom/readest-lite'
              target='_blank'
              rel='noopener noreferrer'
              className='flex items-center gap-3 rounded-lg bg-base-200 px-4 py-2 transition-colors hover:bg-base-300'
            >
              <LiteRepoIcon size={28} />
              <div className='flex flex-col'>
                <span className='text-sm font-medium'>Readest Lite</span>
                <span className='text-xs opacity-60'>github.com/cshdotcom/readest-lite</span>
              </div>
            </a>

            {/* 上游原版仓库 */}
            <a
              href='https://github.com/readest/readest'
              target='_blank'
              rel='noopener noreferrer'
              className='flex items-center gap-3 rounded-lg bg-base-200 px-4 py-2 transition-colors hover:bg-base-300'
            >
              <UpstreamRepoIcon size={28} />
              <div className='flex flex-col'>
                <span className='text-sm font-medium'>Readest (上游原版)</span>
                <span className='text-xs opacity-60'>github.com/readest/readest</span>
              </div>
            </a>

            {/* 官网 */}
            <a
              href='https://cshdotcom.github.io/readestl/'
              target='_blank'
              rel='noopener noreferrer'
              className='flex items-center gap-3 rounded-lg bg-base-200 px-4 py-2 transition-colors hover:bg-base-300'
            >
              <FaGithub size={28} className='opacity-70' />
              <div className='flex flex-col'>
                <span className='text-sm font-medium'>{_('Website')}</span>
                <span className='text-xs opacity-60'>cshdotcom.github.io/readestl</span>
              </div>
            </a>
          </div>
        </div>
      )}
    </Dialog>
  );
};
