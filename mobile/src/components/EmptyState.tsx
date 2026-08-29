import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

export function EmptyState({ icon='sparkles-outline', title, body }: { icon?: keyof typeof Ionicons.glyphMap; title: string; body: string }) {
  return <View style={styles.wrap}><View style={styles.icon}><Ionicons name={icon} size={22} color="#4B66D6" /></View><Text style={styles.title}>{title}</Text><Text style={styles.body}>{body}</Text></View>;
}
const styles = StyleSheet.create((theme) => ({
  wrap: { alignItems: 'center', paddingVertical: 28, paddingHorizontal: 20 },
  icon: { width: 48, height: 48, borderRadius: 16, backgroundColor: theme.colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  title: { fontFamily: 'Outfit_600SemiBold', fontSize: 16, color: theme.colors.text, marginBottom: 4 },
  body: { fontFamily: 'Outfit_400Regular', fontSize: 13, color: theme.colors.textMuted, textAlign: 'center', lineHeight: 20 },
}));
