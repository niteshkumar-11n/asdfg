import { useEffect, useState } from 'react';

const apiCache = new Map<string, unknown>();

export function useApi<T>(url: string | null) {
  const [state, setState] = useState<{ data: T | null; error: string; loading: boolean }>(() => ({
    data: url ? (apiCache.get(url) as T | undefined) ?? null : null,
    error: '',
    loading: Boolean(url),
  }));

  useEffect(() => {
    if (!url) {
      setState({ data: null, error: '', loading: false });
      return;
    }
    const cached = apiCache.get(url) as T | undefined;
    const controller = new AbortController();
    setState((old) => ({ data: cached ?? old.data, error: '', loading: !cached }));
    fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } })
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
        apiCache.set(url, data);
        setState({ data, error: '', loading: false });
      })
      .catch((error: Error) => {
        if (error.name !== 'AbortError')
          setState((old) => ({ ...old, error: error.message, loading: false }));
      });
    return () => controller.abort();
  }, [url]);

  const retry = () => {
    if (url) {
      apiCache.delete(url);
      setState({ data: null, error: '', loading: true });
    }
  };

  return { ...state, retry };
}
