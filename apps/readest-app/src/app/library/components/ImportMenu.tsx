import clsx from 'clsx';
import { MdLink, MdRssFeed, MdDownload } from 'react-icons/md';
import { IoFileTray } from 'react-icons/io5';
import { LuLibrary } from 'react-icons/lu';
import { useEnv } from '@/context/EnvContext';
import { useTranslation } from '@/hooks/useTranslation';
import MenuItem from '@/components/MenuItem';
import Menu from '@/components/Menu';

interface ImportMenuProps {
  setIsDropdownOpen?: (open: boolean) => void;
  onImportBooksFromFiles: () => void;
  onImportBooksFromDirectory?: () => void;
  onImportBookFromUrl?: () => void;
  onDownloadFromUrl?: () => void;
  onOpenCatalogManager: () => void;
  onOpenFeeds: () => void;
}

const ImportMenu: React.FC<ImportMenuProps> = ({
  setIsDropdownOpen,
  onImportBooksFromFiles,
  onImportBooksFromDirectory,
  onImportBookFromUrl,
  onDownloadFromUrl,
  onOpenCatalogManager,
  onOpenFeeds,
}) => {
  const _ = useTranslation();
  const { appService } = useEnv();

  const handleImportFromFiles = () => {
    onImportBooksFromFiles();
    setIsDropdownOpen?.(false);
  };

  const handleImportFromDirectory = () => {
    onImportBooksFromDirectory?.();
    setIsDropdownOpen?.(false);
  };

  const handleImportFromUrl = () => {
    onImportBookFromUrl?.();
    setIsDropdownOpen?.(false);
  };

  const handleDownloadFromUrl = () => {
    onDownloadFromUrl?.();
    setIsDropdownOpen?.(false);
  };

  const handleOpenCatalogManager = () => {
    onOpenCatalogManager();
    setIsDropdownOpen?.(false);
  };

  const handleOpenFeeds = () => {
    onOpenFeeds();
    setIsDropdownOpen?.(false);
  };

  return (
    <Menu
      className={clsx('dropdown-content bg-base-100 rounded-box !relative z-[1] mt-3 p-2 shadow')}
      onCancel={() => setIsDropdownOpen?.(false)}
    >
      <MenuItem
        label={_('From Local File')}
        Icon={<IoFileTray className='h-5 w-5' />}
        onClick={handleImportFromFiles}
      />
      {onImportBooksFromDirectory && (
        <MenuItem
          label={_('From Directory')}
          Icon={<IoFileTray className='h-5 w-5' />}
          onClick={handleImportFromDirectory}
        />
      )}
      {onImportBookFromUrl && (
        <MenuItem
          label={_('From Web URL')}
          Icon={<MdLink className='h-5 w-5' />}
          onClick={handleImportFromUrl}
        />
      )}
      {onDownloadFromUrl && (
        <MenuItem
          label={_('Download from URL')}
          Icon={<MdDownload className='h-5 w-5' />}
          onClick={handleDownloadFromUrl}
        />
      )}
      <MenuItem
        label={_('From Feed URL')}
        Icon={<MdRssFeed className='h-5 w-5' />}
        onClick={handleOpenFeeds}
      />
      <MenuItem
        label={appService?.isOnlineCatalogsAccessible ? _('Online Library') : _('OPDS Catalogs')}
        Icon={<LuLibrary className='h-5 w-5' />}
        onClick={handleOpenCatalogManager}
      />
    </Menu>
  );
};

export default ImportMenu;
