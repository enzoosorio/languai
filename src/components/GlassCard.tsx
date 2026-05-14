import React from 'react';
import { View, ViewProps, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { useTheme } from '../hooks/useTheme';

interface GlassCardProps extends ViewProps {
  intensity?: number;
  className?: string; // Para compatibilidad con className wrapper de ser necesario
}

export const GlassCard: React.FC<GlassCardProps> = ({ 
  children, 
  style, 
  intensity = 20,
  ...props 
}) => {
  const { isDark, colors } = useTheme();

  return (
    <View style={[styles.container, { borderColor: colors.border }, style]} {...props}>
      <BlurView
        intensity={intensity}
        tint={isDark ? 'dark' : 'light'}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={[styles.content, { backgroundColor: colors.surface }]}>
        {children}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
  },
  content: {
    flex: 1,
    padding: 20,
  },
});