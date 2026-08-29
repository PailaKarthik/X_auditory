import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { memo, useEffect, useRef } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { useApp } from '@/src/state/AppContext';
import { COLORS, DIRECTION_LABELS } from '@/src/utils/constants';

const VISIBLE_MS = 5_000;

/**
 * In-app alert for a new detection.
 *
 * It only ever appears for events the *active* mode has switched on and whose
 * phone-notification delivery is enabled: the server persists nothing else, and
 * AppContext filters on `phoneNotification` before raising one.
 */
function NotificationBannerComponent() {
  const { notification, dismissNotification, catalog } = useApp();
  const slide = useRef(new Animated.Value(-140)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    if (!notification) {
      Animated.timing(slide, { toValue: -140, duration: 180, useNativeDriver: true }).start();
      return;
    }

    Animated.spring(slide, { toValue: 0, useNativeDriver: true, damping: 18, stiffness: 160 }).start();
    timerRef.current = setTimeout(dismissNotification, VISIBLE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [notification, dismissNotification, slide]);

  if (!notification) return null;

  const definition = catalog.find((entry) => entry.key === notification.eventKey);
  const accent = COLORS[notification.attention] ?? COLORS.medium;

  const open = () => {
    dismissNotification();
    if (notification._id) router.push(`/event/${notification._id}`);
  };

  return (
    <Animated.View style={[styles.wrap, { transform: [{ translateY: slide }] }]} pointerEvents="box-none">
      <Pressable style={[styles.card, { borderLeftColor: accent }]} onPress={open} accessibilityRole="alert">
        <View style={[styles.icon, { backgroundColor: `${accent}1A` }]}>
          <MaterialCommunityIcons name="bell-ring-outline" size={19} color={accent} />
        </View>
        <View style={styles.copy}>
          <Text style={styles.title} numberOfLines={1}>
            {definition?.label ?? notification.label}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {DIRECTION_LABELS[notification.direction] ?? notification.direction} ·{' '}
            {Math.round(notification.confidence * 100)}% · {notification.modeName ?? notification.mode ?? 'X'}
          </Text>
        </View>
        <Pressable onPress={dismissNotification} hitSlop={10} style={styles.close}>
          <MaterialCommunityIcons name="close" size={17} color="#8D928E" />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

export const NotificationBanner = memo(NotificationBannerComponent);

const styles = StyleSheet.create((theme) => ({
  wrap: { position: 'absolute', top: 8, left: 14, right: 14, zIndex: 50 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderLeftWidth: 4,
    paddingVertical: 12,
    paddingHorizontal: 13,
    shadowColor: theme.colors.shadow,
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  icon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1 },
  title: { fontFamily: 'Outfit_700Bold', fontSize: 14, color: theme.colors.text },
  meta: { fontFamily: 'Outfit_400Regular', fontSize: 11, color: theme.colors.textMuted, marginTop: 3 },
  close: { padding: 3 },
}));
