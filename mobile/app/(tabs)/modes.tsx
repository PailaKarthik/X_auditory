import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { AppShell } from '@/src/components/AppShell';
import { useApp } from '@/src/state/AppContext';
import type { Mode } from '@/src/types/domain';
import { styles as base } from '@/src/utils/screenStyles';

const icons: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  environment: 'earth',
  travel: 'car-arrow-left',
  emergency: 'shield-alert-outline',
  home: 'home-heart',
  classroom: 'school-outline',
  public: 'bullhorn-outline',
  conversation: 'microphone-message',
  custom: 'tune-variant',
};

export default function ModesScreen() {
  const { modes, activeMode, selectMode, deleteMode, refreshing, refreshAll } = useApp();
  const [busyId, setBusyId] = useState<string | null>(null);

  // The Conversation mode is a real, activatable mode, not a shortcut, so it is
  // pulled out of the preset grid and given its own card with a live entry point.
  const conversation = useMemo(() => modes.find((mode) => mode.slug === 'conversation') ?? null, [modes]);
  const presets = useMemo(
    () => modes.filter((mode) => mode.kind === 'predefined' && mode.slug !== 'conversation'),
    [modes],
  );
  const customs = useMemo(() => modes.filter((mode) => mode.kind === 'custom'), [modes]);

  const activate = useCallback(
    async (mode: Mode) => {
      if (mode.active) return;
      setBusyId(mode._id);
      try {
        await selectMode(mode._id);
      } catch (error) {
        Alert.alert('Could not switch mode', error instanceof Error ? error.message : 'Try again.');
      } finally {
        setBusyId(null);
      }
    },
    [selectMode],
  );

  const confirmDelete = useCallback(
    (mode: Mode) => {
      Alert.alert('Delete profile', `Delete "${mode.name}"? This cannot be undone.`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await deleteMode(mode._id);
              } catch (error) {
                Alert.alert('Could not delete', error instanceof Error ? error.message : 'Try again.');
              }
            })();
          },
        },
      ]);
    },
    [deleteMode],
  );

  const enabledCount = (mode: Mode) => mode.eventSettings.filter((setting) => setting.enabled).length;

  return (
    <AppShell>
      <ScrollView
        style={base.screen}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshAll} />}
      >
        <View style={base.headerRow}>
          <View>
            <Text style={base.brand}>Modes</Text>
            <Text style={base.eyebrow}>How X responds to your surroundings</Text>
          </View>
        </View>

        <View style={styles.activeBar}>
          <MaterialCommunityIcons name="check-decagram" size={18} color="#2F7B53" />
          <Text style={styles.activeBarText}>
            Active: <Text style={styles.activeBarValue}>{activeMode?.name ?? 'None'}</Text>
            {activeMode ? ` · ${enabledCount(activeMode)} events notify you` : ''}
          </Text>
        </View>

        <Text style={base.sectionTitle}>Presets</Text>
        <Text style={styles.hint}>Tap a mode to make it active. Only its enabled events raise notifications.</Text>
        <View style={styles.grid}>
          {presets.map((mode) => (
            <Pressable
              key={mode._id}
              style={[base.card, styles.modeCard, mode.active && styles.selectedCard]}
              onPress={() => void activate(mode)}
            >
              <View style={styles.cardTop}>
                <View style={[styles.iconCircle, mode.active && styles.iconCircleSelected]}>
                  <MaterialCommunityIcons
                    name={icons[mode.slug] ?? 'tune-variant'}
                    size={21}
                    color={mode.active ? '#FFFFFF' : '#4B66D6'}
                  />
                </View>
                {mode.active && <MaterialCommunityIcons name="check-circle" size={19} color="#35A46B" />}
              </View>
              <Text style={styles.cardTitle}>{mode.name}</Text>
              <Text style={styles.cardBody}>{mode.description}</Text>
              <Text style={styles.enabledText}>
                {busyId === mode._id ? 'Switching…' : `${enabledCount(mode)} events enabled`}
              </Text>
              <Pressable style={styles.configureRow} onPress={() => router.push(`/modes/${mode._id}`)} hitSlop={6}>
                <Text style={styles.configureText}>Configure</Text>
                <MaterialCommunityIcons name="chevron-right" size={15} color="#4B66D6" />
              </Pressable>
            </Pressable>
          ))}
        </View>

        {conversation && (
          <View style={[styles.featureCard, conversation.active && styles.featureCardActive]}>
            <View style={[styles.observeIcon, { backgroundColor: '#F1EEFF' }]}>
              <MaterialCommunityIcons name="microphone-message" size={21} color="#7A63D8" />
            </View>
            <View style={styles.observeCopy}>
              <View style={styles.featureTitleRow}>
                <Text style={styles.observeTitle}>Conversation</Text>
                {conversation.active && (
                  <View style={styles.activeChip}>
                    <Text style={styles.activeChipText}>ACTIVE</Text>
                  </View>
                )}
              </View>
              <Text style={styles.observeBody}>
                Live speech-to-text, with critical alerts still coming through. {enabledCount(conversation)} events enabled.
              </Text>
              <View style={styles.featureActions}>
                {!conversation.active && (
                  <Pressable style={styles.primaryChip} onPress={() => void activate(conversation)}>
                    <Text style={styles.primaryChipText}>
                      {busyId === conversation._id ? 'Activating…' : 'Make active'}
                    </Text>
                  </Pressable>
                )}
                <Pressable style={styles.ghostChip} onPress={() => router.push('/conversation')}>
                  <MaterialCommunityIcons name="waveform" size={14} color="#7A63D8" />
                  <Text style={styles.ghostChipText}>Open live captions</Text>
                </Pressable>
                <Pressable style={styles.ghostChip} onPress={() => router.push(`/modes/${conversation._id}`)}>
                  <Text style={styles.ghostChipText}>Configure</Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}

        <View style={styles.observeCard}>
          <View style={styles.observeIcon}>
            <MaterialCommunityIcons name="radar" size={21} color="#7A63D8" />
          </View>
          <View style={styles.observeCopy}>
            <Text style={styles.observeTitle}>Observe Mode</Text>
            <Text style={styles.observeBody}>Focus on one direction with directional audio processing.</Text>
          </View>
          <Pressable onPress={() => router.push('/observe')} hitSlop={8}>
            <MaterialCommunityIcons name="chevron-right" size={22} color="#7A63D8" />
          </Pressable>
        </View>

        <View style={styles.customHeader}>
          <Text style={base.sectionTitle}>Custom profiles</Text>
          <Pressable onPress={() => router.push('/custom/create')} hitSlop={8}>
            <Text style={styles.createLink}>+ Create</Text>
          </Pressable>
        </View>
        <View style={base.card}>
          {customs.length === 0 ? (
            <Text style={base.muted}>
              Create your first profile with your own event toggles and attention levels.
            </Text>
          ) : (
            customs.map((mode, index) => (
              <Pressable
                key={mode._id}
                style={[styles.profileRow, index < customs.length - 1 && styles.rowDivider]}
                onPress={() => void activate(mode)}
              >
                <View style={[styles.profileIcon, mode.active && styles.iconCircleSelected]}>
                  <MaterialCommunityIcons
                    name="tune-variant"
                    size={19}
                    color={mode.active ? '#FFFFFF' : '#4B66D6'}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.featureTitleRow}>
                    <Text style={styles.cardTitle}>{mode.name}</Text>
                    {mode.active && (
                      <View style={styles.activeChip}>
                        <Text style={styles.activeChipText}>ACTIVE</Text>
                      </View>
                    )}
                  </View>
                  <Text style={base.muted}>
                    {busyId === mode._id ? 'Switching…' : `${enabledCount(mode)} events enabled`}
                  </Text>
                </View>
                <Pressable onPress={() => router.push(`/modes/${mode._id}`)} hitSlop={8} style={styles.rowAction}>
                  <MaterialCommunityIcons name="cog-outline" size={19} color="#6B7280" />
                </Pressable>
                <Pressable onPress={() => confirmDelete(mode)} hitSlop={8} style={styles.rowAction}>
                  <MaterialCommunityIcons name="trash-can-outline" size={19} color="#C2544D" />
                </Pressable>
              </Pressable>
            ))
          )}
        </View>
      </ScrollView>
    </AppShell>
  );
}

