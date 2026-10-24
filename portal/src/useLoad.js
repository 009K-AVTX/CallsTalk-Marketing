import { useCallback, useEffect, useState } from 'react';

// Runs `load` whenever its inputs change; the latest request wins.
export default function useLoad(load, deps) {
  const [state, setState] = useState({ data: null, error: '', loading: true });
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true, error: '' }));
    load()
      .then((data) => live && setState({ data, error: '', loading: false }))
      .catch((err) => live && setState((s) => ({ ...s, error: err.message, loading: false })));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  return { ...state, reload };
}
