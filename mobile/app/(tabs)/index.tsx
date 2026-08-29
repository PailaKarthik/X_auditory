import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { AppShell } from '@/src/components/AppShell';
import { EmptyState } from '@/src/components/EmptyState';
import { EventIcon } from '@/src/components/EventIcon';
import { StatusPill } from '@/src/components/StatusPill';
import { useApp } from '@/src/state/AppContext';
import { DIRECTION_LABELS } from '@/src/utils/constants';
import { styles as base } from '@/src/utils/screenStyles';

function timeLabel(iso: string) {
  const date = new Date(iso);
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export default function HomeScreen() {
  const { detections, activeMode, catalog, device, loading, refreshing, error, refreshAll } = useApp();

  // New detections arrive from the provider's delta poll; this screen no longer
  // re-fetches the whole world on a timer.
  const live = detections[0] ?? null;
  const recent = useMemo(() => detections.slice(0, 5), [detections]);
  const liveDefinition = useMemo(
    () => (live ? catalog.find((entry) => entry.key === live.eventKey) : undefined),
    [catalog, live],
  );
  const enabledCount = activeMode?.eventSettings.filter((setting) => setting.enabled).length ?? 0;

  const openEvent = useCallback((id?: string) => {
    if (id) router.push(`/event/${id}`);
  }, []);

  return (
    <AppShell>
      <ScrollView
        style={base.screen}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshAll} />}
      >
        <View style={base.headerRow}>
          <View>
            <Text style={base.brand}>X</Text>
            <Text style={base.eyebrow}>Auditory Assistance</Text>
          </View>
          <View style={[styles.connection, !!error && styles.connectionBad]}>
            <View style={[styles.connectionDot, !!error && styles.connectionDotBad]} />
            <Text style={[styles.connectionText, !!error && styles.connectionTextBad]}>
              {error ? 'Offline' : device?.connected === false ? 'Disconnected' : 'Connected'}
            </Text>
          </View>
        </View>

        {!!error && (
          <Pressable style={styles.errorCard} onPress={refreshAll}>
            <MaterialCommunityIcons name="alert-circle-outline" size={18} color="#B3403A" />
            <Text style={styles.errorText}>{error} · Tap to retry</Text>
          </Pressable>
        )}

        <View style={styles.modeRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.kicker}>CURRENT MODE</Text>
            <Text style={styles.modeName}>{activeMode?.name ?? (loading ? 'Loading…' : 'None selected')}</Text>
            <Text style={styles.modeMeta}>
              {activeMode ? `${enabledCount} event${enabledCount === 1 ? '' : 's'} monitored` : 'Pick a mode to start'}
            </Text>
          </View>
          <Pressable style={styles.modeButton} onPress={() => router.navigate('/modes')}>
            <Text style={styles.modeButtonText}>Change</Text>
            <MaterialCommunityIcons name="chevron-right" size={18} color="#4B66D6" />
          </Pressable>
        </View>

        <Text style={base.sectionTitle}>Current Activity</Text>
        {live ? (
          <Pressable style={styles.liveCard} onPress={() => openEvent(live._id)}>
            <View style={styles.liveTop}>
              <View style={styles.liveBadge}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>LATEST FROM X</Text>
              </View>
              <StatusPill value={live.attention} />
            </View>
            <View style={styles.liveMain}>
              <EventIcon event={liveDefinition ?? { icon: 'speech' }} size={58} />
              <View style={styles.liveCopy}>
                <Text style={styles.liveLabel}>{liveDefinition?.label ?? live.label}</Text>
                <Text style={styles.liveDirection}>{DIRECTION_LABELS[live.direction] ?? live.direction}</Text>
              </View>
            </View>
            <View style={styles.statGrid}>
              <View>
                <Text style={styles.statLabel}>Confidence</Text>
                <Text style={styles.statValue}>{Math.round(live.confidence * 100)}%</Text>
              </View>
              <View>
                <Text style={styles.statLabel}>Direction</Text>
                <Text style={styles.statValue}>{DIRECTION_LABELS[live.direction] ?? live.direction}</Text>
              </View>
              <View>
                <Text style={styles.statLabel}>Detected</Text>
                <Text style={styles.statValue}>{timeLabel(live.createdAt)}</Text>
              </View>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailText}>View details</Text>
              <MaterialCommunityIcons name="arrow-right" size={17} color="#4B66D6" />
            </View>
          </Pressable>
        ) : (
          <View style={base.card}>
            <EmptyState
              icon="pulse-outline"
              title={loading ? 'Syncing with X…' : 'No sounds detected yet'}
              body={
                loading
                  ? 'Fetching your modes and recent activity.'
                  : 'Send audio to POST /detections/audio, or turn on more events in your active mode.'
              }
            />
          </View>
        )}

        <View style={styles.sectionRow}>
          <Text style={base.sectionTitle}>Recent Activities</Text>
          <Pressable onPress={() => router.navigate('/history')}>
            <Text style={styles.link}>View all</Text>
          </Pressable>
        </View>
        <View style={base.card}>
          {recent.length ? (
            recent.map((item, index) => (
              <Pressable
                key={item._id ?? index}
                style={[styles.activityRow, index !== recent.length - 1 && styles.rowDivider]}
                onPress={() => openEvent(item._id)}
              >
                <EventIcon event={catalog.find((entry) => entry.key === item.eventKey) ?? { icon: 'speech' }} size={38} />
                <View style={styles.activityCopy}>
                  <Text style={styles.activityLabel}>{item.label}</Text>
                  <Text style={styles.activityMeta}>
                    {DIRECTION_LABELS[item.direction] ?? item.direction} · {timeLabel(item.createdAt)}
                  </Text>
                </View>
                <StatusPill value={item.attention} />
                <MaterialCommunityIcons name="chevron-right" size={20} color="#A1A6A2" />
              </Pressable>
            ))
          ) : (
            <Text style={base.muted}>Detections from your enabled events will appear here.</Text>
          )}
        </View>

        <View style={styles.statusStrip}>
          <View>
            <Text style={styles.statusLabel}>X Battery</Text>
            <Text style={styles.statusValue}>{device ? `${device.battery}%` : '—'}</Text>
          </View>
          <View>
            <Text style={styles.statusLabel}>Connection</Text>
            <Text style={styles.statusValue}>{device?.connected === false ? 'Offline' : device ? 'Connected' : '—'}</Text>
          </View>
          <View>
            <Text style={styles.statusLabel}>Device</Text>
            <Text style={styles.statusValue}>{loading ? 'Syncing…' : error ? 'Unreachable' : 'Ready'}</Text>
          </View>
        </View>
      </ScrollView>
    </AppShell>
  );
}

