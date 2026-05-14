export const colors = {
  dark: {
    background: '#0F172A', // slate-900
    surface: 'rgba(30, 41, 59, 0.7)', // slate-800 mostly transparent
    surfaceSolid: '#1E293B',
    text: '#F8FAFC', // slate-50
    textMuted: '#94A3B8', // slate-400
    primary: '#3B82F6', // blue-500
    secondary: '#8B5CF6', // violet-500
    danger: '#EF4444',
    success: '#10B981',
    border: 'rgba(255, 255, 255, 0.1)',
  },
  light: {
    background: '#F8FAFC',
    surface: 'rgba(255, 255, 255, 0.7)',
    surfaceSolid: '#FFFFFF',
    text: '#0F172A',
    textMuted: '#64748B',
    primary: '#2563EB',
    secondary: '#7C3AED',
    danger: '#DC2626',
    success: '#059669',
    border: 'rgba(0, 0, 0, 0.1)',
  }
};

export const typography = {
  // Configuración base de fuentes que luego podemos extender si usamos fuentes custom
  h1: 'text-3xl font-bold',
  h2: 'text-2xl font-semibold',
  h3: 'text-xl font-medium',
  body: 'text-base font-normal',
  caption: 'text-sm font-normal',
};