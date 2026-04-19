import { useMemo } from 'react';
import { useTheme } from '@/context/ThemeContext';

export function useThemeColors() {
  const { isDark } = useTheme();

  return useMemo(() => {
    const get = (name: string) =>
      getComputedStyle(document.documentElement).getPropertyValue(name).trim();

    // Fallbacks mirror the new design-system palette (fi-dark.css / fi-light.css).
    // Renamed `yellow` → `amber` to reflect the burnt-copper warning hue.
    return {
      bg: get('--bn-bg') || (isDark ? '#0a0e14' : '#f5f3ed'),
      bg1: get('--bn-bg1') || (isDark ? '#121820' : '#fbfaf6'),
      bg2: get('--bn-bg2') || (isDark ? '#1a212b' : '#edeae1'),
      bg3: get('--bn-bg3') || (isDark ? '#242c38' : '#e1ddd1'),
      border: get('--bn-border') || (isDark ? '#2e3744' : '#dfdbd1'),
      border2: get('--bn-border2') || (isDark ? '#323b49' : '#cbc6ba'),
      t0: get('--bn-t0') || (isDark ? '#e6e9ef' : '#2a2d31'),
      t1: get('--bn-t1') || (isDark ? '#a7b0bd' : '#575b62'),
      t2: get('--bn-t2') || '#757982',
      t3: get('--bn-t3') || (isDark ? '#4d586a' : '#a8abb0'),
      green: get('--bn-green') || (isDark ? '#3dbfa0' : '#1f8c6e'),
      red: get('--bn-red') || (isDark ? '#e56464' : '#b8463f'),
      amber: get('--bn-amber') || (isDark ? '#c97b3f' : '#8a4e1d'),
      blue: get('--bn-blue') || (isDark ? '#6ba4e8' : '#2f6fb3'),
      cyan: get('--bn-cyan') || (isDark ? '#7db4e3' : '#4a8cc4'),
      gridLine: isDark ? '#1a212b' : '#edeae1',
      isDark,
    };
  }, [isDark]);
}
