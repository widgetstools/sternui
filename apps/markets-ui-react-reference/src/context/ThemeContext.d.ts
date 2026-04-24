import { type ReactNode } from 'react';
type Theme = 'dark' | 'light';
interface ThemeContextValue {
    theme: Theme;
    toggleTheme: () => void;
    isDark: boolean;
}
/**
 * ThemeProvider — wraps the app and manages the `[data-theme]` attribute
 * on `<html>`. Persists the choice in `localStorage` under key `theme`.
 *
 * When running inside OpenFin, it also subscribes to the `theme-changed`
 * InterApplicationBus topic so that clicking the dock's theme toggle
 * flips every window's theme in sync, not just the provider window.
 *
 * Pattern mirrors `fi-trading-reference` and is documented in
 * `packages/design-system/README.md`.
 */
export declare function ThemeProvider({ children }: {
    children: ReactNode;
}): import("react/jsx-runtime").JSX.Element;
export declare const useTheme: () => ThemeContextValue;
export {};
//# sourceMappingURL=ThemeContext.d.ts.map