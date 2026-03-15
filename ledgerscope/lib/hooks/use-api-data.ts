"use client";

import { useCallback, useEffect, useState } from "react";

type UseApiDataResult<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

export function useApiData<T>(fetcher: () => Promise<T>): UseApiDataResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await fetcher();
      setData(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load data.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [fetcher]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, error, reload: load };
}
