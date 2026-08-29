import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { api, ApiError } from '@/src/services/api';
import type {
  Analytics,
  AttentionLevel,
  DetectionEvent,
  DeviceState,
  EventDefinition,
  Mode,
  SttEvent,
} from '@/src/types/domain';

/** How often to check for new detections while the app is in the foreground. */
const POLL_INTERVAL_MS = 6_000;

interface AppContextValue {
  modes: Mode[];
  catalog: EventDefinition[];
  activeMode: Mode | null;
  detections: DetectionEvent[];
  stt: SttEvent[];
  device: DeviceState | null;
  analytics: Analytics | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  /** Newest detection that has not been shown as a banner yet. */
  notification: DetectionEvent | null;
  refreshAll: () => Promise<void>;
  refreshStt: () => Promise<void>;
  dismissNotification: () => void;
  selectMode: (modeId: string) => Promise<void>;
  patchEvent: (modeId: string, eventKey: string, patch: Partial<Record<string, unknown>>) => Promise<void>;
  createCustomMode: (
    name: string,
    events: Array<{ eventKey: string; enabled: boolean; attention: AttentionLevel }>,
    description?: string,
  ) => Promise<Mode>;
  renameMode: (modeId: string, name: string) => Promise<void>;
  deleteMode: (modeId: string) => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

const message = (error: unknown, fallback: string) =>
  error instanceof ApiError || error instanceof Error ? error.message : fallback;

export function AppProvider({ children }: React.PropsWithChildren) {
  const [modes, setModes] = useState<Mode[]>([]);
  const [catalog, setCatalog] = useState<EventDefinition[]>([]);
  const [detections, setDetections] = useState<DetectionEvent[]>([]);
  const [stt, setStt] = useState<SttEvent[]>([]);
  const [device, setDevice] = useState<DeviceState | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notification, setNotification] = useState<DetectionEvent | null>(null);