const styles = StyleSheet.create((theme) => ({
  content: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 110 },
  activeBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#EEF7F1', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 20 },
  activeBarText: { flex: 1, fontFamily: 'Outfit_400Regular', fontSize: 11, color: '#2F7B53', lineHeight: 16 },
  activeBarValue: { fontFamily: 'Outfit_700Bold' },
  hint: { fontFamily: 'Outfit_400Regular', fontSize: 11, color: theme.colors.textMuted, marginBottom: 12, marginTop: -4, lineHeight: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  modeCard: { width: '48%' },
  selectedCard: { borderColor: '#4B66D6', borderWidth: 2 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  iconCircle: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#EEF1FF', alignItems: 'center', justifyContent: 'center' },
  iconCircleSelected: { backgroundColor: '#4B66D6' },
  cardTitle: { fontFamily: 'Outfit_600SemiBold', fontSize: 15, color: theme.colors.text },
  cardBody: { fontFamily: 'Outfit_400Regular', fontSize: 11, color: theme.colors.textMuted, marginTop: 4, lineHeight: 17 },
  enabledText: { fontFamily: 'Outfit_600SemiBold', fontSize: 10, color: '#5E6FD5', marginTop: 10 },
  configureRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 10, paddingTop: 9, borderTopWidth: 1, borderTopColor: theme.colors.border },
  configureText: { fontFamily: 'Outfit_600SemiBold', fontSize: 11, color: '#4B66D6' },
  featureCard: { marginTop: 14, flexDirection: 'row', backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1, borderColor: theme.colors.border, padding: 14, gap: 12 },
  featureCardActive: { borderColor: '#7A63D8', borderWidth: 2 },
  featureTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  featureActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 11 },
  primaryChip: { backgroundColor: '#7A63D8', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  primaryChipText: { fontFamily: 'Outfit_600SemiBold', fontSize: 11, color: '#FFFFFF' },
  ghostChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: '#E3DBFF', backgroundColor: '#F7F4FF', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  ghostChipText: { fontFamily: 'Outfit_600SemiBold', fontSize: 11, color: '#6B5BA9' },
  activeChip: { backgroundColor: '#EEF7F1', borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3 },
  activeChipText: { fontFamily: 'Outfit_700Bold', fontSize: 8, color: '#2F7B53', letterSpacing: 0.6 },
  observeCard: { marginTop: 14, flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1, borderColor: theme.colors.border, padding: 14, gap: 12 },
  observeIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#F1EEFF', alignItems: 'center', justifyContent: 'center' },
  observeCopy: { flex: 1 },
  observeTitle: { fontFamily: 'Outfit_600SemiBold', fontSize: 14, color: theme.colors.text },
  observeBody: { fontFamily: 'Outfit_400Regular', fontSize: 11, color: theme.colors.textMuted, marginTop: 3, lineHeight: 16 },
  customHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 24 },
  createLink: { fontFamily: 'Outfit_600SemiBold', fontSize: 13, color: '#4B66D6', marginBottom: 10 },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  profileIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: '#EEF1FF', alignItems: 'center', justifyContent: 'center' },
  rowAction: { padding: 4 },
}));
