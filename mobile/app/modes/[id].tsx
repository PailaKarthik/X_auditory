import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { AppShell } from '@/src/components/AppShell';
import { EventIcon } from '@/src/components/EventIcon';
import { Toggle } from '@/src/components/Toggle';
import { StatusPill } from '@/src/components/StatusPill';
import { useApp } from '@/src/state/AppContext';
import type { AttentionLevel } from '@/src/types/domain';
import { styles as base } from '@/src/utils/screenStyles';

const levels: AttentionLevel[] = ['critical', 'high', 'medium', 'low'];

export default function ModeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { modes, catalog, patchEvent } = useApp();
  const mode = modes.find((m) => m._id === id);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => { if (!mode) router.replace('/modes'); }, [mode]);
  const settings = useMemo(() => mode?.eventSettings ?? [], [mode]);
  if (!mode) return null;

  return <AppShell><ScrollView style={base.screen} contentContainerStyle={styles.content}><Pressable onPress={() => router.back()} style={styles.back}><MaterialCommunityIcons name="arrow-left" size={20} color="#4B66D6"/><Text style={styles.backText}>Modes</Text></Pressable>
    <View style={styles.header}><View><Text style={base.title}>{mode.name}</Text><Text style={[base.muted, { marginTop: 5 }]}>{mode.description}</Text></View>{mode.active && <View style={styles.activeBadge}><View style={styles.activeDot}/><Text style={styles.activeText}>ACTIVE</Text></View>}</View>
    <Text style={base.sectionTitle}>Sound Events</Text>
    <View style={base.card}>{settings.map((setting, index) => { const event = catalog.find((e) => e.key === setting.eventKey); const open = expanded === setting.eventKey; return <View key={setting.eventKey} style={[styles.eventRow, index !== settings.length - 1 && styles.divider]}>
      <View style={styles.eventMain}><EventIcon event={event ?? { icon: 'speech' }} size={42}/><View style={styles.eventCopy}><Text style={styles.eventTitle}>{event?.label ?? setting.eventKey}</Text><Text style={styles.modelLabel} numberOfLines={1}>Model label · {event?.modelLabel ?? setting.eventKey}</Text><View style={styles.eventMeta}><StatusPill value={setting.attention}/>{setting.enabled ? <Text style={styles.enabled}>Monitored</Text> : <Text style={styles.disabled}>Off</Text>}</View></View><Toggle value={setting.enabled} onChange={(next) => void patchEvent(mode._id, setting.eventKey, { enabled: next })}/></View>
      <Pressable style={styles.expandRow} onPress={() => setExpanded(open ? null : setting.eventKey)}><Text style={styles.expandText}>Attention & notification</Text><MaterialCommunityIcons name={open ? 'chevron-up' : 'chevron-down'} size={18} color="#8D928E"/></Pressable>
      {open && <View style={styles.detailBox}><Text style={styles.detailLabel}>Attention level</Text><View style={styles.levelRow}>{levels.map((level) => <Pressable key={level} onPress={() => void patchEvent(mode._id, setting.eventKey, { attention: level })} style={[styles.levelChip, setting.attention === level && styles.levelChipSelected]}><Text style={[styles.levelChipText, setting.attention === level && styles.levelChipSelectedText]}>{level}</Text></Pressable>)}</View><Text style={styles.detailLabel}>Delivery</Text><View style={styles.switchLine}><Text style={styles.switchText}>X light</Text><Toggle value={setting.xLight} onChange={(next) => void patchEvent(mode._id, setting.eventKey, { xLight: next })}/></View><View style={styles.switchLine}><Text style={styles.switchText}>X vibration</Text><Toggle value={setting.vibration} onChange={(next) => void patchEvent(mode._id, setting.eventKey, { vibration: next })}/></View><View style={styles.switchLine}><Text style={styles.switchText}>Phone notification</Text><Toggle value={setting.phoneNotification} onChange={(next) => void patchEvent(mode._id, setting.eventKey, { phoneNotification: next })}/></View><View style={styles.switchLine}><Text style={styles.switchText}>STT</Text><Toggle value={setting.stt} onChange={(next) => void patchEvent(mode._id, setting.eventKey, { stt: next })}/></View></View>}
    </View>})}</View>
  </ScrollView></AppShell>;
}

const styles = StyleSheet.create((theme) => ({
  content: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 110 }, back: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 }, backText: { fontFamily: 'Outfit_600SemiBold', fontSize: 13, color: '#4B66D6' }, header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 }, activeBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#EEF7F1', paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999 }, activeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.colors.success }, activeText: { fontFamily: 'Outfit_600SemiBold', fontSize: 9, color: '#2F7B53', letterSpacing: 0.6 }, eventRow: { paddingVertical: 13 }, divider: { borderBottomWidth: 1, borderBottomColor: theme.colors.border }, eventMain: { flexDirection: 'row', alignItems: 'center', gap: 11 }, eventCopy: { flex: 1 }, eventTitle: { fontFamily: 'Outfit_600SemiBold', fontSize: 14, color: theme.colors.text }, modelLabel: { fontFamily: 'Outfit_400Regular', fontSize: 9, color: theme.colors.textMuted, marginTop: 2 }, eventMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }, enabled: { fontFamily: 'Outfit_400Regular', fontSize: 10, color: theme.colors.success }, disabled: { fontFamily: 'Outfit_400Regular', fontSize: 10, color: theme.colors.textMuted }, expandRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingLeft: 53, paddingTop: 8 }, expandText: { fontFamily: 'Outfit_500Medium', fontSize: 11, color: theme.colors.textMuted }, detailBox: { backgroundColor: theme.colors.surfaceMuted, borderRadius: 14, padding: 12, marginTop: 9, marginLeft: 53 }, detailLabel: { fontFamily: 'Outfit_600SemiBold', fontSize: 11, color: theme.colors.text, marginBottom: 8, marginTop: 4 }, levelRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 10 }, levelChip: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: theme.colors.border }, levelChipSelected: { backgroundColor: '#4B66D6', borderColor: '#4B66D6' }, levelChipText: { fontFamily: 'Outfit_500Medium', fontSize: 10, color: theme.colors.textMuted }, levelChipSelectedText: { color: '#FFFFFF', fontFamily: 'Outfit_600SemiBold' }, switchLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5 }, switchText: { fontFamily: 'Outfit_500Medium', fontSize: 12, color: theme.colors.textMuted },
}));
