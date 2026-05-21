export const AUTH_COOKIE = 'adminAuth';
export const AUTH_VALUE = '1';

export const ADMIN_USER = 'admin';
export const ADMIN_PASS = 'admin';

export function isAuthValue(value: string | undefined): boolean {
  return value === AUTH_VALUE;
}
