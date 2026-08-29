import { StyleSheet } from 'react-native-unistyles';

export const styles = StyleSheet.create((theme) => ({
  boot: { flex: 1, backgroundColor: theme.colors.background },
  screen: { flex: 1, backgroundColor: theme.colors.background },
  scroll: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 120 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  brand: { fontFamily: 'Outfit_700Bold', fontSize: 24, color: theme.colors.text, letterSpacing: -0.5 },
  eyebrow: { fontFamily: 'Outfit_500Medium', fontSize: 12, color: theme.colors.textMuted, marginTop: 3 },
  iconButton: { width: 42, height: 42, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 20, padding: 16, shadowColor: theme.colors.shadow, shadowOpacity: 0.06, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 2 },
  sectionTitle: { fontFamily: 'Outfit_600SemiBold', fontSize: 17, color: theme.colors.text, marginBottom: 10 },
  muted: { fontFamily: 'Outfit_400Regular', fontSize: 13, color: theme.colors.textMuted },
  title: { fontFamily: 'Outfit_700Bold', fontSize: 30, lineHeight: 36, color: theme.colors.text, letterSpacing: -0.7 },
}));
