import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useEnv } from '@/context/EnvContext';
import { useTranslation } from '@/hooks/useTranslation';
import { parseWebViewInfo } from '@/utils/ua';
import { getAppVersion } from '@/utils/version';
import SupportLinks from './SupportLinks';
import Dialog from './Dialog';
import Link from './Link';

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
        <div className='about-content flex flex-col items-center justify-center gap-4 pb-10 sm:pb-0'>
          <div className='flex flex-1 flex-col items-center justify-end gap-2 px-8 py-2'>
            <div className='mb-2 mt-6'>
              <Image src='/icon.png' alt='App Logo' className='h-20 w-20' width={64} height={64} />
            </div>
            <div className='flex select-text flex-col items-center'>
              <h2 className='mb-2 text-2xl font-bold'>
                Readest <LiteHighlight />
              </h2>
              <p className='text-neutral-content text-center text-sm'>
                {_('Version {{version}}', { version: getAppVersion() })} {`(${browserInfo})`}
              </p>
            </div>
          </div>

          <hr aria-hidden='true' className='border-base-300 my-12 w-full sm:my-4' />

          <div
            className='flex flex-1 flex-col items-center justify-start gap-2 px-4 text-center'
            dir='ltr'
          >
            <p className='text-neutral-content text-sm'>
              © {new Date().getFullYear()} cshdotcom. Based on Readest.
            </p>
            <p className='text-neutral-content text-xs'>
              Source code is available at{' '}
              <Link href='https://github.com/cshdotcom/readest-lite' className='text-blue-500 underline'>
                GitHub
              </Link>
              {' · '}
              <Link href='https://cshdotcom.github.io/readestl/' className='text-blue-500 underline'>
                Website
              </Link>
              .
            </p>
          </div>
          <SupportLinks />
        </div>
      )}
    </Dialog>
  );
};
