import { FaGithub } from 'react-icons/fa';
import { useTranslation } from '@/hooks/useTranslation';
import { useResponsiveSize } from '@/hooks/useResponsiveSize';
import Link from './Link';

const SupportLinks = () => {
  const _ = useTranslation();
  const iconSize = useResponsiveSize(24);

  return (
    <div className='my-2 flex flex-col items-center gap-2'>
      <p className='text-neutral-content text-sm'>{_('Get Help from the Readest Lite Community')}</p>
      <div className='flex gap-4'>
        <Link
          href='https://github.com/cshdotcom/readest-lite'
          className='flex items-center gap-2 rounded-full bg-gray-800 p-1.5 text-white transition-colors hover:bg-gray-700'
          title='GitHub'
          aria-label='GitHub'
        >
          <FaGithub size={iconSize} />
        </Link>
        <Link
          href='https://cshdotcom.github.io/readestl/'
          className='flex items-center gap-2 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 p-1.5 text-white transition-transform hover:scale-110 hover:from-emerald-400 hover:to-teal-500'
          title='Website'
          aria-label='Website'
        >
          <svg
            xmlns='http://www.w3.org/2000/svg'
            viewBox='0 0 24 24'
            width={iconSize}
            height={iconSize}
            fill='none'
            stroke='currentColor'
            strokeWidth='2'
            strokeLinecap='round'
            strokeLinejoin='round'
          >
            <circle cx='12' cy='12' r='10' />
            <line x1='2' y1='12' x2='22' y2='12' />
            <path d='M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z' />
          </svg>
        </Link>
      </div>
    </div>
  );
};

export default SupportLinks;
