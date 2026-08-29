import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
  type ExpoSpeechRecognitionOptions,
} from 'expo-speech-recognition';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { AppShell } from '@/src/components/AppShell';
import { api } from '@/src/services/api';
import { useApp } from '@/src/state/AppContext';
import { styles as base } from '@/src/utils/screenStyles';

type Status = 'idle' | 'starting' | 'listening';

/** One finalised utterance. The conversation is a list of these, so there is no cap. */
type Turn = {
  id: string;
  text: string;
  confidence: number | null;
  at: number;
  /** Background sync to /stt. Never blocks captioning. */
  sync: 'pending' | 'saved' | 'failed';
};

const LANGUAGES = [
  { code: 'en-US', label: 'English' },
  { code: 'en-IN', label: 'English (IN)' },
  { code: 'hi-IN', label: 'हिन्दी' },
  { code: 'te-IN', label: 'తెలుగు' },
  { code: 'ta-IN', label: 'தமிழ்' },
  { code: 'es-ES', label: 'Español' },
];

/**
 * Errors the recogniser raises during normal use. Android ends a session on every
 * pause and reports it as an error, so treating these as fatal is what makes
 * dictation die after one or two phrases. They are recovered from silently.
 */
const TRANSIENT_ERRORS = new Set([
  'no-speech',
  'speech-timeout',
  'aborted',
  'busy',
  'client',
  'nomatch',
  'unknown',
]);

/** Errors that mean retrying with the same configuration cannot succeed. */
const FATAL_ERRORS = new Set(['not-allowed', 'audio-capture', 'language-not-supported']);

