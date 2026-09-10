import React, { useRef, useState } from 'react';
import { MdDataObject, MdNightlightRound, MdFileUpload } from 'react-icons/md';
import { useTranslation } from '@/hooks/useTranslation';
import { BoxedList, NavigationRow } from '@/components/settings/primitives';
import Dialog from '@/components/Dialog';
import { getAccessToken } from '@/utils/access';
import { getAPIBaseUrl } from '@/services/environment';
import { eventDispatcher } from '@/utils/event';

interface ImportAnnotationsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImportMoonReader: () => void;
  onImportReadest: () => void;
}

/**
 * Dedicated modal listing the annotation-import sources. Each source is a
 * boxed-list row; new providers (Calibre, KOReader, …) are added by dropping
 * another `<NavigationRow>` here and wiring its callback in the Annotator.
 *
 * v8.22: 增加 ReadEra 导入入口 — 直接上传 library.json 即可。
 */
const ImportAnnotationsDialog: React.FC<ImportAnnotationsDialogProps> = ({
  isOpen,
  onClose,
  onImportMoonReader,
  onImportReadest,
}) => {
  const _ = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  const handleReadEraImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const token = await getAccessToken();
      const formData = new FormData();
      formData.append('file', file);
      const resp = await fetch(`${getAPIBaseUrl()}/readera-import`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await resp.json();
      if (resp.ok) {
        eventDispatcher.dispatch('toast', {
          message: _('Imported {{count}} annotation(s) from ReadEra', { count: data.importedNotes + data.importedBookmarks }),
          type: 'success',
        });
        onClose();
      } else {
        eventDispatcher.dispatch('toast', {
          message: data.error || _('ReadEra import failed'),
          type: 'error',
        });
      }
    } catch (err) {
      eventDispatcher.dispatch('toast', {
        message: err instanceof Error ? err.message : _('ReadEra import failed'),
        type: 'error',
      });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      title={_('Import Annotations')}
      onClose={onClose}
      boxClassName='sm:h-auto! sm:max-h-[90vh]! sm:w-[420px]!'
      contentClassName='sm:px-6!'
    >
      <BoxedList
        title={_('Import From')}
        description={_('Import highlights and notes exported from Readest Lite or another reading app.')}
      >
        <NavigationRow
          icon={MdDataObject}
          title={_('Readest')}
          status={_('Readest Lite annotations file (.json)')}
          onClick={onImportReadest}
        />
        <NavigationRow
          icon={MdNightlightRound}
          title={_('Moon+ Reader')}
          status={_('Moon+ Reader export file (.mrexpt)')}
          onClick={onImportMoonReader}
        />
        <NavigationRow
          icon={MdFileUpload}
          title={_('ReadEra')}
          status={_('ReadEra library.json — unzip .bak and upload library.json')}
          onClick={() => fileInputRef.current?.click()}
        />
        <input
          ref={fileInputRef}
          type='file'
          accept='.json,application/json'
          onChange={handleReadEraImport}
          className='hidden'
        />
      </BoxedList>
      {importing && (
        <div className='mt-4 flex items-center justify-center'>
          <span className='loading loading-spinner loading-sm' />
        </div>
      )}
    </Dialog>
  );
};

export default ImportAnnotationsDialog;
