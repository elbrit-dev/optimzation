import { useEffect, useMemo, useRef } from 'react';
import debounce from 'lodash/debounce';

/**
 * Custom hook for debouncing function calls using lodash.debounce
 * @param {Function} callback - The function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {Function} Debounced function
 */
export function useDebounce(callback, delay) {
  const callbackRef = useRef(callback);

  // Always keep latest callback in a ref so the debounced function stays fresh
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const debouncedCallback = useMemo(() => {
    return debounce((...args) => {
      callbackRef.current?.(...args);
    }, delay);
  }, [delay]);

  useEffect(() => {
    return () => {
      debouncedCallback.cancel();
    };
  }, [debouncedCallback]);

  return debouncedCallback;
}
