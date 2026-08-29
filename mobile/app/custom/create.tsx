import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { AppShell } from '@/src/components/AppShell';
import { Toggle } from '@/src/components/Toggle';
import { useApp } from '@/src/state/AppContext';
import type { AttentionLevel } from '@/src/types/domain';
import { styles as base } from '@/src/utils/screenStyles';

export default function CreateCustomModeScreen() {
  const { catalog, createCustomMode } = useApp();
  const [name, setName] = useState('');
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [attention, setAttention] = useState<Record<string, AttentionLevel>>({});
  const [saving, setSaving] = useState(false);
  const selected = useMemo(() => catalog.filter((event) => enabled[event.key]), [catalog, enabled]);

  const create = async () => {
    if (!name.trim()) { Alert.alert('Name required', 'Give your custom profile a name.'); return; }
    setSaving(true);
    try {
      await createCustomMode(name, selected.map((event) => ({ eventKey: event.key, enabled: true, attention: attention[event.key] ?? event.defaultAttention })));
      router.replace('/modes');
    } catch (error) { Alert.alert('Could not create profile', error instanceof Error ? error.message : 'Try again.'); }
    finally { setSaving(false); }
  };

  return <AppShell><ScrollView style={base.screen} contentContainerStyle={styles.content}><Pressable onPress={() => router.back()} style={styles.back}><MaterialCommunityIcons name="arrow-left" size={20} color="#4B66D6"/><Text style={styles.backText}>Modes</Text></Pressable><Text style={base.title}>Create Custom Mode</Text><Text style={[base.muted, { marginTop: 5, marginBottom: 22 }]}>Build a profile with only the sounds you want X to monitor.</Text>
    <Text style={styles.label}>Mode name</Text><TextInput value={name} onChangeText={setName} placeholder="e.g. Bus Journey" placeholderTextColor="#A4A8A5" style={styles.input} />
    <Text style={[base.sectionTitle, { marginTop: 24 }]}>Select events</Text>
    <Text style={[base.muted, { marginBottom: 10, marginTop: -4 }]}>{selected.length} selected. Only these will notify you while this profile is active.</Text>
    <View style={base.card}>{catalog.map((event, index) => { const on = !!enabled[event.key]; const selectedAttention = attention[event.key] ?? event.defaultAttention; return <View key={event.key} style={[styles.event, index !== catalog.length - 1 && styles.divider]}><View style={styles.eventMain}><View style={styles.icon}><MaterialCommunityIcons name="waveform" size={18} color="#4B66D6"/></View><View style={{ flex: 1 }}><Text style={styles.eventTitle}>{event.label}</Text><Text style={styles.eventCategory}>{event.category} · {event.modelLabel}</Text></View><Toggle value={on} onChange={(next) => setEnabled((prev) => ({ ...prev, [event.key]: next }))}/></View>{on && <View style={styles.attention}><Text style={styles.attentionLabel}>Attention</Text>{(['critical','high','medium','low'] as AttentionLevel[]).map((level) => <Pressable key={level} onPress={() => setAttention((prev) => ({ ...prev, [event.key]: level }))} style={[styles.chip, selectedAttention === level && styles.chipSelected]}><Text style={[styles.chipText, selectedAttention === level && styles.chipSelectedText]}>{level}</Text></Pressable>)}</View>}</View>})}</View>
    <Pressable disabled={saving} onPress={() => void create()} style={styles.save}><Text style={styles.saveText}>{saving ? 'Creating…' : 'Create Profile'}</Text></Pressable>
  </ScrollView></AppShell>;
}
const styles = StyleSheet.create((theme) => ({ content: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 110 }, back: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 }, backText: { fontFamily: 'Outfit_600SemiBold', fontSize: 13, color: '#4B66D6' }, label: { fontFamily: 'Outfit_600SemiBold', fontSize: 12, color: theme.colors.text, marginBottom: 7 }, input: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: theme.colors.border, borderRadius: 14, paddingHorizontal: 14, height: 48, fontFamily: 'Outfit_400Regular', fontSize: 14, color: theme.colors.text }, event: { paddingVertical: 13 }, divider: { borderBottomWidth: 1, borderBottomColor: theme.colors.border }, eventMain: { flexDirection: 'row', alignItems: 'center', gap: 10 }, icon: { width: 40, height: 40, borderRadius: 13, backgroundColor: '#EEF1FF', alignItems: 'center', justifyContent: 'center' }, eventTitle: { fontFamily: 'Outfit_600SemiBold', fontSize: 13, color: theme.colors.text }, eventCategory: { fontFamily: 'Outfit_400Regular', fontSize: 10, color: theme.colors.textMuted, marginTop: 3 }, attention: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 50, marginTop: 8, flexWrap: 'wrap' }, attentionLabel: { fontFamily: 'Outfit_500Medium', fontSize: 10, color: theme.colors.textMuted, marginRight: 2 }, chip: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 999, backgroundColor: '#FFFFFF', paddingHorizontal: 8, paddingVertical: 5 }, chipSelected: { backgroundColor: '#4B66D6', borderColor: '#4B66D6' }, chipText: { fontFamily: 'Outfit_500Medium', fontSize: 9, color: theme.colors.textMuted }, chipSelectedText: { color: '#FFFFFF', fontFamily: 'Outfit_600SemiBold' }, save: { height: 50, borderRadius: 16, backgroundColor: '#4B66D6', alignItems: 'center', justifyContent: 'center', marginTop: 20 }, saveText: { fontFamily: 'Outfit_700Bold', color: '#FFFFFF', fontSize: 14 },
}));
