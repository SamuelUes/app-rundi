import { useCallback, useEffect, useRef, useState } from 'react';

const TRACKING_WINDOW_MS = 550;
const POST_LOAD_WINDOW_MS = 180;

/**
 * react-native-maps markers that render React children need `tracksViewChanges`
 * enabled until the native side snapshots the view. Leaving it enabled forever
 * makes the marker re-rasterize on every frame (flicker/jank on Android and
 * extra work on iOS). This hook keeps tracking on briefly after mount and after
 * every content change, then turns it off so the marker stays frozen.
 */
export function useTracksViewChanges(deps: readonly unknown[] = []): {
  tracksViewChanges: boolean;
  notifyContentRendered: () => void;
} {
  const [tracksViewChanges, setTracksViewChanges] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const signature = deps
    .map((dep) => {
      if (dep == null) return '';
      if (typeof dep === 'object') {
        try {
          return JSON.stringify(dep);
        } catch {
          return String(dep);
        }
      }
      return String(dep);
    })
    .join('|');

  const scheduleDisable = useCallback((delay: number) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => setTracksViewChanges(false), delay);
  }, []);

  const notifyContentRendered = useCallback(() => {
    // Re-enable tracking first: content (e.g. a remote image) may arrive after
    // the initial window already closed, so a bare "disable soon" would leave
    // the frozen snapshot without the new content.
    setTracksViewChanges(true);
    scheduleDisable(POST_LOAD_WINDOW_MS);
  }, [scheduleDisable]);

  useEffect(() => {
    setTracksViewChanges(true);
    scheduleDisable(TRACKING_WINDOW_MS);
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, scheduleDisable]);

  return { tracksViewChanges, notifyContentRendered };
}
