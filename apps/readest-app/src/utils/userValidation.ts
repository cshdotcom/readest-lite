/**
 * v8.19.0: Username/displayName validation.
 * Rejects @, angle brackets, quotes, slashes, control chars.
 */

export const isValidDisplayName = (name: string): boolean => {
  if (!name || name.trim().length === 0 || name.length > 100) return false;
  if (/@/.test(name)) return false;
  if (/[<>:"'\\/|?*]/.test(name)) return false;
  if (/[\u0000-\u001f]/.test(name)) return false;
  return true;
};

export const displayNameError = (name: string): string | null => {
  if (!name || name.trim().length === 0) return 'Display name is required';
  if (name.length > 100) return 'Display name must be 100 characters or less';
  if (/@/.test(name)) return 'Display name cannot contain "@"';
  if (/[<>:"\'\\/|?*]/.test(name)) return 'Display name cannot contain special characters';
  if (/[\u0000-\u001f]/.test(name)) return 'Display name cannot contain control characters';
  return null;
};
