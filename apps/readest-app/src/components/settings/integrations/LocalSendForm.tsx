/**
 * Lite stub for `./integrations/LocalSendForm`.
 * LocalSend (LAN book transfer) is a Tauri-native-only feature; Lite is web-only.
 * Stub renders an informational message.
 */

import React from 'react';
import { useTranslation } from '@/hooks/useTranslation';

interface LocalSendFormProps {
  onBack: () => void;
}

const LocalSendForm: React.FC<LocalSendFormProps> = ({ onBack }) => {
  const t = useTranslation();
  return (
    <div className="p-4">
      <p className="text-sm text-base-content/70">
        {t('LocalSend is not available in Readest Lite')}
      </p>
      <button className="btn btn-ghost mt-4" onClick={onBack}>
        {t('Back')}
      </button>
    </div>
  );
};

export default LocalSendForm;
