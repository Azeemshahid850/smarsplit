import { useState, useEffect, useCallback } from 'react';

// Tiny fetch-on-mount hook: covers the loading / error / data triple every list needs.
export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: '' });

  const run = useCallback(() => {
    setState((previous) => ({ ...previous, loading: true, error: '' }));
    return fn()
      .then((data) => setState({ data, loading: false, error: '' }))
      .catch((err) => setState({ data: null, loading: false, error: err.message || 'Something went wrong' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    run();
  }, [run]);

  return { ...state, reload: run, setData: (data) => setState((previous) => ({ ...previous, data })) };
}
