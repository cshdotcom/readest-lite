/**
 * Lite stub for `./audiobook/AudiobookPairingDialog`.
 * Audiobook pairing (ABS + local audiobook) requires native file system access.
 * Lite is web-only and ships no audiobook pairing. The stub renders nothing.
 */

import React from 'react';

interface AudiobookPairingDialogProps {
  bookKey: string;
  bookDoc: unknown;
  onClose: () => void;
}

const AudiobookPairingDialog: React.FC<AudiobookPairingDialogProps> = () => null;

export default AudiobookPairingDialog;
