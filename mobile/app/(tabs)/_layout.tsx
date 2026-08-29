import { Tabs } from 'expo-router';

export default function TabsLayout() {
  return (
    // The app draws its own BottomNav, so the navigator's tab bar is not rendered
    // at all. `tabBar: () => null` skips building it; hiding it with a style still
    // mounted and laid it out on every navigation.
    <Tabs screenOptions={{ headerShown: false, animation: 'none' }} tabBar={() => null}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="modes" />
      <Tabs.Screen name="history" />
      <Tabs.Screen name="device" />
    </Tabs>
  );
}
