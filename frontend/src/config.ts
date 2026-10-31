declare const process: { env?: Record<string, string | undefined> } | undefined;

const envUrl =
  typeof process !== 'undefined' && process?.env?.VITE_API_URL
    ? process.env.VITE_API_URL
    : '';
const windowUrl =
  typeof window !== 'undefined' && (window as any).__API_URL__
    ? (window as any).__API_URL__
    : '';

export const API_BASE_URL = (envUrl || windowUrl || '').replace(/\/+$/, '');

export function apiUrl(path: string): string {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  if (!API_BASE_URL) return path;
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${cleanPath}`;
}
