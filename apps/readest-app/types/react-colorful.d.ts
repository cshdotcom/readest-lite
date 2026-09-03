declare module 'react-colorful' {
  import React from 'react';
  export const HexColorPicker: React.FC<{
    color?: string;
    onChange?: (color: string) => void;
  }>;
  export const HexColorInput: React.FC<{
    color?: string;
    onChange?: (color: string) => void;
  }>;
}
