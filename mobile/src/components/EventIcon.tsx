import { MaterialCommunityIcons } from '@expo/vector-icons';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import type { EventDefinition } from '@/src/types/domain';

const iconMap: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  baby: 'baby-face-outline', train: 'train', fire: 'fire-alert', siren: 'alarm-light-outline', horn: 'bullhorn-outline', motorcycle: 'motorbike', doorbell: 'doorbell', knock: 'door-open', dog: 'dog-side', thunder: 'weather-lightning', rain: 'weather-rainy', glass: 'glass-fragile', vehicle: 'car-outline', bike: 'bike', alarm: 'alarm-light-outline', announcement: 'bullhorn-variant-outline', speech: 'message-text-outline', name: 'account-voice',
};

export function EventIcon({ event, size=42 }: { event: EventDefinition | { icon: string }; size?: number }) {
  return <View style={[styles.box, { width: size, height: size, borderRadius: size * 0.35 }]}><MaterialCommunityIcons name={iconMap[event.icon] ?? 'waveform'} size={size * 0.52} color="#4B66D6" /></View>;
}

const styles = StyleSheet.create((theme) => ({ box: { backgroundColor: theme.colors.primarySoft, alignItems: 'center', justifyContent: 'center' } }));
