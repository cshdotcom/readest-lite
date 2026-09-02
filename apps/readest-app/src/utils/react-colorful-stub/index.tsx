// Lite stub for react-colorful — color picker not available
import React from 'react';

export const HexColorPicker: React.FC<{
  color?: string;
  onChange?: (color: string) => void;
}> = () => {
  return React.createElement('div', null);
};

export const HexColorInput: React.FC<{
  color?: string;
  onChange?: (color: string) => void;
}> = ({ color, onChange }) => {
  return React.createElement('input', {
    type: 'text',
    value: color || '',
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange?.(e.target.value),
  });
};
