import { ReactNode, memo } from 'react';
import { SafeAreaView, View } from 'react-native';
import { styles } from '@/src/utils/screenStyles';
import { BottomNav } from './BottomNav';
import { NotificationBanner } from './NotificationBanner';

function AppShellComponent({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={{ flex: 1 }}>
        {children}
        <NotificationBanner />
        <BottomNav />
      </View>
    </SafeAreaView>
  );
}

export const AppShell = memo(AppShellComponent);
