import { useEffect, useState } from 'react';
import { apiUrl } from '../config';

const apiCache = new Map<string, unknown>();

export function useApi<T>(path: string | null) {
  const fullUrl = path ? apiUrl(path) : null;

  const [state, setState] = useState<{ data: T | null; error: string; loading: boolean }>(() => ({
    data: fullUrl ? (apiCache.get(fullUrl) as T | undefined) ?? null : null,
    error: '',
    loading: Boolean(fullUrl),
  }));

  useEffect(() => {
    if (!fullUrl) {
      setState({ data: null, error: '', loading: false });
      return;
    }
    const cached = apiCache.get(fullUrl) as T | undefined;
    const controller = new AbortController();
    setState((old) => ({ data: cached ?? old.data, error: '', loading: !cached }));
    fetch(fullUrl, { signal: controller.signal, headers: { Accept: 'application/json' } })
      .then(async (response) => {
        const text = await response.text();
        let body: any;
        try {
          body = JSON.parse(text);
        } catch {
          throw new Error(text.trim() || `API returned HTTP ${response.status} without JSON.`);
        }
        if (!response.ok) throw new Error(body.error || `API returned HTTP ${response.status}.`);
        return body as T;
      })
      .then((data) => {
        apiCache.set(fullUrl, data);
        setState({ data, error: '', loading: false });
      })
      .catch((error: Error) => {
        if (error.name !== 'AbortError')
          setState((old) => ({ ...old, error: error.message, loading: false }));
      });
    return () => controller.abort();
  }, [fullUrl]);

  const retry = () => {
    if (fullUrl) {
      apiCache.delete(fullUrl);
      setState({ data: null, error: '', loading: true });
    }
  };

  return { ...state, retry };
}
