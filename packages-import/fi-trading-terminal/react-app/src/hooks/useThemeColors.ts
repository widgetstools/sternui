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
      bg: get('--bn-bg') || (isDark ? '#0a0e14' : '#f3f5f9'),
      bg1: get('--bn-bg1') || (isDark ? '#121820' : '#fbfcfd'),
      bg2: get('--bn-bg2') || (isDark ? '#1a212b' : '#ebeef3'),
      bg3: get('--bn-bg3') || (isDark ? '#242c38' : '#dde2ea'),
      border: get('--bn-border') || (isDark ? '#2e3744' : '#d9dee8'),
      border2: get('--bn-border2') || (isDark ? '#323b49' : '#c3cad7'),
      t0: get('--bn-t0') || (isDark ? '#e6e9ef' : '#1a1f2e'),
      t1: get('--bn-t1') || (isDark ? '#a7b0bd' : '#4f5665'),
      t2: get('--bn-t2') || '#6b7280',
      t3: get('--bn-t3') || (isDark ? '#4d586a' : '#9ca3af'),
      green: get('--bn-green') || (isDark ? '#14d9a0' : '#0ea870'),
      red: get('--bn-red') || (isDark ? '#ff4d6d' : '#e02e47'),
      amber: get('--bn-amber') || (isDark ? '#ff8c42' : '#e86a1c'),
      blue: get('--bn-blue') || (isDark ? '#3b82f6' : '#2563eb'),
      cyan: get('--bn-cyan') || (isDark ? '#22d3ee' : '#06b6d4'),
      gridLine: isDark ? '#1a212b' : '#ebeef3',
      isDark,
    };
  }, [isDark]);
}