const styles = StyleSheet.create((theme) => ({
  content: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 110 },
  connection: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, backgroundColor: '#EEF7F1', paddingHorizontal: 11, paddingVertical: 7 },
  connectionBad: { backgroundColor: '#FCEDEC' },
  connectionDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: theme.colors.success },
  connectionDotBad: { backgroundColor: theme.colors.critical },
  connectionText: { fontFamily: 'Outfit_600SemiBold', fontSize: 11, color: '#2F7B53' },
  connectionTextBad: { color: '#B3403A' },
  errorCard: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FCEDEC', borderRadius: 14, padding: 12, marginBottom: 16 },
  errorText: { flex: 1, fontFamily: 'Outfit_500Medium', fontSize: 11, color: '#B3403A', lineHeight: 16 },
  modeRow: { backgroundColor: '#EEF1FF', borderRadius: 18, padding: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22, gap: 10 },
  kicker: { fontFamily: 'Outfit_600SemiBold', fontSize: 10, color: '#6C77AB', letterSpacing: 1 },
  modeName: { fontFamily: 'Outfit_700Bold', fontSize: 18, color: theme.colors.text, marginTop: 3 },
  modeMeta: { fontFamily: 'Outfit_400Regular', fontSize: 11, color: '#6C77AB', marginTop: 2 },
  modeButton: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  modeButtonText: { fontFamily: 'Outfit_600SemiBold', fontSize: 13, color: '#4B66D6' },
  liveCard: { backgroundColor: '#FFFFFF', borderRadius: 22, borderWidth: 1, borderColor: '#E5E7E3', padding: 16, marginBottom: 24, shadowColor: theme.colors.shadow, shadowOpacity: 0.07, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 2 },
  liveTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: theme.colors.high },
  liveText: { fontFamily: 'Outfit_600SemiBold', fontSize: 10, color: theme.colors.high, letterSpacing: 0.8 },
  liveMain: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  liveCopy: { flex: 1 },
  liveLabel: { fontFamily: 'Outfit_700Bold', fontSize: 24, color: theme.colors.text, marginBottom: 3 },
  liveDirection: { fontFamily: 'Outfit_500Medium', fontSize: 14, color: theme.colors.textMuted },
  statGrid: { flexDirection: 'row', gap: 14, marginTop: 18, paddingTop: 14, borderTopWidth: 1, borderTopColor: theme.colors.border },
  statLabel: { fontFamily: 'Outfit_400Regular', fontSize: 11, color: theme.colors.textMuted, marginBottom: 2 },
  statValue: { fontFamily: 'Outfit_600SemiBold', fontSize: 14, color: theme.colors.text },
  detailRow: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 5, marginTop: 15 },
  detailText: { fontFamily: 'Outfit_600SemiBold', fontSize: 12, color: '#4B66D6' },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 22 },
  link: { fontFamily: 'Outfit_600SemiBold', fontSize: 12, color: '#4B66D6', marginBottom: 10 },
  activityRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 11 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  activityCopy: { flex: 1 },
  activityLabel: { fontFamily: 'Outfit_600SemiBold', fontSize: 14, color: theme.colors.text },
  activityMeta: { fontFamily: 'Outfit_400Regular', fontSize: 11, color: theme.colors.textMuted, marginTop: 3 },
  statusStrip: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 15, padding: 14, backgroundColor: theme.colors.surfaceMuted, borderRadius: 17 },
  statusLabel: { fontFamily: 'Outfit_400Regular', fontSize: 10, color: theme.colors.textMuted },
  statusValue: { fontFamily: 'Outfit_600SemiBold', fontSize: 12, color: theme.colors.text, marginTop: 2 },
}));
