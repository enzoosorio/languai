import { useThemeStore } from '../stores/themeStore';
import { colors, typography } from '../theme';

export const useTheme = () => {
  const isDark = useThemeStore((state) => state.isDark);
  const themeColors = isDark ? colors.dark : colors.light;
  
  return {
    isDark,
    colors: themeColors,
    typography,
  };
};