import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import type { AttentionLevel } from '@/src/types/domain';
import { COLORS } from '@/src/utils/constants';

export function StatusPill({ value }: { value: AttentionLevel }) {
  return <View style={[styles.pill, { backgroundColor: `${COLORS[value]}18` }]}><View style={[styles.dot, { backgroundColor: COLORS[value] }]} /><Text style={[styles.text, { color: COLORS[value] }]}>{value.toUpperCase()}</Text></View>;
}

const styles = StyleSheet.create((theme) => ({
  pill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, paddingHorizontal: 9, paddingVertical: 5, borderRadius: theme.radius.pill },
  dot: { width: 6, height: 6, borderRadius: 3 },
  text: { fontFamily: 'Outfit_600SemiBold', fontSize: 10, letterSpacing: 0.5 },
}));
