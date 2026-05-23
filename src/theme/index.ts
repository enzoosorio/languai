export const colors = {
  dark: {
    background: '#1A1F18',
    surface: 'rgba(42, 48, 38, 0.6)',
    surfaceSolid: '#252B21',
    text: '#F0EDE6',
    textMuted: '#8A9182',
    accent: '#5C6B4A',
    accentLight: '#7A8F65',
    danger: '#C0614A',
    success: '#4A7A55',
    border: 'rgba(255, 255, 255, 0.07)',
    blob: 'rgba(92, 107, 74, 0.07)',
  },
  light: {
    background: '#F2F0EB',
    surface: 'rgba(255, 253, 248, 0.75)',
    surfaceSolid: '#FAFAF7',
    text: '#1A1F18',
    textMuted: '#6B7265',
    accent: '#4A5C38',
    accentLight: '#5C7048',
    danger: '#B54A35',
    success: '#3A6644',
    border: 'rgba(0, 0, 0, 0.07)',
    blob: 'rgba(92, 107, 74, 0.06)',
  },
};

export const typography = {
  display: {
    fontFamily: 'PlusJakartaSans_200ExtraLight',
    letterSpacing: 1.5,
  },
  h1: {
    fontFamily: 'PlusJakartaSans_200ExtraLight',
    fontSize: 32,
    letterSpacing: 1.5,
  },
  h2: {
    fontFamily: 'DarkerGrotesque_700Bold',
    fontSize: 22,
    letterSpacing: 0.3,
  },
  h3: {
    fontFamily: 'DarkerGrotesque_600SemiBold',
    fontSize: 18,
    letterSpacing: 0.2,
  },
  body: {
    fontFamily: 'DarkerGrotesque_400Regular',
    fontSize: 16,
  },
  bodyMedium: {
    fontFamily: 'DarkerGrotesque_500Medium',
    fontSize: 16,
  },
  label: {
    fontFamily: 'DarkerGrotesque_600SemiBold',
    fontSize: 13,
    letterSpacing: 0.5,
  },
  caption: {
    fontFamily: 'DarkerGrotesque_400Regular',
    fontSize: 12,
  },
};

export type Colors = typeof colors.dark;
export type Typography = typeof typography;