export default function ConversationScreen() {
  const { modes, activeMode, selectMode, stt, refreshStt } = useApp();

  const [status, setStatus] = useState<Status>('idle');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [interim, setInterim] = useState('');
  const [lang, setLang] = useState('en-US');
  const [level, setLevel] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);

  /** Callbacks close over their creation scope, so live values are kept in refs. */
  const wantRef = useRef(false);
  /** True between `start` and `end`; start() while true raises "busy". */
  const sessionRef = useRef(false);
  const langRef = useRef(lang);
  const restartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const beginRef = useRef<() => void>(() => {});
  /** Backs off restarts so a failing engine cannot spin. Reset by any result. */
  const failures = useRef(0);
  /** Set after the networked recogniser fails; switches to the on-device one. */
  const onDeviceRef = useRef(false);
  const lastTurn = useRef<{ text: string; at: number }>({ text: '', at: 0 });
  const mounted = useRef(true);

  const conversationMode = useMemo(() => modes.find((mode) => mode.slug === 'conversation') ?? null, [modes]);
  const isConversationActive = activeMode?.slug === 'conversation';

  useEffect(() => {
    void refreshStt();
  }, [refreshStt]);

  useEffect(() => {
    langRef.current = lang;
  }, [lang]);

  const buildOptions = useCallback(
    (): ExpoSpeechRecognitionOptions => ({
      lang: langRef.current,
      interimResults: true,
      continuous: true,
      maxAlternatives: 1,
      addsPunctuation: true,
      // The fallback path pins the on-device recogniser, which is the one that
      // works when the networked service is unreachable (emulators especially).
      requiresOnDeviceRecognition: onDeviceRef.current,
      ...(Platform.OS === 'android' && onDeviceRef.current
        ? { androidRecognitionServicePackage: 'com.google.android.as' }
        : null),
      volumeChangeEventOptions: { enabled: true, intervalMillis: 300 },
    }),
    [],
  );

  /** Restarts after a pause or a recoverable error, with a widening delay. */
  const scheduleRestart = useCallback(() => {
    if (restartTimer.current) clearTimeout(restartTimer.current);
    if (!wantRef.current) return;
    const delay = Math.min(250 * 2 ** failures.current, 2000);
    restartTimer.current = setTimeout(() => {
      restartTimer.current = null;
      beginRef.current();
    }, delay);
  }, []);

  const beginSession = useCallback(() => {
    if (!wantRef.current || sessionRef.current) return;
    try {
      ExpoSpeechRecognitionModule.start(buildOptions());
    } catch {
      // The previous session is still tearing down; back off and try again.
      failures.current += 1;
      scheduleRestart();
    }
  }, [buildOptions, scheduleRestart]);

  // Lets scheduleRestart reach the latest beginSession without the two
  // callbacks depending on each other.
  useEffect(() => {
    beginRef.current = beginSession;
  }, [beginSession]);

  const stopEverything = useCallback((next: Status = 'idle') => {
    wantRef.current = false;
    if (restartTimer.current) {
      clearTimeout(restartTimer.current);
      restartTimer.current = null;
    }
    try {
      ExpoSpeechRecognitionModule.abort();
    } catch {
      // Nothing was running.
    }
    sessionRef.current = false;
    setStatus(next);
    setInterim('');
    setLevel(0);
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stopEverything();
    };
  }, [stopEverything]);

  /** Appends a turn and syncs it to history without blocking the next utterance. */
  const commit = useCallback(
    (text: string, confidence: number) => {
      const now = Date.now();
      // The engine can repeat a final result when a session is restarted.
      if (text === lastTurn.current.text && now - lastTurn.current.at < 1500) return;
      lastTurn.current = { text, at: now };

      const id = `${now}-${Math.random().toString(36).slice(2, 8)}`;
      const score = typeof confidence === 'number' && confidence > 0 ? confidence : null;
      setTurns((prev) => [...prev, { id, text, confidence: score, at: now, sync: 'pending' }]);

      void api
        .saveStt({
          transcript: text,
          direction: 'unknown',
          confidence: score ?? undefined,
          mode: conversationMode?.name ?? 'Conversation',
        })
        .then(() => {
          if (mounted.current) setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, sync: 'saved' } : t)));
        })
        .catch(() => {
          // The server being down must never interrupt live captions.
          if (mounted.current) setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, sync: 'failed' } : t)));
        });
    },
    [conversationMode],
  );

  useSpeechRecognitionEvent('start', () => {
    sessionRef.current = true;
    setStatus('listening');
  });

  useSpeechRecognitionEvent('end', () => {
    sessionRef.current = false;
    setLevel(0);
    if (wantRef.current) {
      // Android closes the session on every silence gap. Reopening it is what
      // turns one phrase into an unbroken conversation.
      setStatus('starting');
      scheduleRestart();
    } else {
      setStatus('idle');
      setInterim('');
    }
  });

  useSpeechRecognitionEvent('speechstart', () => {
    failures.current = 0;
  });

  useSpeechRecognitionEvent('result', (event) => {
    const result = event.results?.[0];
    if (!result) return;
    const text = (result.transcript ?? '').trim();
    failures.current = 0;

    if (event.isFinal) {
      setInterim('');
      if (text) commit(text, result.confidence);
    } else {
      setInterim(text);
    }
  });

  useSpeechRecognitionEvent('volumechange', (event) => {
    // Reported in dB, roughly -2 (silence) to 10 (loud).
    const next = Math.max(0, Math.min(1, (event.value + 2) / 12));
    setLevel((prev) => (Math.abs(prev - next) > 0.06 ? next : prev));
  });

  useSpeechRecognitionEvent('error', (event) => {
    const code = event.error;

    if (TRANSIENT_ERRORS.has(code)) {
      failures.current += 1;
      return; // `end` fires next and drives the restart.
    }

    if (code === 'network' || code === 'service-not-allowed') {
      failures.current += 1;
      if (!onDeviceRef.current && Platform.OS === 'android') {
        // The networked recogniser is unavailable. Switch to on-device and keep
        // going rather than handing the user a dead screen.
        onDeviceRef.current = true;
        setNotice('Switched to on-device recognition.');
        return;
      }
      if (failures.current > 4) {
        stopEverything();
        setFatal(
          code === 'network'
            ? 'The speech recogniser could not be reached. Check the connection and try again.'
            : 'No speech recognition service is available on this device.',
        );
      }
      return;
    }

    if (FATAL_ERRORS.has(code)) {
      stopEverything();
      setFatal(
        code === 'not-allowed'
          ? 'Microphone access was denied. Enable it for this app in Settings, then try again.'
          : code === 'language-not-supported'
            ? `${LANGUAGES.find((l) => l.code === langRef.current)?.label ?? langRef.current} is not installed on this device. Pick another language.`
            : 'The microphone could not be opened. Close other apps using it and try again.',
      );
      return;
    }

    failures.current += 1;
  });

  const start = useCallback(async () => {
    setFatal(null);
    setNotice(null);
    failures.current = 0;

    try {
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) {
        setFatal(
          permission.canAskAgain
            ? 'Microphone access is needed for live captions.'
            : 'Microphone access was denied. Enable it for this app in Settings, then try again.',
        );
        return;
      }
    } catch {
      setFatal('Could not request microphone access on this device.');
      return;
    }

    if (!mounted.current) return;
    wantRef.current = true;
    setStatus('starting');
    beginSession();
  }, [beginSession]);

  const toggle = useCallback(() => {
    if (wantRef.current) {
      // Flush whatever is still in flight, then close the session for good.
      wantRef.current = false;
      if (restartTimer.current) {
        clearTimeout(restartTimer.current);
        restartTimer.current = null;
      }
      try {
        ExpoSpeechRecognitionModule.stop();
      } catch {
        stopEverything();
      }
      setStatus('idle');
      return;
    }
    void start();
  }, [start, stopEverything]);

  const pickLanguage = useCallback(
    (code: string) => {
      if (code === lang) return;
      setLang(code);
      langRef.current = code;
      setFatal(null);
      if (wantRef.current) {
        // Restart into the new language; `end` picks the session back up.
        try {
          ExpoSpeechRecognitionModule.abort();
        } catch {
          scheduleRestart();
        }
      }
    },
    [lang, scheduleRestart],
  );

  const clear = useCallback(() => {
    setTurns([]);
    setInterim('');
    lastTurn.current = { text: '', at: 0 };
    void refreshStt();
  }, [refreshStt]);

  const activate = useCallback(async () => {
    if (!conversationMode) return;
    try {
      await selectMode(conversationMode._id);
    } catch (error) {
      Alert.alert('Could not switch mode', error instanceof Error ? error.message : 'Try again.');
    }
  }, [conversationMode, selectMode]);

  const listening = status === 'listening' || status === 'starting';
  const unsynced = turns.filter((turn) => turn.sync === 'failed').length;

  return (
    <AppShell>
      <ScrollView style={base.screen} contentContainerStyle={styles.content}>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <MaterialCommunityIcons name="arrow-left" size={20} color="#4B66D6" />
          <Text style={styles.backText}>Modes</Text>
        </Pressable>

        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={base.title}>Conversation</Text>
            <Text style={[base.muted, { marginTop: 5 }]}>Live speech to text</Text>
          </View>
          <View style={styles.livePill}>
            <View style={[styles.dot, { backgroundColor: listening ? '#7A63D8' : '#A4A8A5' }]} />
            <Text style={styles.liveText}>
              {status === 'starting' ? 'Starting' : status === 'listening' ? 'Listening' : 'Ready'}
            </Text>
          </View>
        </View>

        {conversationMode && !isConversationActive && (
          <Pressable style={styles.activateBanner} onPress={() => void activate()}>
            <MaterialCommunityIcons name="information-outline" size={17} color="#6B5BA9" />
            <Text style={styles.activateText}>
              Conversation is not your active mode. Tap to activate it so speech alerts come through.
            </Text>
          </Pressable>
        )}
        {isConversationActive && (
          <View style={[styles.activateBanner, styles.activeBanner]}>
            <MaterialCommunityIcons name="check-decagram" size={17} color="#2F7B53" />
            <Text style={[styles.activateText, { color: '#2F7B53' }]}>
              Conversation mode is active · {conversationMode?.eventSettings.filter((s) => s.enabled).length ?? 0} events
              still monitored
            </Text>
          </View>
        )}

        <View style={base.card}>
          <View style={styles.micRow}>
            <View style={[styles.micCircle, listening && styles.micCircleLive]}>
              <MaterialCommunityIcons name="microphone" size={29} color={listening ? '#FFFFFF' : '#7A63D8'} />
            </View>
            <View style={styles.levelWrap}>
              {Array.from({ length: 5 }).map((_, index) => (
                <View
                  key={index}
                  style={[styles.levelBar, listening && level > index / 5 && styles.levelBarOn]}
                />
              ))}
            </View>
          </View>

          <Text style={styles.captionTitle}>Live speech recognition</Text>
          <Text style={base.muted}>
            Speak naturally. Each phrase becomes its own message and the session reopens itself through pauses, so a
            long conversation stays unbroken.
          </Text>

          <Text style={styles.fieldLabel}>Language</Text>
          <View style={styles.langRow}>
            {LANGUAGES.map((item) => (
              <Pressable
                key={item.code}
                onPress={() => pickLanguage(item.code)}
                style={[styles.langChip, lang === item.code && styles.langChipOn]}
              >
                <Text style={[styles.langText, lang === item.code && styles.langTextOn]}>{item.label}</Text>
              </Pressable>
            ))}
          </View>

          {!!notice && <Text style={styles.noticeText}>{notice}</Text>}
          {!!fatal && <Text style={styles.errorText}>{fatal}</Text>}

          <Pressable onPress={toggle} style={[styles.mainButton, listening && styles.stopButton]}>
            <MaterialCommunityIcons name={listening ? 'stop' : 'microphone'} size={18} color="#FFFFFF" />
            <Text style={styles.mainButtonText}>{listening ? 'Stop recording' : 'Start recording'}</Text>
          </Pressable>
        </View>

        <View style={styles.sectionRow}>
          <Text style={base.sectionTitle}>
            Live Captions{turns.length ? ` · ${turns.length} message${turns.length === 1 ? '' : 's'}` : ''}
          </Text>
          {turns.length > 0 && (
            <Pressable onPress={clear} hitSlop={8}>
              <Text style={styles.clearLink}>Clear</Text>
            </Pressable>
          )}
        </View>

        <View style={[base.card, styles.captionCard]}>
          {turns.length === 0 && !interim ? (
            <Text style={base.muted}>Your speech will appear here…</Text>
          ) : (
            <>
              {turns.map((turn, index) => (
                <View key={turn.id} style={[styles.turn, index > 0 && styles.turnSpacing]}>
                  <View style={styles.turnBubble}>
                    <Text style={styles.turnText}>{turn.text}</Text>
                  </View>
                  <Text style={styles.turnMeta}>
                    {new Date(turn.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                    {turn.confidence !== null ? ` · ${Math.round(turn.confidence * 100)}%` : ''}
                    {turn.sync === 'failed' ? ' · not synced' : turn.sync === 'saved' ? ' · saved' : ' · saving…'}
                  </Text>
                </View>
              ))}
              {!!interim && (
                <View style={[styles.turn, turns.length > 0 && styles.turnSpacing]}>
                  <View style={[styles.turnBubble, styles.interimBubble]}>
                    <Text style={[styles.turnText, styles.interimText]}>{interim}</Text>
                  </View>
                </View>
              )}
            </>
          )}
          {unsynced > 0 && (
            <Text style={styles.meta}>
              {unsynced} message{unsynced === 1 ? '' : 's'} could not reach the server. The captions above are intact.
            </Text>
          )}
        </View>

        <Text style={[base.sectionTitle, { marginTop: 22 }]}>Saved transcripts</Text>
        <View style={base.card}>
          {stt.length ? (
            stt.slice(0, 8).map((item, index) => (
              <View key={item._id ?? index} style={[styles.savedRow, index < Math.min(stt.length, 8) - 1 && styles.divider]}>
                <Text style={styles.savedText} numberOfLines={3}>
                  {item.transcript}
                </Text>
                <Text style={styles.savedMeta}>
                  {new Date(item.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  {typeof item.confidence === 'number' ? ` · ${Math.round(item.confidence * 100)}%` : ''}
                </Text>
              </View>
            ))
          ) : (
            <Text style={base.muted}>Nothing saved yet.</Text>
          )}
        </View>
      </ScrollView>
    </AppShell>
  );
}

const styles = StyleSheet.create((theme) => ({
  content: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 110 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 },
  backText: { fontFamily: 'Outfit_600SemiBold', fontSize: 13, color: '#4B66D6' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 16 },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F1EEFF', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  liveText: { fontFamily: 'Outfit_600SemiBold', fontSize: 10, color: '#6B5BA9' },
  activateBanner: { flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: '#F1EEFF', borderRadius: 14, padding: 12, marginBottom: 16 },
  activeBanner: { backgroundColor: '#EEF7F1' },
  activateText: { flex: 1, fontFamily: 'Outfit_500Medium', fontSize: 11, color: '#655A95', lineHeight: 16 },
  micRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 14 },
  micCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#F1EEFF', alignItems: 'center', justifyContent: 'center' },
  micCircleLive: { backgroundColor: '#7A63D8' },
  levelWrap: { flexDirection: 'row', alignItems: 'flex-end', gap: 5, height: 30 },
  levelBar: { width: 5, height: 10, borderRadius: 3, backgroundColor: '#E7E4F4' },
  levelBarOn: { height: 26, backgroundColor: '#7A63D8' },
  captionTitle: { fontFamily: 'Outfit_700Bold', fontSize: 19, color: theme.colors.text, marginBottom: 4 },
  fieldLabel: { fontFamily: 'Outfit_600SemiBold', fontSize: 11, color: theme.colors.textMuted, marginTop: 16, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.6 },
  langRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  langChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  langChipOn: { backgroundColor: '#F1EEFF', borderColor: '#7A63D8' },
  langText: { fontFamily: 'Outfit_500Medium', fontSize: 11, color: theme.colors.textMuted },
  langTextOn: { color: '#6B5BA9', fontFamily: 'Outfit_600SemiBold' },
  noticeText: { fontFamily: 'Outfit_500Medium', fontSize: 11, color: '#6B5BA9', marginTop: 12, lineHeight: 16 },
  errorText: { fontFamily: 'Outfit_500Medium', fontSize: 11, color: '#B3403A', marginTop: 12, lineHeight: 16 },
  mainButton: { marginTop: 18, height: 48, borderRadius: 15, backgroundColor: '#7A63D8', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  stopButton: { backgroundColor: '#E4524B' },
  mainButtonText: { fontFamily: 'Outfit_700Bold', fontSize: 13, color: '#FFFFFF' },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 22 },
  captionCard: { minHeight: 140 },
  turn: { alignItems: 'flex-start' },
  turnSpacing: { marginTop: 12 },
  turnBubble: { backgroundColor: '#F5F3FD', borderRadius: 16, borderTopLeftRadius: 5, paddingHorizontal: 13, paddingVertical: 10 },
  interimBubble: { backgroundColor: theme.colors.surface, borderWidth: 1, borderStyle: 'dashed', borderColor: '#C9C0EA' },
  turnText: { fontFamily: 'Outfit_600SemiBold', fontSize: 16, lineHeight: 24, color: theme.colors.text },
  interimText: { fontFamily: 'Outfit_400Regular', color: theme.colors.textMuted },
  turnMeta: { fontFamily: 'Outfit_400Regular', fontSize: 9, color: theme.colors.textMuted, marginTop: 4, marginLeft: 4 },
  meta: { fontFamily: 'Outfit_400Regular', fontSize: 10, color: theme.colors.textMuted, marginTop: 14 },
  clearLink: { fontFamily: 'Outfit_600SemiBold', fontSize: 11, color: theme.colors.textMuted },
  savedRow: { paddingVertical: 11 },
  divider: { borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  savedText: { fontFamily: 'Outfit_500Medium', fontSize: 13, color: theme.colors.text, lineHeight: 19 },
  savedMeta: { fontFamily: 'Outfit_400Regular', fontSize: 10, color: theme.colors.textMuted, marginTop: 5 },
}));
