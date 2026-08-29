import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { ScrollView, Text, View, Pressable, RefreshControl } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { AppShell } from '@/src/components/AppShell';
import { useApp } from '@/src/state/AppContext';
import { COLORS } from '@/src/utils/constants';
import { styles as base } from '@/src/utils/screenStyles';

/** Three-hour buckets across the day, labelled by their start hour. */
const BUCKET_HOURS = [0, 3, 6, 9, 12, 15, 18, 21];
const CHART_HEIGHT = 125;

export default function AnalyticsScreen() {
  const { analytics, detections, refreshing, refreshAll } = useApp();

  // Built from the detections already in memory rather than a fixed array, so the
  // chart reflects real activity instead of a decorative placeholder.
  const buckets = useMemo(() => {
    const counts = new Array(BUCKET_HOURS.length).fill(0) as number[];
    for (const detection of detections) {
      const hour = new Date(detection.createdAt).getHours();
      const index = Math.min(Math.floor(hour / 3), BUCKET_HOURS.length - 1);
      counts[index] += 1;
    }
    return counts;
  }, [detections]);

  const peak = Math.max(...buckets, 1);
  const hasActivity = buckets.some((count) => count > 0);
  const topEvents = analytics?.topEvents ?? [];
  const maxEventCount = Math.max(...topEvents.map((entry) => entry.count), 1);

  return (
    <AppShell>
      <ScrollView
        style={base.screen}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshAll} />}
      >
        <Pressable onPress={() => router.back()} style={styles.back}>
          <MaterialCommunityIcons name="arrow-left" size={20} color="#4B66D6" />
          <Text style={styles.backText}>Device</Text>
        </Pressable>
        <Text style={base.title}>Analytics</Text>
        <Text style={[base.muted, { marginTop: 5, marginBottom: 22 }]}>Your auditory activity</Text>

        <View style={styles.metrics}>
          <Metric value={String(analytics?.total ?? 0)} label="All events" />
          <Metric value={String(analytics?.today ?? 0)} label="Today" />
          <Metric value={String(analytics?.critical ?? 0)} label="Critical" />
        </View>

        <Text style={base.sectionTitle}>Events by time of day</Text>
        <View style={base.card}>
          {hasActivity ? (
            <>
              <View style={styles.chart}>
                {buckets.map((count, index) => (
                  <View key={BUCKET_HOURS[index]} style={styles.barWrap}>
                    <Text style={styles.barCount}>{count > 0 ? count : ''}</Text>
                    <View
                      style={[
                        styles.bar,
                        { height: Math.max(count > 0 ? 6 : 2, (count / peak) * (CHART_HEIGHT - 24)) },
                        count === 0 && styles.barEmpty,
                      ]}
                    />
                    <Text style={styles.axis}>{String(BUCKET_HOURS[index]).padStart(2, '0')}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.chartNote}>
                Based on the {detections.length} most recent detection{detections.length === 1 ? '' : 's'}.
              </Text>
            </>
          ) : (
            <Text style={base.muted}>No detections recorded yet, so there is nothing to chart.</Text>
          )}
        </View>

        <Text style={[base.sectionTitle, { marginTop: 22 }]}>Most detected</Text>
        <View style={base.card}>
          {topEvents.length ? (
            topEvents.map((entry, index) => (
              <View key={entry.label} style={[styles.eventRow, index < topEvents.length - 1 && styles.divider]}>
                <Text style={styles.eventLabel} numberOfLines={1}>
                  {entry.label}
                </Text>
                <View style={styles.eventTrack}>
                  <View style={[styles.eventFill, { width: `${(entry.count / maxEventCount) * 100}%` }]} />
                </View>
                <Text style={styles.eventCount}>{entry.count}</Text>
              </View>
            ))
          ) : (
            <Text style={base.muted}>Nothing detected yet.</Text>
          )}
        </View>

        <Text style={[base.sectionTitle, { marginTop: 22 }]}>Mode usage</Text>
        <View style={base.card}>
          {analytics?.modeUsage?.length ? (
            analytics.modeUsage.map(([name, count], index) => (
              <View key={`${name}-${index}`} style={[styles.eventRow, index < analytics.modeUsage.length - 1 && styles.divider]}>
                <Text style={styles.eventLabel} numberOfLines={1}>
                  {name}
                </Text>
                <Text style={styles.eventCount}>{count}</Text>
              </View>
            ))
          ) : (
            <Text style={base.muted}>No mode activity recorded yet.</Text>
          )}
        </View>
      </ScrollView>
    </AppShell>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.metric}>
      <Text numberOfLines={1} style={styles.metricValue}>
        {value}
      </Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  content: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 110 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 },
  backText: { fontFamily: 'Outfit_600SemiBold', fontSize: 13, color: '#4B66D6' },
  metrics: { flexDirection: 'row', gap: 9, marginBottom: 24 },
  metric: { flex: 1, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: theme.colors.border, borderRadius: 18, padding: 13 },
  metricValue: { fontFamily: 'Outfit_700Bold', fontSize: 22, color: theme.colors.text },
  metricLabel: { fontFamily: 'Outfit_400Regular', fontSize: 10, color: theme.colors.textMuted, marginTop: 5 },
  chart: { height: CHART_HEIGHT + 20, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingTop: 8 },
  barWrap: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  barCount: { fontFamily: 'Outfit_600SemiBold', fontSize: 9, color: theme.colors.textMuted, height: 12 },
  bar: { width: 18, borderRadius: 6, backgroundColor: '#91A2EA' },
  barEmpty: { backgroundColor: '#E4E6E2' },
  axis: { fontFamily: 'Outfit_400Regular', fontSize: 9, color: theme.colors.textMuted },
  chartNote: { fontFamily: 'Outfit_400Regular', fontSize: 10, color: theme.colors.textMuted, marginTop: 12 },
  eventRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11 },
  divider: { borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  eventLabel: { fontFamily: 'Outfit_500Medium', fontSize: 12, color: theme.colors.text, flex: 1 },
  eventTrack: { width: 90, height: 7, borderRadius: 4, backgroundColor: '#EEF0ED', overflow: 'hidden' },
  eventFill: { height: '100%', borderRadius: 4, backgroundColor: COLORS.low },
  eventCount: { fontFamily: 'Outfit_700Bold', fontSize: 12, color: theme.colors.text, minWidth: 22, textAlign: 'right' },
}));
