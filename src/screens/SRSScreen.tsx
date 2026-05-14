import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { GlassCard } from '../components/GlassCard';

interface Props {
  onNavigateHome: () => void;
}

export const SRSScreen: React.FC<Props> = ({ onNavigateHome }) => {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <GlassCard intensity={40} style={styles.card}>
        <Text style={[styles.title, { color: colors.text }]}>SRS Practice</Text>
        <Text style={{ color: colors.textMuted, marginBottom: 20 }}>
          Review your mistakes and learned vocabulary here.
        </Text>
        
        {/* Fallback button back to Home */}
        <TouchableOpacity 
          style={[styles.fallbackBtn, { backgroundColor: colors.surfaceSolid }]}
          onPress={onNavigateHome}
        >
          <Text style={{ color: colors.text }}>← Back to Home</Text>
        </TouchableOpacity>
      </GlassCard>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    flex: 1,
    maxHeight: '80%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  fallbackBtn: {
    marginTop: 40,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)'
  }
});