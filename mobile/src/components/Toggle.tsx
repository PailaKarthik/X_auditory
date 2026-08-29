import { Pressable, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

export function Toggle({ value, onChange }: { value: boolean; onChange: (next: boolean) => void }) {
  return <Pressable accessibilityRole="switch" accessibilityState={{ checked: value }} onPress={() => onChange(!value)} style={[styles.track, value && styles.trackOn]}><View style={[styles.thumb, value && styles.thumbOn]} /></Pressable>;
}
const styles = StyleSheet.create((theme) => ({
  track: { width: 46, height: 28, borderRadius: 16, backgroundColor: '#D7DAD7', padding: 3, justifyContent: 'center' },
  trackOn: { backgroundColor: theme.colors.primary }, thumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#FFFFFF' }, thumbOn: { alignSelf: 'flex-end' },
}));
