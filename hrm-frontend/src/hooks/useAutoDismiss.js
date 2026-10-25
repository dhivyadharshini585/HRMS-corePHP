import { useState, useEffect, useRef, useCallback } from 'react';
import { DISMISS_DURATIONS } from '../components/common/AlertBanner';

/**
 * useAutoDismiss Hook
 * Automatically resets and dismisses notification state based on type:
 * - Success: 3s
 * - Error: 5s
 * - Warning: 5s
 * - Info: 4s
 */
export function useAutoDismiss(initialState = '', defaultType = 'info') {
  const [state, setState] = useState(initialState);
  const timerRef = useRef(null);

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setState(typeof initialState === 'object' && initialState !== null ? { type: '', text: '' } : '');
  }, [initialState]);

  const setAutoDismissState = useCallback((newState, customTypeOrDuration) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    setState(newState);

    const hasContent = typeof newState === 'object' && newState !== null
      ? Boolean(newState.text || newState.message)
      : Boolean(newState);

    if (!hasContent) {
      return;
    }

    let detectedType = defaultType;
    let duration;

    if (typeof customTypeOrDuration === 'number') {
      duration = customTypeOrDuration;
    } else if (typeof customTypeOrDuration === 'string') {
      detectedType = customTypeOrDuration;
      duration = DISMISS_DURATIONS[detectedType] || 4000;
    } else if (typeof newState === 'object' && newState !== null && newState.type) {
      detectedType = newState.type === 'danger' ? 'error' : newState.type;
      duration = DISMISS_DURATIONS[detectedType] || 4000;
    } else {
      duration = DISMISS_DURATIONS[defaultType] || 4000;
    }

    timerRef.current = setTimeout(() => {
      setState(typeof initialState === 'object' && initialState !== null ? { type: '', text: '' } : '');
      timerRef.current = null;
    }, duration);
  }, [defaultType, initialState]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  return [state, setAutoDismissState, clear];
}

export default useAutoDismiss;
