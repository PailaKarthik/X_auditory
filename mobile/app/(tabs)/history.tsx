import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { AppShell } from '@/src/components/AppShell';
import { EventIcon } from '@/src/components/EventIcon';
import { StatusPill } from '@/src/components/StatusPill';
import { useApp } from '@/src/state/AppContext';
import { DIRECTION_LABELS } from '@/src/utils/constants';
import { styles as base } from '@/src/utils/screenStyles';

export default function HistoryScreen() {
  const { detections, stt, catalog } = useApp();
  const [tab, setTab] = useState<'all' | 'sounds' | 'stt'>('all');
  const soundItems = detections.length ? detections : [];
  const dateLabel = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const visibleSounds = useMemo(() => tab === 'stt' ? [] : soundItems, [tab, soundItems]);
  return <AppShell><ScrollView style={base.screen} contentContainerStyle={styles.content}><Text style={base.brand}>History</Text><Text style={base.eyebrow}>Detected sound and speech activity</Text>
    <View style={styles.tabs}>{(['all','sounds','stt'] as const).map((item) => <Pressable key={item} onPress={() => setTab(item)} style={[styles.tab, tab === item && styles.tabSelected]}><Text style={[styles.tabText, tab === item && styles.tabTextSelected]}>{item === 'stt' ? 'STT' : item[0].toUpperCase()+item.slice(1)}</Text></Pressable>)}</View>
    {(tab === 'all' || tab === 'sounds') && <><Text style={base.sectionTitle}>Sound Events</Text><View style={base.card}>{visibleSounds.length ? visibleSounds.map((item, index) => <Pressable key={item._id ?? index} onPress={() => router.push(`/event/${item._id ?? ''}`)} style={[styles.row, index < visibleSounds.length-1 && styles.divider]}><EventIcon event={catalog.find((e) => e.key === item.eventKey) ?? { icon: 'speech' }} size={40}/><View style={styles.copy}><Text style={styles.title}>{item.label}</Text><Text style={styles.meta}>{DIRECTION_LABELS[item.direction] ?? item.direction} · {dateLabel(item.createdAt)}</Text></View><StatusPill value={item.attention}/><MaterialCommunityIcons name="chevron-right" size={19} color="#A1A6A2"/></Pressable>) : <Text style={base.muted}>Your enabled sound events will appear here.</Text>}</View></>}
    {(tab === 'all' || tab === 'stt') && <><Text style={[base.sectionTitle, { marginTop: 22 }]}>Speech / STT</Text><View style={base.card}>{stt.length ? stt.map((item, index) => <Pressable key={item._id ?? index} style={[styles.sttRow, index < stt.length-1 && styles.divider]} onPress={() => router.push(`/conversation?record=${item._id ?? ''}`)}><View style={styles.sttIcon}><MaterialCommunityIcons name="microphone-message" size={18} color="#7A63D8"/></View><View style={styles.copy}><Text style={styles.title} numberOfLines={2}>{item.transcript}</Text><Text style={styles.meta}>{DIRECTION_LABELS[item.direction] ?? item.direction} · {dateLabel(item.createdAt)}</Text></View></Pressable>) : <Text style={base.muted}>No saved speech transcripts yet.</Text>}</View></>}
  </ScrollView></AppShell>;
}
const styles = StyleSheet.create((theme) => ({ content:{paddingHorizontal:20,paddingTop:10,paddingBottom:110},tabs:{flexDirection:'row',backgroundColor:'#EEF0ED',borderRadius:14,padding:4,marginTop:22,marginBottom:20},tab:{flex:1,paddingVertical:9,borderRadius:10,alignItems:'center'},tabSelected:{backgroundColor:'#FFFFFF',shadowColor:'#1E2521',shadowOpacity:0.05,shadowRadius:5,elevation:1},tabText:{fontFamily:'Outfit_500Medium',fontSize:11,color:theme.colors.textMuted},tabTextSelected:{fontFamily:'Outfit_600SemiBold',color:theme.colors.text},row:{flexDirection:'row',alignItems:'center',gap:10,paddingVertical:12},divider:{borderBottomWidth:1,borderBottomColor:theme.colors.border},copy:{flex:1},title:{fontFamily:'Outfit_600SemiBold',fontSize:13,color:theme.colors.text},meta:{fontFamily:'Outfit_400Regular',fontSize:10,color:theme.colors.textMuted,marginTop:4},sttRow:{flexDirection:'row',gap:11,paddingVertical:12},sttIcon:{width:40,height:40,borderRadius:13,backgroundColor:'#F1EEFF',alignItems:'center',justifyContent:'center'} }));
