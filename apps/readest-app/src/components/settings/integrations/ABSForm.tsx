/**
 * Lite stub for `./integrations/ABSForm`.
 * Audiobookshelf (ABS) server integration requires a configured ABS server.
 * Lite doesn't ship ABS. Stub renders an informational message.
 */

import React from 'react';
import { useTranslation } from '@/hooks/useTranslation';

interface ABSFormProps {
  onBack: () => void;
}

const ABSForm: React.FC<ABSFormProps> = ({ onBack }) => {
  const t = useTranslation();
  return (
    <div className="p-4">
      <p className="text-sm text-base-content/70">
        {t('Audiobookshelf integration is not available in Readest Lite')}
      </p>
      <button className="btn btn-ghost mt-4" onClick={onBack}>
        {t('Back')}
      </button>
    </div>
  );
};

export default ABSForm;
