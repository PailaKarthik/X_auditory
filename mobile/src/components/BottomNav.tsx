import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import { memo, useCallback } from 'react';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

const items = [
  { href: '/', label: 'Home', icon: 'home-variant-outline', activeIcon: 'home-variant' },
  { href: '/modes', label: 'Modes', icon: 'tune-variant', activeIcon: 'tune' },
  { href: '/history', label: 'History', icon: 'history', activeIcon: 'history' },
  { href: '/device', label: 'Device', icon: 'watch-variant', activeIcon: 'watch-variant' },
] as const;

function BottomNavComponent() {
  const pathname = usePathname();
  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  // `navigate` reuses the already-mounted tab screen. The previous `replace` tore
  // the target screen down and rebuilt it on every tap, which is what made tab
  // switching take seconds.
  const go = useCallback(
    (href: (typeof items)[number]['href']) => () => {
      if (isActive(href)) return;
      router.navigate(href);
    },
    [pathname],
  );

  return (
    <View style={styles.bar}>
      {items.map((item) => {
        const active = isActive(item.href);
        return (
          <Pressable
            key={item.href}
            onPress={go(item.href)}
            style={styles.item}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            <MaterialCommunityIcons
              name={(active ? item.activeIcon : item.icon) as keyof typeof MaterialCommunityIcons.glyphMap}
              size={21}
              color={active ? '#4B66D6' : '#8A8E8A'}
            />
            <Text style={[styles.label, active && styles.labelActive]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export const BottomNav = memo(BottomNavComponent);

const styles = StyleSheet.create((theme) => ({
  bar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 82,
    paddingBottom: 16,
    paddingTop: 10,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  label: { fontFamily: 'Outfit_500Medium', fontSize: 11, color: '#8A8E8A' },
  labelActive: { color: '#4B66D6', fontFamily: 'Outfit_600SemiBold' },
}));