  /** Timestamp of the newest detection already held, so polls fetch only deltas. */
  const sinceRef = useRef<string | null>(null);
  /** Guards against overlapping polls when the network is slow. */
  const pollingRef = useRef(false);

  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    try {
      const [modeResult, detectionResult, sttResult, deviceResult, analyticsResult] = await Promise.all([
        api.getModes(),
        api.getDetections(),
        api.getStt(),
        api.getDevice(),
        api.getAnalytics(),
      ]);
      setModes(modeResult.data.modes);
      setCatalog(modeResult.data.catalog);
      setDetections(detectionResult.data);
      setStt(sttResult.data);
      setDevice(deviceResult.data);
      setAnalytics(analyticsResult.data);
      sinceRef.current = detectionResult.data[0]?.createdAt ?? new Date().toISOString();
      setError(null);
    } catch (e) {
      setError(message(e, 'Unable to connect to the X server'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const refreshStt = useCallback(async () => {
    try {
      const result = await api.getStt();
      setStt(result.data);
    } catch {
      // Non-fatal: the transcript list simply keeps its previous contents.
    }
  }, []);

  /**
   * Background delta poll. Deliberately narrow: it hits one endpoint, and when
   * nothing new arrived it calls no setState at all, so an idle app re-renders
   * zero times per tick. The previous implementation re-fetched five endpoints
   * every 3s and rewrote all of app state each time, which is what made every
   * screen and tab transition feel stalled.
   */
  const syncDetections = useCallback(async () => {
    if (pollingRef.current) return;
    pollingRef.current = true;
    try {
      const since = sinceRef.current ?? undefined;
      const result = await api.getDetections(since);
      const fresh = result.data;
      if (!fresh.length) return;

      sinceRef.current = fresh[0].createdAt;
      setDetections((prev) => {
        const seen = new Set(prev.map((item) => item._id));
        const added = fresh.filter((item) => !seen.has(item._id));
        return added.length ? [...added, ...prev].slice(0, 200) : prev;
      });

      // Only the active mode's own phone-notification switch raises a banner.
      const alertable = fresh.find((item) => item.phoneNotification !== false);
      if (alertable) setNotification(alertable);
    } catch {
      // A failed poll is not worth surfacing; the next tick retries.
    } finally {
      pollingRef.current = false;
    }
  }, []);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  // Poll only while the app is actually in the foreground.
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer) return;
      timer = setInterval(() => void syncDetections(), POLL_INTERVAL_MS);
    };
    const stop = () => {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    };

    if (AppState.currentState === 'active') start();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void syncDetections();
        start();
      } else {
        stop();
      }
    });

    return () => {
      stop();
      subscription.remove();
    };
  }, [syncDetections]);

  const activeMode = useMemo(() => modes.find((mode) => mode.active) ?? null, [modes]);

  const dismissNotification = useCallback(() => setNotification(null), []);

  /**
   * Applied locally first so the UI responds immediately, then reconciled.
   * The rollback snapshot is captured inside the updater rather than closed over,
   * so this callback stays referentially stable across polls instead of rebuilding
   * the context value on every tick.
   */
  const selectMode = useCallback(async (modeId: string) => {
    let previous: Mode[] = [];
    setModes((prev) => {
      previous = prev;
      return prev.map((mode) => ({ ...mode, active: mode._id === modeId }));
    });
    try {
      const result = await api.setActiveMode(modeId);
      setModes((prev) => prev.map((mode) => (mode._id === result.data._id ? result.data : { ...mode, active: false })));
      setError(null);
    } catch (e) {
      setModes(previous);
      setError(message(e, 'Could not switch mode'));
      throw e;
    }
  }, []);

  /**
   * Toggles apply optimistically. Against a remote database a round trip is
   * 150-400ms, and waiting for it made every switch feel broken.
   */
  const patchEvent = useCallback(async (modeId: string, eventKey: string, patch: Record<string, unknown>) => {
    let previous: Mode[] = [];
    setModes((prev) => {
      previous = prev;
      return prev.map((mode) =>
        mode._id !== modeId
          ? mode
          : {
              ...mode,
              eventSettings: mode.eventSettings.map((setting) =>
                setting.eventKey === eventKey ? { ...setting, ...patch } : setting,
              ),
            },
      );
    });

    try {
      const result = await api.patchEvent(modeId, eventKey, patch);
      setModes((prev) => prev.map((mode) => (mode._id === result.data._id ? result.data : mode)));
      setError(null);
    } catch (e) {
      setModes(previous);
      setError(message(e, 'Could not save that change'));
      throw e;
    }
  }, []);

  const createCustomMode = useCallback(
    async (
      name: string,
      events: Array<{ eventKey: string; enabled: boolean; attention: AttentionLevel }>,
      description?: string,
    ) => {
      const result = await api.createCustomMode({ name, description, events });
      setModes((prev) => [...prev, result.data]);
      return result.data;
    },
    [],
  );

  const renameMode = useCallback(async (modeId: string, name: string) => {
    const result = await api.renameMode(modeId, { name });
    setModes((prev) => prev.map((mode) => (mode._id === modeId ? result.data : mode)));
  }, []);

  const deleteMode = useCallback(async (modeId: string) => {
    const result = await api.deleteMode(modeId);
    const fallback = result.data.activeMode;
    setModes((prev) => {
      const remaining = prev.filter((mode) => mode._id !== modeId);
      return fallback ? remaining.map((mode) => ({ ...mode, active: mode._id === fallback._id })) : remaining;
    });
  }, []);

  // Memoised: without this every provider render hands consumers a new object and
  // re-renders every screen in the tree.
  const value = useMemo<AppContextValue>(
    () => ({
      modes,
      catalog,
      activeMode,
      detections,
      stt,
      device,
      analytics,
      loading,
      refreshing,
      error,
      notification,
      refreshAll,
      refreshStt,
      dismissNotification,
      selectMode,
      patchEvent,
      createCustomMode,
      renameMode,
      deleteMode,
    }),
    [
      modes,
      catalog,
      activeMode,
      detections,
      stt,
      device,
      analytics,
      loading,
      refreshing,
      error,
      notification,
      refreshAll,
      refreshStt,
      dismissNotification,
      selectMode,
      patchEvent,
      createCustomMode,
      renameMode,
      deleteMode,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used within AppProvider');
  return value;
}
