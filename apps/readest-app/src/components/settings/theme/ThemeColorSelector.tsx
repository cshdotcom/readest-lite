import React from 'react';
import { PiPlus } from 'react-icons/pi';
import { Theme } from '@/styles/themes';
import { useTranslation } from '@/hooks/useTranslation';
import { useResponsiveSize } from '@/hooks/useResponsiveSize';
import { SectionTitle } from '../primitives';
import { BiPencil } from 'react-icons/bi';

interface ThemeColorSelectorProps {
  themes: Theme[];
  themeColor: string;
  isDarkMode: boolean;
  onThemeColorChange: (name: string) => void;
  onEditTheme: (name: string) => void;
  onCreateTheme: () => void;
}

const ThemeColorSelector: React.FC<ThemeColorSelectorProps> = ({
  themes,
  themeColor,
  isDarkMode,
  onThemeColorChange,
  onEditTheme,
  onCreateTheme,
}) => {
  const _ = useTranslation();
  const iconSize16 = useResponsiveSize(16);
  const iconSize24 = useResponsiveSize(24);

  return (
    <div>
      <SectionTitle className='mb-2'>{_('Theme Color')}</SectionTitle>
      <div className='grid grid-cols-3 gap-4'>
        {themes.map(({ name, label, colors, isCustomizable }) => (
          <button
            key={name}
            tabIndex={0}
            onClick={() => onThemeColorChange(name)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                onThemeColorChange(name);
              }
              e.stopPropagation();
            }}
            // Selected card gets a 2px border in the card's OWN text color
            // (`border-current`) — guaranteed contrast against the theme's
            // background, light or dark. The transparent border on inactive
            // cards reserves the same 2px so selecting/deselecting doesn't
            // shift the grid.
            className={`relative flex cursor-pointer flex-col items-center justify-end rounded-lg border-2 p-3 shadow-md ${
              themeColor === name ? 'border-current' : 'border-transparent'
            }`}
            style={{
              backgroundColor: isDarkMode ? colors.dark['base-100'] : colors.light['base-100'],
              color: isDarkMode ? colors.dark['base-content'] : colors.light['base-content'],
              minHeight: '80px',
            }}
          >
            <input
              aria-label={_(label)}
              type='radio'
              name='theme'
              value={name}
              checked={themeColor === name}
              onChange={() => onThemeColorChange(name)}
              className='hidden'
            />
            <span className='max-w-full truncate text-lg font-bold'>Aa</span>
            <span className='max-w-full truncate font-semibold'>{_(label)}</span>
            {isCustomizable && themeColor === name && (
              <button onClick={() => onEditTheme(name)}>
                <BiPencil size={iconSize16} className='absolute right-2 top-2' />
              </button>
            )}
          </button>
        ))}
        <button
          className='relative flex cursor-pointer flex-col gap-1 items-center justify-end rounded-lg border border-dashed p-3 shadow-md'
          onClick={onCreateTheme}
        >
          <PiPlus size={iconSize24} />
          <span className='max-w-full truncate font-semibold'>{_('Custom')}</span>
        </button>
      </div>
    </div>
  );
};

export default ThemeColorSelector;
