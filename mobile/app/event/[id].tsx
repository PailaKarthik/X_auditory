import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { AppShell } from '@/src/components/AppShell';
import { EventIcon } from '@/src/components/EventIcon';
import { StatusPill } from '@/src/components/StatusPill';
import { useApp } from '@/src/state/AppContext';
import { DIRECTION_LABELS } from '@/src/utils/constants';
import { styles as base } from '@/src/utils/screenStyles';

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { detections, catalog } = useApp();
  const item = useMemo(() => detections.find((e) => e._id === id) ?? detections[0], [detections, id]);
  if (!item) return <AppShell><View style={styles.empty}><Text style={base.title}>Event not found</Text></View></AppShell>;
  const event = catalog.find((e) => e.key === item.eventKey);
  return <AppShell><ScrollView style={base.screen} contentContainerStyle={styles.content}>
    <Pressable onPress={() => router.back()} style={styles.back}><MaterialCommunityIcons name="arrow-left" size={20} color="#4B66D6"/><Text style={styles.backText}>Activity</Text></Pressable>
    <View style={styles.hero}><EventIcon event={event ?? { icon: 'speech' }} size={56}/><View style={{ flex: 1 }}><Text style={base.title}>{item.label}</Text><Text style={[base.muted,{marginTop:4}]}>Detected from {DIRECTION_LABELS[item.direction] ?? item.direction}</Text></View><StatusPill value={item.attention}/></View>
    <View style={base.card}><Detail label="Detected" value={new Date(item.createdAt).toLocaleString([], { hour:'numeric', minute:'2-digit', month:'short', day:'numeric' })}/><Detail label="Direction" value={DIRECTION_LABELS[item.direction] ?? item.direction}/><Detail label="Confidence" value={`${Math.round(item.confidence * 100)}%`}/><Detail label="Attention" value={item.attention}/><Detail label="Source" value={item.source === 'simulation' ? 'X simulation' : 'X Device'}/></View>
  </ScrollView></AppShell>;
}
function Detail({ label, value }: { label: string; value: string }) { return <View style={styles.detail}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{value}</Text></View>; }
const styles = StyleSheet.create((theme) => ({ content:{paddingHorizontal:20,paddingTop:10,paddingBottom:110}, back:{flexDirection:'row',alignItems:'center',gap:6,marginBottom:20}, backText:{fontFamily:'Outfit_600SemiBold',fontSize:13,color:'#4B66D6'}, hero:{flexDirection:'row',alignItems:'center',gap:13,marginBottom:22}, detail:{flexDirection:'row',justifyContent:'space-between',paddingVertical:13,borderBottomWidth:1,borderBottomColor:theme.colors.border}, label:{fontFamily:'Outfit_400Regular',fontSize:12,color:theme.colors.textMuted}, value:{fontFamily:'Outfit_600SemiBold',fontSize:12,color:theme.colors.text}, empty:{flex:1,alignItems:'center',justifyContent:'center'} }));
