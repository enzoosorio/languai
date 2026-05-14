import React, { useRef } from 'react';
import { StyleSheet, View, SafeAreaView, StatusBar } from 'react-native';
import PagerView from 'react-native-pager-view';
import { useTheme } from './src/hooks/useTheme';
import { useThemeStore } from './src/stores/themeStore';

import { HomeScreen } from './src/screens/HomeScreen';
import { RoleplayScreen } from './src/screens/RoleplayScreen';
import { SRSScreen } from './src/screens/SRSScreen';

export default function App() {
  const pagerRef = useRef<PagerView>(null);
  const { isDark, colors } = useTheme();
  const toggleTheme = useThemeStore((state) => state.toggleTheme);

  const goToPage = (pageIndex: number) => {
    pagerRef.current?.setPage(pageIndex);
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      
      <PagerView style={styles.pagerView} initialPage={1} ref={pagerRef}>
        <View key="0" style={styles.page}>
          <RoleplayScreen onNavigateHome={() => goToPage(1)} />
        </View>
        <View key="1" style={styles.page}>
          <HomeScreen
            onNavigateRoleplay={() => goToPage(0)}
            onNavigateSRS={() => goToPage(2)}
            onToggleTheme={toggleTheme}
          />
        </View>
        <View key="2" style={styles.page}>
          <SRSScreen onNavigateHome={() => goToPage(1)} />
        </View>
      </PagerView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  pagerView: {
    flex: 1,
  },
  page: {
    flex: 1,
  },
});
